import type { ReviewStatus } from "./types.ts";

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  unchecked: "Não conferida",
  checked: "Conferida",
  discarded: "Descartada",
};

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Alguns tribunais mandam campos em caixa alta por uma rotina que ignora acentos,
 * e chega `EXECUçãO DE TíTULO`. Quando o valor já é predominantemente maiúsculo,
 * o restante sobe junto. Vale só para metadados; o texto da publicação nunca é alterado.
 */
export function tidyUpperCase(value: string): string {
  const letters = [...value].filter((char) => char.toLocaleLowerCase("pt-BR") !== char.toLocaleUpperCase("pt-BR"));
  if (letters.length === 0) return value;

  const upper = letters.filter((char) => char === char.toLocaleUpperCase("pt-BR")).length;
  return upper / letters.length >= 0.7 ? value.toLocaleUpperCase("pt-BR") : value;
}

export function formatDay(value: string): string {
  const parts = value.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

export function formatPeriod(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDay(startDate) : `${formatDay(startDate)} a ${formatDay(endDate)}`;
}

export function formatTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME.format(date);
}
