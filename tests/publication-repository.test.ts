import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Publication } from "../src/djen/types.ts";
import { PublicationRepository } from "../src/publications/repository.ts";
import { SearchRepository } from "../src/search/repository.ts";
import { SqliteDatabase } from "./sqlite-database.ts";

const maria = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };
const carlos = { id: 2, name: "Carlos Pereira", oabNumber: "654321", oabUf: "SP" };

const LONG_TEXT = `Intimação da parte para audiência designada. ${"detalhamento do ato ".repeat(30)}`;

/** Vários tribunais devolvem o texto em HTML, com centenas de caracteres antes do conteúdo real. */
const MARKED_UP_TEXT = `<html> <head> <style>body{padding:10px}</style> </head> <body> <article> <header> <div></div> </header>
<section><b>Procedimento Comum C&iacute;vel N&ordm; 0007777-33.2026.8.26.0100/SP</b></section>
<section><p>Despacho de mero expediente.</p></section> </article> </body> </html>`;

function publication(sourceId: string, overrides: Partial<Publication> = {}): Publication {
  return {
    sourceId,
    source: "DJEN/CNJ",
    availableOn: "2026-06-10",
    tribunal: "TRT2",
    communicationType: "Intimação",
    courtUnit: "1ª Vara do Trabalho de São Paulo",
    text: LONG_TEXT,
    processNumber: "0001111-22.2026.5.02.0001",
    medium: "D",
    officialLink: "https://comunica.pje.jus.br/consulta/1",
    className: "Ação Trabalhista",
    documentType: "Intimação",
    communicationNumber: 4321,
    hash: sourceId,
    recipients: [{ name: "Empresa Ré Ltda", role: "Passivo" }],
    attorneys: [{ name: maria.name, oab: maria.oabNumber, uf: maria.oabUf }],
    ...overrides,
  };
}

