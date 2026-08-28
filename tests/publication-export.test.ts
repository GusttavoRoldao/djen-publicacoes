import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildCsv, csvField, csvHeader, exportFileName } from "../src/publications/csv.ts";
import { PublicationRepository } from "../src/publications/repository.ts";
import type { ExportRow } from "../src/publications/types.ts";
import type { Publication } from "../src/djen/types.ts";
import { SearchRepository } from "../src/search/repository.ts";
import { SqliteDatabase } from "./sqlite-database.ts";

const maria = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    availableOn: "2026-06-10",
    tribunal: "TJSP",
    communicationType: "Intimação",
    className: "Procedimento Comum Cível",
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

function publication(sourceId: string, overrides: Partial<Publication> = {}): Publication {
  return {
    sourceId,
    source: "DJEN/CNJ",
    availableOn: "2026-06-10",
    tribunal: "TJSP",
    communicationType: "Intimação",
    courtUnit: "3ª Vara Cível",
    text: "Intimação da parte para audiência.",
    processNumber: `100000${sourceId}-11.2026.8.26.0100`,
    medium: "D",
    recipients: [],
    attorneys: [{ name: maria.name, oab: maria.oabNumber, uf: maria.oabUf }],
    ...overrides,
  };
}

describe("montagem do CSV", () => {
  it("escapa separador, aspas e quebra de linha conforme o RFC 4180", () => {
    assert.equal(csvField("simples"), "simples");
    assert.equal(csvField("com;ponto e vírgula"), '"com;ponto e vírgula"');
    assert.equal(csvField('com "aspas"'), '"com ""aspas"""');
    assert.equal(csvField("linha um\nlinha dois"), '"linha um\nlinha dois"');
    assert.equal(csvField("retorno\r\nnormalizado"), '"retorno\nnormalizado"');
  });

  it("usa ponto e vírgula, que é o separador do Excel em português", () => {
    assert.ok(csvHeader().includes("Data de disponibilização;Tribunal"));
  });

  it("preserva acentos e cedilha sem escapar", () => {
    const csv = buildCsv([row({ readableText: "Intimação, citação e execução — ação nº 1º." })]);

    assert.ok(csv.includes("Intimação, citação e execução — ação nº 1º."));
    assert.ok(csv.includes("3ª Vara Cível"));
  });

  it("escreve uma linha por publicação, com cabeçalho e quebra CRLF", () => {
    const csv = buildCsv([row(), row({ processNumber: "0002", status: "checked", needsAttention: true })]);
    const lines = csv.split("\r\n");

    assert.equal(lines.length, 3);
    assert.ok(lines[1]?.startsWith("10/06/2026;TJSP;Intimação;"));
    assert.ok(lines[2]?.includes(";Conferida;Sim;"));
  });

  it("junta os advogados em uma coluna legível", () => {
    const csv = buildCsv([row({
      attorneys: [
        { name: "Maria Silva", oabNumber: "123456", oabUf: "PE" },
        { name: "Carlos Pereira", oabNumber: "654321", oabUf: "SP" },
      ],
    })]);

    assert.ok(csv.includes("Maria Silva (OAB PE 123456) | Carlos Pereira (OAB SP 654321)"));
  });

  it("não quebra a planilha quando o texto tem ponto e vírgula e quebra de linha", () => {
    const csv = buildCsv([row({ readableText: "Item 1; item 2\n\nParágrafo seguinte." })]);
    const header = csv.split("\r\n")[0]!;

    assert.equal(header.split(";").length, 13, "o cabeçalho tem 13 colunas");
    assert.ok(csv.includes('"Item 1; item 2\n\nParágrafo seguinte."'));
  });

  it("sugere um nome de arquivo com data e hora", () => {
    assert.equal(exportFileName(new Date(2026, 7, 27, 9, 5)), "publicacoes-2026-08-27-09h05.csv");
  });
});

describe("exportação respeita os filtros", () => {
  const database = new SqliteDatabase();
  const publications = new PublicationRepository(database);

  before(async () => {
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status)
       VALUES (1, 'Maria Silva', '123456', 'PE', 'confirmed')`,
    );
    await new SearchRepository(database).save({
      profiles: [maria],
      startDate: "2026-06-09",
      endDate: "2026-06-11",
      warnings: [],
      publications: [
        publication("1"),
        publication("2", { tribunal: "TRT2", availableOn: "2026-06-09" }),
        publication("3", {
          tribunal: "TJPE",
          availableOn: "2026-06-11",
          text: "<p>Senten&ccedil;a publicada com <b>marca&ccedil;&atilde;o</b>.</p>",
        }),
      ],
    });
  });

  it("exporta tudo quando não há filtro", async () => {
    const rows = await publications.exportRows({});

    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((item) => item.tribunal), ["TJPE", "TJSP", "TRT2"]);
  });

  it("exporta somente o que o filtro deixou na tela", async () => {
    const byTribunal = await publications.exportRows({ tribunal: "TRT2" });
    const byPeriod = await publications.exportRows({ startDate: "2026-06-10", endDate: "2026-06-11" });
    const byTerm = await publications.exportRows({ term: "audiência" });

    assert.deepEqual(byTribunal.map((item) => item.tribunal), ["TRT2"]);
    assert.equal(byPeriod.length, 2);
    assert.equal(byTerm.length, 2);
  });

  it("segue a ordenação escolhida", async () => {
    const oldest = await publications.exportRows({ order: "oldest" });

    assert.deepEqual(oldest.map((item) => item.availableOn), ["2026-06-09", "2026-06-10", "2026-06-11"]);
  });

  it("exporta o texto em leitura corrida, sem marcação", async () => {
    const [marked] = await publications.exportRows({ tribunal: "TJPE" });

    assert.equal(marked?.readableText, "Sentença publicada com marcação.");
    assert.ok(!buildCsv([marked!]).includes("<p>"));
  });

  it("informa o andamento e aceita cancelamento", async () => {
    const progress: number[] = [];
    await publications.exportRows({}, (done) => progress.push(done));
    assert.deepEqual(progress, [3]);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(publications.exportRows({}, undefined, controller.signal));
  });

  it("devolve lista vazia quando nada corresponde", async () => {
    assert.deepEqual(await publications.exportRows({ tribunal: "STJ" }), []);
  });
});
