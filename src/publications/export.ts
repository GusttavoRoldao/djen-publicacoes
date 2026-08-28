import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { buildCsv } from "./csv.ts";
import { publicationsApi } from "./database.ts";
import type { ExportRow, PublicationFilters } from "./types.ts";
import { buildSheetData, sheetOptions, xlsxFileName } from "./xlsx.ts";

export type ExportOutcome =
  | { status: "saved"; path: string; rows: number; format: "xlsx" | "csv" }
  | { status: "cancelled" }
  | { status: "empty" };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Fatias pequenas evitam estourar o limite de argumentos de `String.fromCharCode`.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

async function writeXlsx(path: string, rows: ExportRow[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const output = await writeXlsxFile(buildSheetData(rows) as never, sheetOptions());
  const bytes = new Uint8Array(await (await output.toBlob()).arrayBuffer());
  await invoke("write_export_binary", { path, contents: toBase64(bytes) });
}

/**
 * Exporta exatamente as publicações que atendem aos filtros atuais.
 * O formato vem da extensão escolhida na janela de salvamento do sistema.
 */
export async function exportFiltered(
  filters: PublicationFilters,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ExportOutcome> {
  if (!isTauri()) return { status: "empty" };

  const rows = await publicationsApi.exportRows(filters, onProgress, signal);
  if (rows.length === 0) return { status: "empty" };

  const path = await save({
    defaultPath: xlsxFileName(new Date()),
    filters: [
      { name: "Planilha do Excel", extensions: ["xlsx"] },
      { name: "Texto separado por ponto e vírgula", extensions: ["csv"] },
    ],
    title: "Salvar as publicações filtradas",
  });
  if (!path) return { status: "cancelled" };

  if (path.toLowerCase().endsWith(".csv")) {
    await invoke("write_export", { path, contents: buildCsv(rows) });
    return { status: "saved", path, rows: rows.length, format: "csv" };
  }

  const target = path.toLowerCase().endsWith(".xlsx") ? path : `${path}.xlsx`;
  await writeXlsx(target, rows);
  return { status: "saved", path: target, rows: rows.length, format: "xlsx" };
}
