import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tidyUpperCase } from "../src/publications/format.ts";
import type { ExportRow } from "../src/publications/types.ts";
import { buildSheetData, cellText, SHEET_COLUMNS, sheetOptions, xlsxFileName } from "../src/publications/xlsx.ts";

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    availableOn: "2026-06-10",
    tribunal: "TJSP",
    communicationType: "Intimação",
    className: "PROCEDIMENTO COMUM CÍVEL",
    processNumber: "1000000-11.2020.8.26.0100",
    courtUnit: "3ª Vara Cível",
    status: "unchecked",
    needsAttention: false,
    attorneys: [{ name: "Maria Silva", oabNumber: "123456", oabUf: "PE" }],
    source: "DJEN/CNJ",
    sourceId: "hash-1",
    officialLink: "https://exemplo.com/1",
    readableText: "Texto da intimação.",
    ...overrides,
  };
}

describe("planilha do Excel", () => {
  it("põe o cabeçalho na primeira linha, em negrito e sobre fundo escuro", () => {
    const [header] = buildSheetData([row()]);

    assert.equal(header?.length, SHEET_COLUMNS.length);
    assert.equal(header?.[0]?.value, "Data");
    assert.equal(header?.[0]?.fontWeight, "bold");
    assert.equal(header?.[0]?.backgroundColor, "#1B1717");
    assert.equal(header?.[12]?.value, "Texto");
  });

  it("define largura para cada coluna e congela o cabeçalho", () => {
    const options = sheetOptions();

    assert.equal(options.columns.length, SHEET_COLUMNS.length);
    assert.equal(options.stickyRowsCount, 1, "o cabeçalho fica visível ao rolar");
    assert.ok(options.columns.every((column) => column.width > 0));
    assert.equal(options.columns[12]?.width, 90, "a coluna do texto é a mais larga");
    assert.equal(options.sheet, "Publicações");
  });

  it("fixa a altura da linha para o texto longo não esticar a planilha", () => {
    const [, first] = buildSheetData([row({ readableText: "linha\n".repeat(200) })]);

    assert.equal(first?.[0]?.height, 42);
    assert.equal(first?.[1]?.height, undefined, "a altura vem da primeira célula da linha");
  });

  it("quebra linha só nas colunas longas", () => {
    const [, first] = buildSheetData([row()]);

    assert.equal(first?.[0]?.wrap, false, "a data não quebra");
    assert.equal(first?.[5]?.wrap, true, "o órgão julgador quebra");
    assert.equal(first?.[8]?.wrap, true, "os advogados quebram");
    assert.equal(first?.[12]?.wrap, true, "o texto quebra");
  });

  it("destaca a coluna de atenção só quando está marcada", () => {
    const [, marked] = buildSheetData([row({ needsAttention: true })]);
    const [, plain] = buildSheetData([row()]);

    assert.equal(marked?.[7]?.value, "Sim");
    assert.equal(marked?.[7]?.fontWeight, "bold");
    assert.equal(plain?.[7]?.value, "", "sem marcação a célula fica vazia, não poluída com Não");
    assert.equal(plain?.[7]?.fontWeight, undefined);
  });

  it("separa cada advogado em uma linha da mesma célula", () => {
    const [, first] = buildSheetData([row({
      attorneys: [
        { name: "Maria Silva", oabNumber: "123456", oabUf: "PE" },
        { name: "Carlos Pereira", oabNumber: "654321", oabUf: "SP" },
      ],
    })]);

    assert.equal(first?.[8]?.value, "Maria Silva (OAB PE 123456)\nCarlos Pereira (OAB SP 654321)");
  });

  it("formata a data no padrão brasileiro", () => {
    const [, first] = buildSheetData([row()]);

    assert.equal(first?.[0]?.value, "10/06/2026");
  });

  it("corta o texto no limite de célula do Excel, avisando onde continua", () => {
    const long = "a".repeat(40_000);

    assert.equal(cellText("curto"), "curto");
    assert.ok(cellText(long).length < 32_200);
    assert.ok(cellText(long).includes("o inteiro teor está no aplicativo"));
  });

  it("sugere um nome de arquivo com data e hora", () => {
    assert.equal(xlsxFileName(new Date(2026, 7, 27, 9, 5)), "publicacoes-2026-08-27-09h05.xlsx");
  });
});

describe("caixa alta enviada pela fonte", () => {
  it("completa o maiúsculo quando a fonte deixou os acentos para trás", () => {
    assert.equal(tidyUpperCase("EXECUçãO DE TíTULO EXTRAJUDICIAL"), "EXECUÇÃO DE TÍTULO EXTRAJUDICIAL");
    assert.equal(tidyUpperCase("AçãO TRABALHISTA"), "AÇÃO TRABALHISTA");
    assert.equal(tidyUpperCase("APELAçãO CíVEL"), "APELAÇÃO CÍVEL");
  });

  it("não mexe em texto escrito normalmente", () => {
    assert.equal(tidyUpperCase("Procedimento Comum Cível"), "Procedimento Comum Cível");
    assert.equal(tidyUpperCase("Ação trabalhista"), "Ação trabalhista");
    assert.equal(tidyUpperCase(""), "");
    assert.equal(tidyUpperCase("1000000-11.2020"), "1000000-11.2020");
  });

  it("mantém quem já está inteiramente em caixa alta", () => {
    assert.equal(tidyUpperCase("MANDADO DE SEGURANÇA"), "MANDADO DE SEGURANÇA");
  });
});
