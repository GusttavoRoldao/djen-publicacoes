export type StorageStats = {
  searches: number;
  publications: number;
  links: number;
  attention: number;
  attorneys: number;
  /** Tamanho em disco do banco e dos arquivos auxiliares. Zero quando não há acesso nativo. */
  bytes: number;
};

/**
 * O que uma exclusão vai remover, calculado antes de executar.
 * Nada é apagado sem que a quantidade exata apareça antes na confirmação.
 */
export type DeletionPreview = {
  publications: number;
  searches: number;
  /** Marcadas como `Requer atenção` que ficarão preservadas. */
  protectedAttention: number;
};

export type DeletionResult = {
  publications: number;
  searches: number;
};

export type PeriodRange = {
  startDate?: string;
  endDate?: string;
};

export interface StorageApi {
  stats(): Promise<StorageStats>;
  previewSearchDeletion(searchId: string, keepAttention: boolean): Promise<DeletionPreview>;
  deleteSearch(searchId: string, keepAttention: boolean): Promise<DeletionResult>;
  previewPeriodDeletion(range: PeriodRange, keepAttention: boolean): Promise<DeletionPreview>;
  deletePeriod(range: PeriodRange, keepAttention: boolean): Promise<DeletionResult>;
  previewSelection(ids: number[]): Promise<DeletionPreview>;
  deletePublications(ids: number[]): Promise<DeletionResult>;
  previewArchiveClear(): Promise<DeletionPreview>;
  clearArchive(): Promise<DeletionResult>;
  restoreEverything(): Promise<DeletionResult>;
  previewRetention(cutoff: string): Promise<DeletionPreview>;
  applyRetention(cutoff: string): Promise<DeletionResult>;
  compact(): Promise<number>;
}
