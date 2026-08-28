import { formatDay, STATUS_LABELS } from "./format.ts";
import type { ExportRow } from "./types.ts";

/** O Excel não aceita mais que 32.767 caracteres em uma célula. */
const CELL_LIMIT = 32_000;

const INK = "#1B1717";
const PAPER = "#F5F0EF";
const LINE = "#D8CFCE";
const COPPER = "#810100";

type Cell = {
  value: string;
  type?: typeof String;
  fontWeight?: "bold";
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  alignVertical?: "top" | "center" | "bottom";
  wrap?: boolean;
  height?: number;
  borderColor?: string;
  borderStyle?: "thin";
};

export const SHEET_COLUMNS = [
  { header: "Data", width: 11 },
  { header: "Tribunal", width: 10 },
  { header: "Tipo de comunicação", width: 20 },
  { header: "Classe", width: 26 },
  { header: "Número do processo", width: 24 },
  { header: "Órgão julgador", width: 30 },
  { header: "Status local", width: 14 },
  { header: "Atenção", width: 9 },
  { header: "Advogados", width: 34 },
  { header: "Fonte", width: 12 },
  { header: "Identificador", width: 20 },
  { header: "Link oficial", width: 26 },
  { header: "Texto", width: 90 },
];

/** Altura fixa das linhas: sem ela o Excel estica a linha até caber o texto inteiro. */
const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 26;

export function cellText(value: string): string {
  if (value.length <= CELL_LIMIT) return value;
  return `${value.slice(0, CELL_LIMIT)}… [texto cortado para caber na planilha; o inteiro teor está no aplicativo]`;
}

function headerRow(): Cell[] {
  return SHEET_COLUMNS.map((column, index) => ({
    value: column.header,
    type: String,
    fontWeight: "bold",
    textColor: PAPER,
    backgroundColor: INK,
    align: "left",
    alignVertical: "center",
    borderColor: INK,
    borderStyle: "thin",
    ...(index === 0 ? { height: HEADER_HEIGHT } : {}),
  }));
}

function dataRow(row: ExportRow): Cell[] {
  const attention = row.needsAttention;
  const base: Cell = {
    value: "",
    type: String,
    alignVertical: "top",
    borderColor: LINE,
    borderStyle: "thin",
  };
  const values: string[] = [
    formatDay(row.availableOn),
    row.tribunal,
    row.communicationType,
    row.className ?? "",
    row.processNumber,
    row.courtUnit,
    STATUS_LABELS[row.status],
    attention ? "Sim" : "",
    row.attorneys.map((person) => `${person.name} (OAB ${person.oabUf} ${person.oabNumber})`).join("\n"),
    row.source,
    row.sourceId,
    row.officialLink ?? "",
    cellText(row.readableText),
  ];

  return values.map((value, index) => ({
    ...base,
    value,
    height: index === 0 ? ROW_HEIGHT : undefined,
    // Só as colunas longas quebram linha; as curtas ficariam ilegíveis espremidas.
    wrap: index === 5 || index === 8 || index === 12,
    align: index === 7 ? "center" : "left",
    ...(attention && index === 7 ? { fontWeight: "bold" as const, textColor: COPPER } : {}),
  }));
}

/** Monta a planilha inteira. Função pura, para poder ser conferida nos testes. */
export function buildSheetData(rows: ExportRow[]): Cell[][] {
  return [headerRow(), ...rows.map(dataRow)];
}

export function sheetOptions() {
  return {
    sheet: "Publicações",
    columns: SHEET_COLUMNS.map((column) => ({ width: column.width })),
    stickyRowsCount: 1,
    showGridLines: false,
  };
}

export function xlsxFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `publicacoes-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `-${pad(now.getHours())}h${pad(now.getMinutes())}.xlsx`;
}
