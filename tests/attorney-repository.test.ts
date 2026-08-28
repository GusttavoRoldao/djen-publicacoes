import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { ApplicationDatabase, ExecuteResult } from "../src/database.ts";
import { AttorneyRepository, DuplicateRegistrationError } from "../src/attorneys/repository.ts";

class SqliteDatabase implements ApplicationDatabase {
  readonly database: DatabaseSync;

  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path);
  }

  async execute(query: string, bindValues: unknown[] = []): Promise<ExecuteResult> {
    const result = this.database.prepare(query.replace(/\$\d+/g, "?")).run(...bindValues as SQLInputValue[]);
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    return this.database.prepare(query.replace(/\$\d+/g, "?")).all(...bindValues as SQLInputValue[]) as T;
  }

  close(): void {
    this.database.close();
  }
}

async function migrate(database: SqliteDatabase): Promise<void> {
  const first = await readFile(new URL("../src-tauri/migrations/1_settings.sql", import.meta.url), "utf8");
  const second = await readFile(new URL("../src-tauri/migrations/2_attorney_profiles.sql", import.meta.url), "utf8");
  database.database.exec(first);
  database.database.exec(second);
}

const input = {
  name: "Maria Silva",
  oabNumber: "123456",
  oabUf: "PE",
  validationStatus: "no_recent_publications" as const,
};

describe("AttorneyRepository", () => {
  const database = new SqliteDatabase();
  const repository = new AttorneyRepository(database);

  before(async () => {
    await migrate(database);
  });

  after(() => database.close());

  it("cria, edita e exclui um perfil", async () => {
    const created = await repository.create(input);
    assert.equal(created.name, "Maria Silva");

    const updated = await repository.update(created.id, { ...input, name: "Maria A. Almeida" });
    assert.equal(updated.name, "Maria A. Almeida");

    await repository.delete(created.id);
    assert.deepEqual(await repository.list(), []);
  });

  it("impede OAB duplicada", async () => {
    const created = await repository.create(input);
    await assert.rejects(repository.create({ ...input, name: "Outro nome" }), DuplicateRegistrationError);
    await repository.delete(created.id);
  });

  it("mantém o perfil após fechar e reabrir o arquivo", async () => {
    const directory = await mkdtemp(join(tmpdir(), "djen-perfis-"));
    const path = join(directory, "perfis.db");
    try {
      const firstDatabase = new SqliteDatabase(path);
      await migrate(firstDatabase);
      await new AttorneyRepository(firstDatabase).create(input);
      firstDatabase.close();

      const reopenedDatabase = new SqliteDatabase(path);
      const profiles = await new AttorneyRepository(reopenedDatabase).list();
      reopenedDatabase.close();

      assert.equal(profiles.length, 1);
      assert.equal(profiles[0]?.oabNumber, "123456");
      assert.equal(profiles[0]?.oabUf, "PE");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
