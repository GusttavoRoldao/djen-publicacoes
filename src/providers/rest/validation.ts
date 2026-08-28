import { DJEN_PROVIDER_ID, emptyConfig, type AuthMode, type RestProviderConfig } from "./types.ts";

const AUTH_MODES: AuthMode[] = ["none", "header-key", "query-key", "bearer"];

const REQUIRED_MAPPING = [
  ["items", "lista de resultados"],
  ["sourceId", "identificador da publicação"],
  ["availableOn", "data de disponibilização"],
  ["tribunal", "tribunal"],
  ["communicationType", "tipo de comunicação"],
  ["courtUnit", "órgão julgador"],
  ["text", "texto"],
  ["processNumber", "número do processo"],
] as const;

const REQUIRED_QUERY = [
  ["oab", "número da OAB"],
  ["uf", "UF da OAB"],
  ["startDate", "data inicial"],
  ["endDate", "data final"],
] as const;

export function validateConfig(config: RestProviderConfig): string[] {
  const problems: string[] = [];

  if (!config.name.trim()) problems.push("Dê um nome para a fonte.");
  if (config.id === DJEN_PROVIDER_ID) problems.push("Este identificador é reservado para a fonte padrão.");

  try {
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      problems.push("A URL-base precisa usar HTTPS.");
    }
  } catch {
    problems.push("Informe uma URL-base válida, começando por https://.");
  }

  if (!AUTH_MODES.includes(config.authMode)) problems.push("Escolha uma forma de autenticação válida.");
  if ((config.authMode === "header-key" || config.authMode === "query-key") && !config.authName?.trim()) {
    problems.push("Informe o nome do cabeçalho ou do parâmetro que leva a chave.");
  }

  for (const [field, label] of REQUIRED_QUERY) {
    if (!config.query[field]?.trim()) problems.push(`Informe o parâmetro da fonte para ${label}.`);
  }
  for (const [field, label] of REQUIRED_MAPPING) {
    if (!config.mapping[field]?.trim()) problems.push(`Informe o caminho da resposta para ${label}.`);
  }

  if (!Number.isInteger(config.pageSize) || config.pageSize < 1 || config.pageSize > 500) {
    problems.push("O tamanho da página precisa estar entre 1 e 500.");
  }
  if (config.firstPage !== 0 && config.firstPage !== 1) {
    problems.push("A primeira página precisa ser 0 ou 1.");
  }

  return problems;
}

/**
 * A configuração nunca carrega a chave: ela vive no cofre do sistema.
 * Esta função existe para deixar isso explícito na exportação e para barrar
 * um arquivo importado que traga um segredo embutido.
 */
export function withoutSecrets(config: RestProviderConfig): RestProviderConfig {
  const suspicious = /senha|password|secret|token|api[-_]?key|chave|authorization/i;
  return {
    ...config,
    headers: config.headers.filter((header) => !suspicious.test(header.name)),
    extraParams: config.extraParams.filter((parameter) => !suspicious.test(parameter.name)),
  };
}

export function exportConfig(config: RestProviderConfig): string {
  return JSON.stringify({ format: "djen-publicacoes/provider", version: 1, provider: withoutSecrets(config) }, null, 2);
}

function stringList(value: unknown): { name: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object")
    .map((entry) => ({ name: String(entry.name ?? ""), value: String(entry.value ?? "") }))
    .filter((entry) => entry.name);
}

export function importConfig(content: string, id: string): RestProviderConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("O arquivo não contém JSON válido.");
  }

  const envelope = parsed as Record<string, unknown>;
  const provider = envelope.provider as Record<string, unknown> | undefined;
  if (envelope.format !== "djen-publicacoes/provider" || !provider) {
    throw new Error("Este arquivo não é uma configuração de fonte deste aplicativo.");
  }

  const base = emptyConfig(id);
  const config: RestProviderConfig = {
    ...base,
    id,
    name: String(provider.name ?? ""),
    baseUrl: String(provider.baseUrl ?? ""),
    method: provider.method === "POST" ? "POST" : "GET",
    authMode: AUTH_MODES.includes(provider.authMode as AuthMode) ? provider.authMode as AuthMode : "none",
    authName: provider.authName ? String(provider.authName) : undefined,
    headers: stringList(provider.headers),
    extraParams: stringList(provider.extraParams),
    query: { ...base.query, ...(provider.query as object ?? {}) },
    mapping: { ...base.mapping, ...(provider.mapping as object ?? {}) },
    pageSize: Number(provider.pageSize ?? base.pageSize),
    firstPage: provider.firstPage === 0 ? 0 : 1,
  };

  const clean = withoutSecrets(config);
  const problems = validateConfig(clean);
  if (problems.length > 0) throw new Error(problems[0]);
  return clean;
}
