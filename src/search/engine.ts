import type { PublicationProvider } from "../providers/publication-provider.ts";
import type { Publication } from "../djen/types.ts";
import { publicationKey } from "./repository.ts";
import type {
  ManualSearchInput,
  ManualSearchProgress,
  SavedSearch,
  SearchSegment,
  SearchStorage,
} from "./types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_CHUNK_DAYS = 7;
const DJEN_RESULT_LIMIT = 10_000;

type RunOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: ManualSearchProgress) => void;
};

type EngineOptions = {
  chunkDays?: number;
  resultLimit?: number;
  today?: () => Date;
};

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error("Informe as duas datas corretamente.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || !date.toISOString().startsWith(value)) {
    throw new Error("Informe as duas datas corretamente.");
  }
  return date;
}

function dateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function splitDateRange(startDate: string, endDate: string, days = DEFAULT_CHUNK_DAYS): Omit<SearchSegment, "profile">[] {
  const end = parseDate(endDate);
  const segments = [];
  for (let start = parseDate(startDate); start <= end; start = addDays(start, days)) {
    const segmentEnd = addDays(start, days - 1);
    segments.push({ startDate: dateValue(start), endDate: dateValue(segmentEnd < end ? segmentEnd : end) });
  }
  return segments;
}

function splitInHalf(segment: SearchSegment): SearchSegment[] {
  const start = parseDate(segment.startDate);
  const end = parseDate(segment.endDate);
  const distance = Math.floor((end.valueOf() - start.valueOf()) / 86_400_000);
  const firstEnd = addDays(start, Math.floor(distance / 2));
  return [
    { ...segment, endDate: dateValue(firstEnd) },
    { ...segment, startDate: dateValue(addDays(firstEnd, 1)) },
  ];
}

export function searchErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "TimeoutError") {
    return "O DJEN demorou mais de 30 segundos para responder. Tente novamente.";
  }
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/HTTP 403/.test(message)) {
    return "O DJEN recusou esta conexão. Desative VPN ou proxy com rota internacional e tente novamente.";
  }
  if (/HTTP 5\d\d/.test(message)) {
    return "O DJEN está indisponível no momento. Nenhum resultado parcial foi salvo.";
  }
  if (reason instanceof TypeError || /fetch|network|internet|conex[aã]o|sending request|failed to send|dns|tcp/i.test(message)) {
    return "Não foi possível conectar ao DJEN. Verifique sua internet e tente novamente.";
  }
  return message || "Não foi possível concluir a pesquisa.";
}

export class ManualSearchEngine {
  private readonly provider: PublicationProvider;
  private readonly storage: SearchStorage;
  private readonly chunkDays: number;
  private readonly resultLimit: number;
  private readonly today: () => Date;

  constructor(
    provider: PublicationProvider,
    storage: SearchStorage,
    options: EngineOptions = {},
  ) {
    this.provider = provider;
    this.storage = storage;
    this.chunkDays = options.chunkDays ?? DEFAULT_CHUNK_DAYS;
    this.resultLimit = options.resultLimit ?? DJEN_RESULT_LIMIT;
    this.today = options.today ?? (() => new Date());
  }

  async run(input: ManualSearchInput, options: RunOptions = {}): Promise<SavedSearch> {
    const normalized = this.normalize(input);
    const segments = normalized.profiles.flatMap((profile) => (
      splitDateRange(normalized.startDate, normalized.endDate, this.chunkDays)
        .map((period) => ({ profile, ...period }))
    ));
    const collected = new Map<string, Publication>();
    const warnings: string[] = [];
    let completedSegments = 0;

    for (let index = 0; index < segments.length;) {
      options.signal?.throwIfAborted();
      const segment = segments[index];
      if (!segment) break;
      const result = await this.provider.search({
        oab: segment.profile.oabNumber,
        uf: segment.profile.oabUf,
        startDate: segment.startDate,
        endDate: segment.endDate,
        tribunal: normalized.tribunal,
      }, {
        signal: options.signal,
        onProgress: (progress) => options.onProgress?.({
          phase: "searching",
          completedSegments,
          totalSegments: segments.length,
          profileName: segment.profile.name,
          startDate: segment.startDate,
          endDate: segment.endDate,
          collected: collected.size,
          ...progress,
        }),
      });

      if (result.total >= this.resultLimit && segment.startDate !== segment.endDate) {
        segments.splice(index, 1, ...splitInHalf(segment));
        continue;
      }

      if (result.total >= this.resultLimit) {
        warnings.push(`${segment.startDate}: o DJEN atingiu 10.000 resultados para ${segment.profile.name}. Refine por tribunal.`);
      }
      for (const publication of result.publications) {
        collected.set(publicationKey(publication), publication);
      }
      completedSegments += 1;
      index += 1;
    }

    options.signal?.throwIfAborted();
    const lastSegment = segments.at(-1);
    options.onProgress?.({
      phase: "saving",
      completedSegments,
      totalSegments: segments.length,
      profileName: lastSegment?.profile.name ?? "",
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      page: 0,
      fetched: collected.size,
      total: collected.size,
      collected: collected.size,
    });
    return this.storage.save({ ...normalized, publications: [...collected.values()], warnings }, options.signal);
  }

  private normalize(input: ManualSearchInput): ManualSearchInput {
    if (input.profiles.length === 0) throw new Error("Selecione pelo menos uma OAB.");
    parseDate(input.startDate);
    parseDate(input.endDate);
    if (input.startDate > input.endDate) throw new Error("A data inicial não pode ser posterior à data final.");
    if (input.endDate > localDateValue(this.today())) throw new Error("Não é possível pesquisar datas futuras.");
    return {
      ...input,
      tribunal: input.tribunal?.trim().toUpperCase() || undefined,
    };
  }
}
