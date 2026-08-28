import { formatDay, STATUS_LABELS } from "./format.ts";
import type { ExportRow } from "./types.ts";

/** O Excel em português usa o ponto e vírgula como separador padrão. */
const SEPARATOR = ";";

const COLUMNS = [
  "Data de disponibilização",
  "Tribunal",
  "Tipo de comunicação",
  "Classe",
  "Número do processo",
  "Órgão julgador",
  "Status local",
  "Requer atenção",
  "Advogados",
  "Fonte",
  "Identificador da fonte",
  "Link oficial",
  "Texto",
];

/**
 * Escapa o valor conforme o RFC 4180: aspas dobradas e campo entre aspas quando
 * houver separador, aspas ou quebra de linha.
 */
export function csvField(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (!/[";\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function line(values: string[]): string {
  return values.map(csvField).join(SEPARATOR);
}

export function csvHeader(): string {
  return line(COLUMNS);
}

export function csvRow(row: ExportRow): string {
  return line([
    formatDay(row.availableOn),
    row.tribunal,
    row.communicationType,
    row.className ?? "",
    row.processNumber,
    row.courtUnit,
    STATUS_LABELS[row.status],
    row.needsAttention ? "Sim" : "Não",
    row.attorneys.map((person) => `${person.name} (OAB ${person.oabUf} ${person.oabNumber})`).join(" | "),
    row.source,
    row.sourceId,
    row.officialLink ?? "",
    row.readableText,
  ]);
}

export function buildCsv(rows: ExportRow[]): string {
  return [csvHeader(), ...rows.map(csvRow)].join("\r\n");
}

export function exportFileName(now: Date): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];
  return `publicacoes-${stamp.slice(0, 3).join("-")}-${stamp.slice(3).join("h")}.csv`;
}
