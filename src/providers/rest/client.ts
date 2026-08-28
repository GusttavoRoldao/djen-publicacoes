import type { DjenSearch, SearchResult } from "../../djen/types.ts";
import type { ProviderSearchOptions } from "../publication-provider.ts";
import { mapPage } from "./mapper.ts";
import type { RestProviderConfig } from "./types.ts";

const RETRY_DELAY_MS = 60_000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 500;

export type RestTransportRequest = {
  provider: string;
  url: string;
  method: string;
  headers: [string, string][];
  authMode: string;
  authName?: string;
  timeoutMs: number;
};

export type RestTransportResponse = {
  status: number;
  body: string;
  retryAfter?: number;
};

/** O transporte é o comando nativo: a chave da fonte nunca passa por aqui. */
export type RestTransport = (request: RestTransportRequest) => Promise<RestTransportResponse>;

type ClientOptions = {
  transport: RestTransport;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
};

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

export class RestClient {
  readonly #config: RestProviderConfig;
  readonly #transport: RestTransport;
  readonly #sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly #retries: number;
  readonly #timeoutMs: number;

  constructor(config: RestProviderConfig, options: ClientOptions) {
    this.#config = config;
    this.#transport = options.transport;
    this.#sleep = options.sleep ?? sleep;
    this.#retries = options.retries ?? MAX_RETRIES;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async search(search: DjenSearch, options: ProviderSearchOptions = {}): Promise<SearchResult> {
    const publications = [];
    let page = this.#config.firstPage;
    let total = 0;
    let fetchedPages = 0;

    do {
      options.signal?.throwIfAborted();
      const payload = await this.#request(search, page, options.signal);
      const mapped = mapPage(payload, this.#config.mapping, this.#config.id);
      total = mapped.total ?? publications.length + mapped.items.length;
      publications.push(...mapped.items);
      options.onProgress?.({ page: fetchedPages + 1, fetched: publications.length, total });

      fetchedPages += 1;
      // Sem `total` mapeado, o fim é uma página menor que o tamanho pedido.
      const lastPage = mapped.total === undefined
        ? mapped.items.length < this.#config.pageSize
        : publications.length >= mapped.total;
      if (mapped.items.length === 0 || lastPage || fetchedPages >= MAX_PAGES) break;
      page += 1;
    } while (true);

    return { total, publications, rateLimit: {} };
  }

  #url(search: DjenSearch, page: number): string {
    const url = new URL(this.#config.baseUrl);
    const { query } = this.#config;
    url.searchParams.set(query.oab, search.oab);
    url.searchParams.set(query.uf, search.uf);
    url.searchParams.set(query.startDate, search.startDate);
    url.searchParams.set(query.endDate, search.endDate);
    if (query.tribunal && search.tribunal) url.searchParams.set(query.tribunal, search.tribunal);
    if (query.page) url.searchParams.set(query.page, String(page));
    if (query.pageSize) url.searchParams.set(query.pageSize, String(this.#config.pageSize));
    for (const parameter of this.#config.extraParams) {
      if (parameter.name) url.searchParams.set(parameter.name, parameter.value);
    }
    return url.toString();
  }

  async #request(search: DjenSearch, page: number, signal?: AbortSignal): Promise<unknown> {
    const request: RestTransportRequest = {
      provider: this.#config.id,
      url: this.#url(search, page),
      method: this.#config.method,
      headers: this.#config.headers.filter((header) => header.name).map((header) => [header.name, header.value]),
      authMode: this.#config.authMode,
      authName: this.#config.authName,
      timeoutMs: this.#timeoutMs,
    };

    for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
      signal?.throwIfAborted();
      const response = await this.#transport(request);
      if (response.status !== 429) {
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`A fonte ${this.#config.name} respondeu com HTTP ${response.status}.`);
        }
        try {
          return JSON.parse(response.body);
        } catch {
          throw new Error(`A fonte ${this.#config.name} não devolveu JSON válido.`);
        }
      }

      if (attempt === this.#retries) break;
      const retryAfter = response.retryAfter;
      await this.#sleep(retryAfter && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAY_MS, signal);
    }

    throw new Error(`A fonte ${this.#config.name} limitou as consultas. Tente novamente em alguns minutos.`);
  }
}
