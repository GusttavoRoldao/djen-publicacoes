import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:djen-publicacoes.db";

export type ExecuteResult = {
  rowsAffected: number;
  lastInsertId?: number;
};

export type ApplicationDatabase = {
  execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
};

export type DatabaseOperation = {
  query: string;
  values?: unknown[];
};

export type TransactionalDatabase = ApplicationDatabase & {
  transaction(operations: DatabaseOperation[]): Promise<ExecuteResult[]>;
};

let databasePromise: Promise<TransactionalDatabase> | undefined;

export function getDatabase(): Promise<TransactionalDatabase> {
  databasePromise ??= Database.load(DATABASE_URL).then((database) => ({
    execute: (query, bindValues) => database.execute(query, bindValues),
    select: <T>(query: string, bindValues?: unknown[]) => database.select<T>(query, bindValues),
    transaction: (operations) => invoke<ExecuteResult[]>("execute_transaction", { operations }),
  }));
  return databasePromise;
}
