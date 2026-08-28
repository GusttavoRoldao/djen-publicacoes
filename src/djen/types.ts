export type DjenSearch = {
  oab: string;
  uf: string;
  startDate: string;
  endDate: string;
  tribunal?: string;
};

export type Attorney = {
  name: string;
  oab: string;
  uf: string;
};

export type Recipient = {
  name: string;
  role?: string;
};

export type Publication = {
  sourceId: string;
  /** Identificador da fonte que trouxe a publicação. Entra na chave de deduplicação. */
  source: string;
  availableOn: string;
  tribunal: string;
  communicationType: string;
  courtUnit: string;
  text: string;
  processNumber: string;
  medium: "D";
  officialLink?: string;
  documentType?: string;
  className?: string;
  communicationNumber?: number;
  hash?: string;
  recipients: Recipient[];
  attorneys: Attorney[];
};

export type SearchProgress = {
  page: number;
  fetched: number;
  total: number;
};

export type SearchResult = {
  total: number;
  publications: Publication[];
  rateLimit: {
    limit?: number;
    remaining?: number;
  };
};
