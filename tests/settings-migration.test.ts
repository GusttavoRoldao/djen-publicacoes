import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ALL_MIGRATIONS } from "./sqlite-database.ts";

test("a migração de configurações preserva dados existentes", async () => {
  const scripts = await Promise.all(ALL_MIGRATIONS.map((migration) => (
    readFile(new URL(`../src-tauri/migrations/${migration}`, import.meta.url), "utf8")
  )));
  const database = new DatabaseSync(":memory:");
  const apply = () => { for (const script of scripts) database.exec(script); };

  apply();
  database.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run("probe", "preserve");
  database.prepare(
    `INSERT INTO publications
     (dedup_key, source, source_id, available_on, tribunal, communication_type, court_unit,
      full_text, process_number, medium)
     VALUES ('probe', 'DJEN/CNJ', 'probe', '2026-06-10', 'TRT2', 'Intimação', 'Vara', 'Texto', '0001', 'D')`,
  ).run();
  database.prepare(
    "INSERT INTO publication_reviews (publication_id, status, needs_attention) VALUES (1, 'checked', 1)",
  ).run();
  apply();

  const row = database.prepare("SELECT value FROM app_settings WHERE key = ?").get("probe") as
    | { value: string }
    | undefined;
  const review = database.prepare("SELECT status, needs_attention FROM publication_reviews WHERE publication_id = 1").get();
  assert.equal(row?.value, "preserve");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM attorney_profiles").get()?.total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM searches").get()?.total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM publications").get()?.total, 1);
  assert.equal(review?.status, "checked");
  assert.equal(review?.needs_attention, 1);
  assert.equal(database.prepare("SELECT value FROM app_settings WHERE key = 'monitoring_time'").get()?.value, "08:00");
  database.close();
});
