import { readFile } from "node:fs/promises";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { DatabaseOperation, ExecuteResult, TransactionalDatabase } from "../src/database.ts";

export const ALL_MIGRATIONS = [
  "1_settings.sql",
  "2_attorney_profiles.sql",
  "3_manual_searches.sql",
  "4_monitoring.sql",
  "5_publication_review.sql",
  "6_storage.sql",
  "7_providers.sql",
];

/**
 * O plugin SQL usa marcadores numerados, que podem aparecer fora de ordem e mais de uma vez.
 * A conversão para marcadores posicionais precisa reproduzir esse comportamento.
 */
function positional(query: string, bindValues: unknown[]): { sql: string; values: SQLInputValue[] } {
  const values: unknown[] = [];
  const sql = query.replace(/\$(\d+)/g, (_match, index: string) => {
    values.push(bindValues[Number(index) - 1]);
    return "?";
  });
  return { sql, values: values as SQLInputValue[] };
}

export class SqliteDatabase implements TransactionalDatabase {
  readonly database = new DatabaseSync(":memory:");

  async execute(query: string, bindValues: unknown[] = []): Promise<ExecuteResult> {
    const { sql, values } = positional(query, bindValues);
    const result = this.database.prepare(sql).run(...values);
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    const { sql, values } = positional(query, bindValues);
    return this.database.prepare(sql).all(...values) as T;
  }

  async transaction(operations: DatabaseOperation[]): Promise<ExecuteResult[]> {
    this.database.exec("BEGIN");
    try {
      const results: ExecuteResult[] = [];
      for (const operation of operations) {
        results.push(await this.execute(operation.query, operation.values ?? []));
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async migrate(migrations: string[] = ALL_MIGRATIONS): Promise<void> {
    this.database.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) {
      this.database.exec(await readFile(new URL(`../src-tauri/migrations/${migration}`, import.meta.url), "utf8"));
    }
  }
}
