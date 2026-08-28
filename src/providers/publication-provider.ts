import type { DjenSearch, SearchProgress, SearchResult } from "../djen/types.ts";

export type ProviderSearchOptions = {
  onProgress?: (progress: SearchProgress) => void;
  signal?: AbortSignal;
};

export interface PublicationProvider {
  readonly id: string;
  readonly name: string;
  search(query: DjenSearch, options?: ProviderSearchOptions): Promise<SearchResult>;
}
