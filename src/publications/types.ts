export type ReviewStatus = "unchecked" | "checked" | "discarded";

export type PublicationOrder = "recent" | "oldest";

export type PublicationAttorney = {
  name: string;
  oabNumber: string;
  oabUf: string;
};

export type PublicationRecipient = {
  name: string;
  role?: string;
};

export type PublicationSummary = {
  id: number;
  availableOn: string;
  tribunal: string;
  communicationType: string;
  courtUnit: string;
  processNumber: string;
  className?: string;
  excerpt: string;
  truncated: boolean;
  status: ReviewStatus;
  needsAttention: boolean;
  attorneys: PublicationAttorney[];
};

export type PublicationDetail = PublicationSummary & {
  source: string;
  sourceId: string;
  medium: string;
  /** Texto exatamente como veio da fonte, incluindo a marcação quando o tribunal a envia. */
  text: string;
  /** Mesmo conteúdo em leitura corrida, sem as tags. Nada é resumido nem reordenado. */
  readableText: string;
  officialLink?: string;
  documentType?: string;
  communicationNumber?: number;
  hash?: string;
  recipients: PublicationRecipient[];
};

/** Uma linha da exportação: campos normalizados e o texto já em leitura corrida. */
export type ExportRow = {
  availableOn: string;
  tribunal: string;
  communicationType: string;
  className?: string;
  processNumber: string;
  courtUnit: string;
  status: ReviewStatus;
  needsAttention: boolean;
  attorneys: PublicationAttorney[];
  source: string;
  sourceId: string;
  officialLink?: string;
  readableText: string;
};

export type PublicationFilters = {
  searchId?: string;
  status?: ReviewStatus;
  needsAttention?: boolean;
  tribunal?: string;
  oabNumber?: string;
  oabUf?: string;
  processNumber?: string;
  startDate?: string;
  endDate?: string;
  term?: string;
  order?: PublicationOrder;
};

export type PublicationPage = {
  total: number;
  offset: number;
  items: PublicationSummary[];
};

export type PublicationCounts = {
  total: number;
  unchecked: number;
  checked: number;
  discarded: number;
  needsAttention: number;
};

export type PublicationFacets = {
  tribunals: string[];
};

export type SearchHistoryEntry = {
  id: string;
  startDate: string;
  endDate: string;
  tribunal?: string;
  executedAt: string;
  resultCount: number;
  linkedCount: number;
  warnings: string[];
  attorneys: PublicationAttorney[];
};

export interface PublicationsApi {
  list(filters: PublicationFilters, limit: number, offset: number): Promise<PublicationPage>;
  detail(id: number): Promise<PublicationDetail | undefined>;
  counts(): Promise<PublicationCounts>;
  facets(): Promise<PublicationFacets>;
  history(limit?: number): Promise<SearchHistoryEntry[]>;
  exportRows(
    filters: PublicationFilters,
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<ExportRow[]>;
  setStatus(id: number, status: ReviewStatus): Promise<void>;
  setAttention(id: number, needsAttention: boolean): Promise<void>;
}
