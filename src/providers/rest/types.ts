export type AuthMode = "none" | "header-key" | "query-key" | "bearer";

export type NamedValue = { name: string; value: string };

/** Nome do parâmetro que a fonte espera para cada dado da pesquisa. */
export type QueryMapping = {
  oab: string;
  uf: string;
  startDate: string;
  endDate: string;
  tribunal?: string;
  page?: string;
  pageSize?: string;
};

/**
 * Caminho de cada campo dentro da resposta, em notação de ponto.
 * Índices são aceitos: `dados.0.itens`.
 */
export type FieldMapping = {
  items: string;
  total?: string;
  sourceId: string;
  availableOn: string;
  tribunal: string;
  communicationType: string;
  courtUnit: string;
  text: string;
  processNumber: string;
  officialLink?: string;
  className?: string;
  documentType?: string;
  communicationNumber?: string;
  attorneys?: string;
  attorneyName?: string;
  attorneyOab?: string;
  attorneyUf?: string;
  recipients?: string;
  recipientName?: string;
  recipientRole?: string;
};

export type RestProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  method: "GET" | "POST";
  authMode: AuthMode;
  /** Nome do cabeçalho ou do parâmetro que carrega a chave. O valor fica no cofre do sistema. */
  authName?: string;
  headers: NamedValue[];
  extraParams: NamedValue[];
  query: QueryMapping;
  mapping: FieldMapping;
  pageSize: number;
  firstPage: number;
};

export const DJEN_PROVIDER_ID = "djen-cnj";

export function emptyConfig(id: string): RestProviderConfig {
  return {
    id,
    name: "",
    baseUrl: "",
    method: "GET",
    authMode: "none",
    headers: [],
    extraParams: [],
    query: {
      oab: "numeroOab",
      uf: "ufOab",
      startDate: "dataInicio",
      endDate: "dataFim",
      tribunal: "tribunal",
      page: "pagina",
      pageSize: "itensPorPagina",
    },
    mapping: {
      items: "items",
      total: "count",
      sourceId: "hash",
      availableOn: "data_disponibilizacao",
      tribunal: "siglaTribunal",
      communicationType: "tipoComunicacao",
      courtUnit: "nomeOrgao",
      text: "texto",
      processNumber: "numero_processo",
    },
    pageSize: 100,
    firstPage: 1,
  };
}
