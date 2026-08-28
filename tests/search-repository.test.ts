import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Publication } from "../src/djen/types.ts";
import { SearchRepository } from "../src/search/repository.ts";
import { SqliteDatabase } from "./sqlite-database.ts";

const profile = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };

function publication(sourceId: string): Publication {
  return {
    sourceId,
    source: "DJEN/CNJ",
    availableOn: "2026-06-10",
    tribunal: "TRT2",
    communicationType: "Intimação",
    courtUnit: "Vara de teste",
    text: "Texto integral",
    processNumber: `0000000-${sourceId}`,
    medium: "D",
    recipients: [{ name: "Parte", role: "A" }],
    attorneys: [{ name: profile.name, oab: profile.oabNumber, uf: profile.oabUf }],
  };
}

describe("SearchRepository", () => {
  const database = new SqliteDatabase();
  const repository = new SearchRepository(database);

  before(async () => {
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status)
       VALUES (1, 'Maria Silva', '123456', 'PE', 'confirmed')`,
    );
  });

  it("repete uma pesquisa sem duplicar a publicação", async () => {
    const input = {
      profiles: [profile],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      publications: [publication("hash-1")],
      warnings: [],
    };

    const first = await repository.save(input);
    const second = await repository.save(input);

    assert.equal(first.newPublicationCount, 1);
    assert.equal(second.newPublicationCount, 0);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS count FROM publications").get()?.count, 1);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS count FROM searches").get()?.count, 2);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS count FROM search_publications").get()?.count, 2);
  });

  it("reverte toda a transação se uma gravação falhar", async () => {
    const before = database.database.prepare("SELECT COUNT(*) AS count FROM searches").get()?.count;

    await assert.rejects(repository.save({
      profiles: [{ ...profile, id: 999 }],
      startDate: "2026-06-10",
      endDate: "2026-06-11",
      publications: [publication("hash-2"), publication("hash-3")],
      warnings: [],
    }), /FOREIGN KEY/);

    assert.equal(database.database.prepare("SELECT COUNT(*) AS count FROM searches").get()?.count, before);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS count FROM publications WHERE source_id IN ('hash-2', 'hash-3')").get()?.count, 0);
    assert.equal(database.database.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  });
});