describe("PublicationRepository", () => {
  const database = new SqliteDatabase();
  const publications = new PublicationRepository(database);
  const searches = new SearchRepository(database);
  let firstSearchId = "";

  before(async () => {
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status) VALUES
       (1, 'Maria Silva', '123456', 'PE', 'confirmed'),
       (2, 'Carlos Pereira', '654321', 'SP', 'confirmed')`,
    );

    const first = await searches.save({
      profiles: [maria],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      tribunal: "TRT2",
      warnings: [],
      publications: [
        publication("hash-trt2"),
        publication("hash-tjpe", {
          availableOn: "2026-06-09",
          tribunal: "TJPE",
          communicationType: "Sentença",
          processNumber: "0009999-11.2026.8.17.0001",
          text: "Sentença publicada nos autos, sem audiência marcada.",
        }),
      ],
    });
    firstSearchId = first.id;

    await searches.save({
      profiles: [carlos],
      startDate: "2026-06-11",
      endDate: "2026-06-11",
      warnings: ["Um dia atingiu o teto da fonte."],
      publications: [
        publication("hash-tjsp", {
          availableOn: "2026-06-11",
          tribunal: "TJSP",
          communicationType: "Despacho",
          processNumber: "0007777-33.2026.8.26.0100",
          text: MARKED_UP_TEXT,
          attorneys: [{ name: carlos.name, oab: carlos.oabNumber, uf: carlos.oabUf }],
        }),
      ],
    });
  });

  it("abre o acervo local ordenado pela data mais recente", async () => {
    const page = await publications.list({}, 20, 0);

    assert.equal(page.total, 3);
    assert.deepEqual(page.items.map((item) => item.tribunal), ["TJSP", "TRT2", "TJPE"]);
    assert.equal(page.items[0]?.status, "unchecked");
    assert.equal(page.items[0]?.needsAttention, false);
  });

  it("ordena pela data mais antiga quando solicitado", async () => {
    const page = await publications.list({ order: "oldest" }, 20, 0);

    assert.deepEqual(page.items.map((item) => item.availableOn), ["2026-06-09", "2026-06-10", "2026-06-11"]);
  });

  it("pagina o acervo mantendo o total", async () => {
    const first = await publications.list({}, 2, 0);
    const second = await publications.list({}, 2, 2);

    assert.equal(first.total, 3);
    assert.equal(first.items.length, 2);
    assert.equal(second.total, 3);
    assert.equal(second.items.length, 1);
    assert.equal(second.offset, 2);
  });

  it("corta o trecho inicial e sinaliza que o texto continua", async () => {
    const page = await publications.list({ tribunal: "TRT2" }, 20, 0);
    const item = page.items[0];

    assert.equal(item?.truncated, true);
    assert.ok((item?.excerpt.length ?? 0) <= 320);
    assert.ok(item?.excerpt.startsWith("Intimação da parte para audiência designada."));
  });

  it("mostra o trecho legível quando o tribunal envia o texto em HTML", async () => {
    const page = await publications.list({ tribunal: "TJSP" }, 20, 0);
    const item = page.items[0];

    assert.ok(!item?.excerpt.includes("<"), "nenhuma tag pode aparecer na lista");
    assert.ok(item?.excerpt.startsWith("Procedimento Comum Cível Nº 0007777-33.2026.8.26.0100/SP"));
    assert.ok(item?.excerpt.includes("Despacho de mero expediente."));
    assert.equal(item?.truncated, false);
  });

  it("reabre uma pesquisa anterior somente com os dados locais", async () => {
    const page = await publications.list({ searchId: firstSearchId }, 20, 0);

    assert.equal(page.total, 2);
    assert.deepEqual(page.items.map((item) => item.tribunal).sort(), ["TJPE", "TRT2"]);
  });

  it("filtra por tribunal, OAB, processo, período e palavra do texto", async () => {
    const byTribunal = await publications.list({ tribunal: "TJPE" }, 20, 0);
    const byAttorney = await publications.list({ oabNumber: carlos.oabNumber, oabUf: carlos.oabUf }, 20, 0);
    const byProcess = await publications.list({ processNumber: "0009999" }, 20, 0);
    const byPeriod = await publications.list({ startDate: "2026-06-10", endDate: "2026-06-11" }, 20, 0);
    const byTerm = await publications.list({ term: "audiência" }, 20, 0);

    assert.deepEqual(byTribunal.items.map((item) => item.tribunal), ["TJPE"]);
    assert.deepEqual(byAttorney.items.map((item) => item.tribunal), ["TJSP"]);
    assert.deepEqual(byProcess.items.map((item) => item.tribunal), ["TJPE"]);
    assert.equal(byPeriod.total, 2);
    assert.equal(byTerm.total, 2);
  });

  it("combina filtros sem consultar a fonte", async () => {
    const page = await publications.list(
      { searchId: firstSearchId, tribunal: "TRT2", term: "audiência", order: "oldest" },
      20,
      0,
    );

    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.processNumber, "0001111-22.2026.5.02.0001");
  });

  it("guarda o status local e o indicador de atenção", async () => {
    const [target] = (await publications.list({ tribunal: "TJPE" }, 20, 0)).items;
    assert.ok(target);

    await publications.setStatus(target.id, "checked");
    await publications.setAttention(target.id, true);

    const reopened = new PublicationRepository(database);
    const stored = await reopened.detail(target.id);
    assert.equal(stored?.status, "checked");
    assert.equal(stored?.needsAttention, true);

    await reopened.setStatus(target.id, "discarded");
    const afterStatusChange = await reopened.detail(target.id);
    assert.equal(afterStatusChange?.status, "discarded");
    assert.equal(afterStatusChange?.needsAttention, true, "mudar o status não pode limpar a atenção");

    await reopened.setAttention(target.id, false);
    const afterAttentionChange = await reopened.detail(target.id);
    assert.equal(afterAttentionChange?.status, "discarded");
    assert.equal(afterAttentionChange?.needsAttention, false);

    await reopened.setStatus(target.id, "unchecked");
  });

  it("filtra por status e por atenção", async () => {
    const [target] = (await publications.list({ tribunal: "TJSP" }, 20, 0)).items;
    assert.ok(target);
    await publications.setStatus(target.id, "checked");
    await publications.setAttention(target.id, true);

    const checked = await publications.list({ status: "checked" }, 20, 0);
    const unchecked = await publications.list({ status: "unchecked" }, 20, 0);
    const attention = await publications.list({ needsAttention: true }, 20, 0);
    const counts = await publications.counts();

    assert.deepEqual(checked.items.map((item) => item.tribunal), ["TJSP"]);
    assert.equal(unchecked.total, 2);
    assert.deepEqual(attention.items.map((item) => item.tribunal), ["TJSP"]);
    assert.deepEqual(counts, { total: 3, unchecked: 2, checked: 1, discarded: 0, needsAttention: 1 });

    await publications.setStatus(target.id, "unchecked");
    await publications.setAttention(target.id, false);
  });

  it("entrega os detalhes com o texto integral e o link oficial", async () => {
    const [target] = (await publications.list({ tribunal: "TRT2" }, 20, 0)).items;
    assert.ok(target);

    const detail = await publications.detail(target.id);

    assert.equal(detail?.text, LONG_TEXT);
    assert.equal(detail?.readableText, LONG_TEXT.trim(), "texto sem marcação chega igual ao recebido");
    assert.equal(detail?.officialLink, "https://comunica.pje.jus.br/consulta/1");
    assert.equal(detail?.hash, "hash-trt2");
    assert.equal(detail?.source, "DJEN/CNJ");
    assert.equal(detail?.medium, "D");
    assert.equal(detail?.className, "Ação Trabalhista");
    assert.equal(detail?.communicationNumber, 4321);
    assert.deepEqual(detail?.attorneys, [{ name: maria.name, oabNumber: maria.oabNumber, oabUf: maria.oabUf }]);
    assert.deepEqual(detail?.recipients, [{ name: "Empresa Ré Ltda", role: "Passivo" }]);
    assert.equal(await publications.detail(9999), undefined);
  });

  it("lista os tribunais presentes no acervo", async () => {
    const facets = await publications.facets();

    assert.deepEqual(facets.tribunals, ["TJPE", "TJSP", "TRT2"]);
  });

  it("registra o histórico de pesquisas com período, OAB e avisos", async () => {
    const history = await publications.history();

    assert.equal(history.length, 2);
    const reopened = history.find((entry) => entry.id === firstSearchId);
    assert.equal(reopened?.startDate, "2026-06-10");
    assert.equal(reopened?.tribunal, "TRT2");
    assert.equal(reopened?.linkedCount, 2);
    assert.deepEqual(reopened?.attorneys, [{ name: maria.name, oabNumber: maria.oabNumber, oabUf: maria.oabUf }]);
    assert.deepEqual(
      history.find((entry) => entry.id !== firstSearchId)?.warnings,
      ["Um dia atingiu o teto da fonte."],
    );
  });
});
