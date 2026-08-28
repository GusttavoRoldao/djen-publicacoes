import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Publication } from "../src/djen/types.ts";
import { ProviderRepository } from "../src/providers/repository.ts";
import { emptyConfig, type RestProviderConfig } from "../src/providers/rest/types.ts";
import { publicationKey, SearchRepository } from "../src/search/repository.ts";
import { SettingsRepository } from "../src/settings/repository.ts";
import { SqliteDatabase } from "./sqlite-database.ts";

const NESTED_MAPPING = {
  items: "dados.resultados",
  total: "dados.total",
  sourceId: "hash",
  availableOn: "data",
  tribunal: "tribunal",
  communicationType: "tipo",
  courtUnit: "orgao",
  text: "texto",
  processNumber: "processo",
};

function config(overrides: Partial<RestProviderConfig> = {}): RestProviderConfig {
  return {
    ...emptyConfig("fonte-paga"),
    name: "Fonte paga",
    baseUrl: "https://api.exemplo.com/v1/publicacoes",
    mapping: NESTED_MAPPING,
    ...overrides,
  };
}

function publication(source: string, sourceId: string, overrides: Partial<Publication> = {}): Publication {
  return {
    sourceId,
    source,
    availableOn: "2026-06-10",
    tribunal: "TRT2",
    communicationType: "Intimação",
    courtUnit: "1ª Vara do Trabalho",
    text: "Texto integral",
    processNumber: "0001111-22.2026.5.02.0001",
    medium: "D",
    recipients: [],
    attorneys: [{ name: "Maria Silva", oab: "123456", uf: "PE" }],
    ...overrides,
  };
}

describe("ProviderRepository", () => {
  let database: SqliteDatabase;
  let providers: ProviderRepository;

  beforeEach(async () => {
    database = new SqliteDatabase();
    providers = new ProviderRepository(database);
    await database.migrate();
  });

  it("guarda, lê e apaga uma fonte configurada", async () => {
    await providers.save(config());
    const stored = await providers.find("fonte-paga");

    assert.equal(stored?.name, "Fonte paga");
    assert.equal(stored?.baseUrl, "https://api.exemplo.com/v1/publicacoes");
    assert.equal(stored?.mapping.items, "dados.resultados");
    assert.equal((await providers.list()).length, 1);

    await providers.delete("fonte-paga");
    assert.equal(await providers.find("fonte-paga"), undefined);
    assert.equal((await providers.list()).length, 0);
  });

  it("atualiza a fonte sem criar duplicata", async () => {
    await providers.save(config());
    await providers.save(config({ name: "Fonte paga renomeada" }));

    const all = await providers.list();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.name, "Fonte paga renomeada");
  });

  it("nunca grava credencial no SQLite", async () => {
    await providers.save(config({
      authMode: "header-key",
      authName: "X-Api-Key",
      headers: [{ name: "X-Api-Key", value: "chave-secreta" }, { name: "X-Cliente", value: "djen" }],
      extraParams: [{ name: "token", value: "chave-secreta" }, { name: "meio", value: "D" }],
    }));

    const raw = database.database.prepare("SELECT config FROM providers").all()
      .map((row) => (row as { config: string }).config)
      .join("");

    assert.ok(!raw.includes("chave-secreta"), "nenhuma credencial pode chegar ao banco");
    assert.ok(raw.includes("X-Cliente"), "os cabeçalhos comuns continuam salvos");
    assert.ok(raw.includes("X-Api-Key"), "o nome do cabeçalho da chave é configuração, não segredo");
  });

  it("guarda a fonte ativa e volta ao CNJ quando não há escolha", async () => {
    const settings = new SettingsRepository(database);

    assert.equal(await settings.getActiveProvider(), "djen-cnj", "a migração deixa o CNJ como padrão");
    await settings.setActiveProvider("fonte-paga");
    assert.equal(await settings.getActiveProvider(), "fonte-paga");
    await settings.setActiveProvider("djen-cnj");
    assert.equal(await settings.getActiveProvider(), "djen-cnj");
  });
});

describe("deduplicação entre fontes diferentes", () => {
  it("não confunde publicações de fontes distintas com o mesmo identificador", () => {
    const cnj = publicationKey(publication("DJEN/CNJ", "hash-1"));
    const paga = publicationKey(publication("fonte-paga", "hash-1"));

    assert.notEqual(cnj, paga);
    assert.ok(cnj.startsWith("DJEN/CNJ:"));
    assert.ok(paga.startsWith("fonte-paga:"));
  });

  it("mantém a fonte na chave composta quando não há identificador estável", () => {
    const cnj = publicationKey(publication("DJEN/CNJ", "", { communicationNumber: 42 }));
    const paga = publicationKey(publication("fonte-paga", "", { communicationNumber: 42 }));

    assert.notEqual(cnj, paga);
  });

  it("guarda as duas versões sem apagar uma pela outra", async () => {
    const database = new SqliteDatabase();
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status)
       VALUES (1, 'Maria Silva', '123456', 'PE', 'confirmed')`,
    );
    const searches = new SearchRepository(database);
    const profile = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };

    const first = await searches.save({
      profiles: [profile],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      warnings: [],
      publications: [publication("DJEN/CNJ", "hash-1")],
    });
    const second = await searches.save({
      profiles: [profile],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      warnings: [],
      publications: [publication("fonte-paga", "hash-1")],
    });

    assert.equal(first.newPublicationCount, 1);
    assert.equal(second.newPublicationCount, 1, "a mesma chave em outra fonte é uma publicação nova");
    assert.equal(
      Number((database.database.prepare("SELECT COUNT(*) AS total FROM publications").get() as { total: number }).total),
      2,
    );
  });

  it("continua deduplicando dentro da mesma fonte", async () => {
    const database = new SqliteDatabase();
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status)
       VALUES (1, 'Maria Silva', '123456', 'PE', 'confirmed')`,
    );
    const searches = new SearchRepository(database);
    const profile = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };
    const input = {
      profiles: [profile],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      warnings: [],
      publications: [publication("fonte-paga", "hash-1")],
    };

    await searches.save(input);
    const repeated = await searches.save(input);

    assert.equal(repeated.newPublicationCount, 0);
  });
});
