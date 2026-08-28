import { normalizePublication } from "./normalize.ts";
import type { DjenSearch, SearchResult } from "./types.ts";
import type { ProviderSearchOptions } from "../providers/publication-provider.ts";

const PAGE_SIZE = 100;
const RETRY_DELAY_MS = 60_000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 30_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Fetch = typeof fetch;

type ClientOptions = {
  baseUrl?: string;
  fetch?: Fetch;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
};

type ApiPage = {
  count: number;
  items: unknown[];
};

function isDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function normalizeSearch(search: DjenSearch): DjenSearch {
  const normalized = {
    ...search,
    oab: search.oab.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
    uf: search.uf.trim().toUpperCase(),
    tribunal: search.tribunal?.trim().toUpperCase() || undefined,
  };

  if (!normalized.oab || !/\d/.test(normalized.oab)) throw new Error("Informe o número da OAB.");
  if (!/^[A-Z]{2}$/.test(normalized.uf)) throw new Error("Informe uma UF válida.");
  if (!isDate(normalized.startDate) || !isDate(normalized.endDate)) {
    throw new Error("Use datas no formato AAAA-MM-DD.");
  }
  if (normalized.startDate > normalized.endDate) {
    throw new Error("A data inicial não pode ser posterior à data final.");
  }

  return normalized;
}

function parsePage(value: unknown): ApiPage {
  if (value === null || typeof value !== "object") {
    throw new Error("A API do DJEN retornou uma resposta inválida.");
  }

  const response = value as Record<string, unknown>;
  if (typeof response.count !== "number" || !Array.isArray(response.items)) {
    throw new Error("A resposta do DJEN não contém count e items válidos.");
  }

  return { count: response.count, items: response.items };
}

function headerNumber(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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

export class DjenClient {
  readonly #baseUrl: string;
  readonly #fetch: Fetch;
  readonly #sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly #retries: number;
  readonly #timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? sleep;
    this.#retries = options.retries ?? MAX_RETRIES;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async search(search: DjenSearch, options: ProviderSearchOptions = {}): Promise<SearchResult> {
    const input = normalizeSearch(search);
    const publications = [];
    let page = 1;
    let total = 0;
    let rateLimit: SearchResult["rateLimit"] = {};

    do {
      options.signal?.throwIfAborted();
      const response = await this.#request(input, page, options.signal);
      const payload = parsePage(await response.json());
      total = payload.count;
      rateLimit = {
        limit: headerNumber(response.headers, "x-ratelimit-limit"),
        remaining: headerNumber(response.headers, "x-ratelimit-remaining"),
      };
      publications.push(...payload.items.map(normalizePublication));
      options.onProgress?.({ page, fetched: publications.length, total });

      if (payload.items.length === 0 || publications.length >= total) break;
      page += 1;
    } while (true);

    return { total, publications, rateLimit };
  }

  async #request(search: DjenSearch, page: number, signal?: AbortSignal): Promise<Response> {
    const url = new URL(this.#baseUrl);
    url.search = new URLSearchParams({
      numeroOab: search.oab,
      ufOab: search.uf,
      dataDisponibilizacaoInicio: search.startDate,
      dataDisponibilizacaoFim: search.endDate,
      meio: "D",
      pagina: String(page),
      itensPorPagina: String(PAGE_SIZE),
    }).toString();
    if (search.tribunal) url.searchParams.set("siglaTribunal", search.tribunal);

    for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(this.#timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await this.#fetch(url, {
        headers: { Accept: "application/json" },
        signal: requestSignal,
      });
      if (response.status !== 429) {
        if (!response.ok) throw new Error(`A API do DJEN respondeu com HTTP ${response.status}.`);
        return response;
      }

      if (attempt === this.#retries) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      await this.#sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAY_MS,
        signal,
      );
    }

    throw new Error("A API do DJEN limitou as consultas. Tente novamente em alguns minutos.");
  }
}
