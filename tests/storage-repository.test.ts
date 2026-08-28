import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Publication } from "../src/djen/types.ts";
import { PublicationRepository } from "../src/publications/repository.ts";
import { SearchRepository } from "../src/search/repository.ts";
import { SettingsRepository } from "../src/settings/repository.ts";
import { StorageRepository } from "../src/storage/repository.ts";
import { SqliteDatabase } from "./sqlite-database.ts";

const maria = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };

function publication(sourceId: string, availableOn: string): Publication {
  return {
    sourceId,
    source: "DJEN/CNJ",
    availableOn,
    tribunal: "TRT2",
    communicationType: "Intimação",
    courtUnit: "1ª Vara do Trabalho",
    text: `Texto de ${sourceId}`,
    processNumber: `0000000-${sourceId}`,
    medium: "D",
    recipients: [{ name: "Parte", role: "Passivo" }],
    attorneys: [{ name: maria.name, oab: maria.oabNumber, uf: maria.oabUf }],
  };
}

function count(database: SqliteDatabase, table: string): number {
  return Number((database.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total);
}

describe("StorageRepository", () => {
  let database: SqliteDatabase;
  let storage: StorageRepository;
  let searches: SearchRepository;
  let publications: PublicationRepository;
  let firstSearch = "";
  let secondSearch = "";

  beforeEach(async () => {
    database = new SqliteDatabase();
    storage = new StorageRepository(database);
    searches = new SearchRepository(database);
    publications = new PublicationRepository(database);
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status)
       VALUES (1, 'Maria Silva', '123456', 'PE', 'confirmed')`,
    );

    // "compartilhada" aparece nas duas pesquisas; as demais são exclusivas de uma delas.
    firstSearch = (await searches.save({
      profiles: [maria],
      startDate: "2026-01-10",
      endDate: "2026-01-10",
      warnings: [],
      publications: [publication("antiga", "2026-01-10"), publication("compartilhada", "2026-01-10")],
    })).id;

    secondSearch = (await searches.save({
      profiles: [maria],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      warnings: [],
      publications: [publication("recente", "2026-06-10"), publication("compartilhada", "2026-01-10")],
    })).id;
  });

  async function idOf(sourceId: string): Promise<number> {
    const page = await publications.list({ processNumber: `0000000-${sourceId}` }, 5, 0);
    const found = page.items[0];
    assert.ok(found, `publicação ${sourceId} não encontrada`);
    return found.id;
  }

  it("mede o acervo salvo", async () => {
    const stats = await storage.stats();

    assert.equal(stats.searches, 2);
    assert.equal(stats.publications, 3);
    assert.equal(stats.links, 4);
    assert.equal(stats.attorneys, 1);
    assert.equal(stats.attention, 0);
  });

  it("exclui uma pesquisa sem apagar publicação vinculada a outra", async () => {
    const preview = await storage.previewSearchDeletion(firstSearch, true);
    const result = await storage.deleteSearch(firstSearch, true);

    assert.equal(preview.publications, 1, "somente a publicação exclusiva da pesquisa");
    assert.equal(preview.searches, 1);
    assert.equal(result.searches, 1);
    assert.equal(result.publications, 1);
    assert.equal(count(database, "searches"), 1);
    assert.equal(count(database, "publications"), 2);
    assert.equal(
      (database.database.prepare("SELECT id FROM searches").get() as { id: string }).id,
      secondSearch,
      "a outra pesquisa continua no histórico",
    );
    assert.deepEqual(
      database.database.prepare("SELECT source_id FROM publications ORDER BY source_id").all().map((row) => (row as { source_id: string }).source_id),
      ["compartilhada", "recente"],
    );
  });

  it("preserva uma publicação com atenção ao excluir a pesquisa dela", async () => {
    await publications.setAttention(await idOf("antiga"), true);

    const preview = await storage.previewSearchDeletion(firstSearch, true);
    const result = await storage.deleteSearch(firstSearch, true);

    assert.equal(preview.publications, 0);
    assert.equal(preview.protectedAttention, 1);
    assert.equal(result.publications, 0);
    assert.equal(count(database, "publications"), 3);
    assert.equal(count(database, "searches"), 1);
  });

  it("exclui publicações escolhidas uma a uma e em lote", async () => {
    const ids = [await idOf("antiga"), await idOf("recente")];

    const preview = await storage.previewSelection(ids);
    const result = await storage.deletePublications(ids);

    assert.equal(preview.publications, 2);
    assert.equal(result.publications, 2);
    assert.equal(count(database, "publications"), 1);
    assert.equal(count(database, "search_publications"), 2, "os vínculos das apagadas somem junto");
    assert.equal(count(database, "searches"), 2, "o histórico da pesquisa permanece");
  });

  it("avisa quantas da seleção estão marcadas com atenção, sem impedir a exclusão", async () => {
    const marked = await idOf("antiga");
    await publications.setAttention(marked, true);

    const preview = await storage.previewSelection([marked]);
    const result = await storage.deletePublications([marked]);

    assert.equal(preview.publications, 1);
    assert.equal(preview.protectedAttention, 1);
    assert.equal(result.publications, 1);
    assert.equal(count(database, "publications"), 2);
  });

  it("exclui por período preservando os itens com atenção", async () => {
    await publications.setAttention(await idOf("compartilhada"), true);
    const range = { startDate: "2026-01-01", endDate: "2026-01-31" };

    const preview = await storage.previewPeriodDeletion(range, true);
    const result = await storage.deletePeriod(range, true);

    assert.equal(preview.publications, 1);
    assert.equal(preview.protectedAttention, 1);
    assert.equal(result.publications, 1);
    assert.equal(count(database, "publications"), 2);
  });

  it("exclui por período incluindo os itens com atenção quando o usuário escolhe", async () => {
    await publications.setAttention(await idOf("compartilhada"), true);
    const range = { startDate: "2026-01-01", endDate: "2026-01-31" };

    const preview = await storage.previewPeriodDeletion(range, false);
    const result = await storage.deletePeriod(range, false);

    assert.equal(preview.publications, 2);
    assert.equal(preview.protectedAttention, 0);
    assert.equal(result.publications, 2);
    assert.equal(count(database, "publications"), 1);
  });

  it("a retenção automática nunca apaga um item marcado como atenção", async () => {
    await publications.setAttention(await idOf("antiga"), true);

    const preview = await storage.previewRetention("2026-03-01");
    const result = await storage.applyRetention("2026-03-01");

    assert.equal(preview.publications, 1, "apenas a compartilhada, também antiga");
    assert.equal(preview.protectedAttention, 1);
    assert.equal(result.publications, 1);
    assert.deepEqual(
      database.database.prepare("SELECT source_id FROM publications ORDER BY source_id").all().map((row) => (row as { source_id: string }).source_id),
      ["antiga", "recente"],
    );
  });

  it("limpa o acervo preservando OABs e preferências", async () => {
    const settings = new SettingsRepository(database);
    await settings.setRetentionDays(180);

    const preview = await storage.previewArchiveClear();
    const result = await storage.clearArchive();

    assert.equal(preview.publications, 3);
    assert.equal(preview.searches, 2);
    assert.equal(result.publications, 3);
    assert.equal(result.searches, 2);
    assert.equal(count(database, "publications"), 0);
    assert.equal(count(database, "searches"), 0);
    assert.equal(count(database, "search_attorneys"), 0);
    assert.equal(count(database, "attorney_profiles"), 1, "as OABs continuam cadastradas");
    assert.equal(await settings.getRetentionDays(), 180, "as preferências continuam salvas");
  });

  it("restaura o aplicativo apagando também OABs e preferências", async () => {
    const settings = new SettingsRepository(database);
    await settings.setRetentionDays(90);

    await storage.restoreEverything();

    assert.equal(count(database, "publications"), 0);
    assert.equal(count(database, "searches"), 0);
    assert.equal(count(database, "attorney_profiles"), 0);
    assert.equal(count(database, "app_settings"), 0);
    assert.equal(await settings.getRetentionDays(), 0, "volta ao padrão do primeiro uso");
  });

  it("apaga em cascata as tabelas ligadas à publicação", async () => {
    await publications.setAttention(await idOf("antiga"), true);
    assert.equal(count(database, "publication_reviews"), 1);

    await storage.clearArchive();

    assert.equal(count(database, "publication_attorneys"), 0);
    assert.equal(count(database, "publication_recipients"), 0);
    assert.equal(count(database, "publication_reviews"), 0);
    assert.equal(database.database.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  });

  it("reverte a exclusão inteira quando uma operação falha no meio", async () => {
    const ids = [await idOf("antiga"), await idOf("recente")];
    const original = database.transaction.bind(database);
    database.transaction = async (operations) => original([
      ...operations,
      { query: "DELETE FROM publications WHERE id = (SELECT 1 FROM tabela_inexistente)" },
    ]);

    await assert.rejects(storage.deletePublications(ids));

    assert.equal(count(database, "publications"), 3, "nada foi apagado");
    assert.equal(count(database, "search_publications"), 4, "os vínculos continuam intactos");
    assert.equal(database.database.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  });
});
