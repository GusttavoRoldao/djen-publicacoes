import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { PublicationRepository } from "../src/publications/repository.ts";
import { createRestProvider } from "../src/providers/registry.ts";
import type { RestTransport } from "../src/providers/rest/client.ts";
import { emptyConfig, type RestProviderConfig } from "../src/providers/rest/types.ts";
import { ManualSearchEngine } from "../src/search/engine.ts";
import { SearchRepository } from "../src/search/repository.ts";
import { SqliteDatabase } from "./sqlite-database.ts";

const profile = { id: 1, name: "Maria Silva", oabNumber: "123456", oabUf: "PE" };

/** Transporte equivalente ao nativo, mas em Node, para o teste falar com um servidor real. */
const httpTransport: RestTransport = async (request) => {
  const headers = new Headers(request.headers);
  headers.set("Accept", "application/json");
  if (request.authMode === "bearer") headers.set("Authorization", "Bearer chave-de-teste");
  if (request.authMode === "header-key") headers.set(request.authName ?? "X-Api-Key", "chave-de-teste");

  const url = new URL(request.url);
  if (request.authMode === "query-key") url.searchParams.set(request.authName ?? "api_key", "chave-de-teste");

  const response = await fetch(url, { method: request.method, headers });
  return { status: response.status, body: await response.text() };
};

function item(index: number, day: string) {
  return {
    identificacao: { chave: `externo-${index}` },
    publicado_em: `${day}T03:00:00Z`,
    corte: { sigla: "TJSP", nome: `${index}ª Vara Cível` },
    especie: "Intimação",
    inteiro_teor: `Publicação sintética número ${index} vinda da fonte alternativa.`,
    autos: { numero: `10000${index}-11.2026.8.26.0100` },
    partes: {
      advogados: [{ nome: "Maria Silva", oab: { numero: "123456", uf: "pe" } }],
      envolvidos: [{ nome: "Empresa Ré Ltda", polo: "Passivo" }],
    },
  };
}

function config(port: number, overrides: Partial<RestProviderConfig> = {}): RestProviderConfig {
  return {
    ...emptyConfig("fonte-simulada"),
    name: "Fonte simulada",
    baseUrl: `http://127.0.0.1:${port}/v2/publicacoes`,
    authMode: "bearer",
    pageSize: 2,
    query: {
      oab: "inscricao",
      uf: "seccional",
      startDate: "de",
      endDate: "ate",
      tribunal: "corte",
      page: "pagina",
      pageSize: "limite",
    },
    mapping: {
      items: "dados.resultados",
      total: "dados.paginacao.total",
      sourceId: "identificacao.chave",
      availableOn: "publicado_em",
      tribunal: "corte.sigla",
      communicationType: "especie",
      courtUnit: "corte.nome",
      text: "inteiro_teor",
      processNumber: "autos.numero",
      attorneys: "partes.advogados",
      attorneyName: "nome",
      attorneyOab: "oab.numero",
      attorneyUf: "oab.uf",
      recipients: "partes.envolvidos",
      recipientName: "nome",
      recipientRole: "polo",
    },
    ...overrides,
  };
}

describe("troca de fonte com um servidor REST simulado", () => {
  let server: Server;
  let port = 0;
  const received: { authorization?: string; url: string }[] = [];
  const database = new SqliteDatabase();

  before(async () => {
    await database.migrate();
    database.database.exec(
      `INSERT INTO attorney_profiles (id, name, oab_number, oab_uf, validation_status)
       VALUES (1, 'Maria Silva', '123456', 'PE', 'confirmed')`,
    );

    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      received.push({ authorization: request.headers.authorization, url: url.toString() });

      if (url.searchParams.get("inscricao") !== "123456") {
        response.writeHead(400).end("{}");
        return;
      }

      // Três resultados no total, servidos em páginas de dois.
      const page = Number(url.searchParams.get("pagina") ?? "1");
      const day = url.searchParams.get("de") ?? "2026-06-10";
      const all = [item(1, day), item(2, day), item(3, day)];
      const start = (page - 1) * 2;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        dados: { paginacao: { total: all.length }, resultados: all.slice(start, start + 2) },
      }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  after(() => { server.close(); });

  it("pesquisa, pagina e grava usando o mesmo motor da fonte padrão", async () => {
    const provider = createRestProvider(config(port), httpTransport);
    const engine = new ManualSearchEngine(provider, new SearchRepository(database));

    const saved = await engine.run({ profiles: [profile], startDate: "2026-06-10", endDate: "2026-06-10" });

    assert.equal(saved.resultCount, 3);
    assert.equal(saved.newPublicationCount, 3);
    assert.equal(received.length, 2, "o motor pediu as duas páginas");
    assert.equal(received[0]?.authorization, "Bearer chave-de-teste");
  });

  it("as publicações chegam normalizadas ao acervo, sem tela nova", async () => {
    const publications = new PublicationRepository(database);
    const page = await publications.list({ tribunal: "TJSP" }, 20, 0);
    const detail = await publications.detail(page.items[0]!.id);

    assert.equal(page.total, 3);
    assert.ok(page.items[0]?.excerpt.startsWith("Publicação sintética"));
    assert.equal(detail?.source, "fonte-simulada");
    assert.equal(detail?.availableOn, "2026-06-10");
    assert.deepEqual(detail?.attorneys, [{ name: "Maria Silva", oabNumber: "123456", oabUf: "PE" }]);
    assert.deepEqual(detail?.recipients, [{ name: "Empresa Ré Ltda", role: "Passivo" }]);
  });

  it("repetir a pesquisa na mesma fonte não duplica", async () => {
    const provider = createRestProvider(config(port), httpTransport);
    const engine = new ManualSearchEngine(provider, new SearchRepository(database));

    const repeated = await engine.run({ profiles: [profile], startDate: "2026-06-10", endDate: "2026-06-10" });

    assert.equal(repeated.resultCount, 3);
    assert.equal(repeated.newPublicationCount, 0);
  });

  it("voltar ao CNJ preserva o que a outra fonte já trouxe", async () => {
    const cnjLike = {
      id: "DJEN/CNJ",
      name: "DJEN / CNJ",
      search: async () => ({
        total: 1,
        rateLimit: {},
        publications: [{
          sourceId: "externo-1",
          source: "DJEN/CNJ",
          availableOn: "2026-06-10",
          tribunal: "TJSP",
          communicationType: "Intimação",
          courtUnit: "1ª Vara Cível",
          text: "Mesma chave, outra fonte.",
          processNumber: "100001-11.2026.8.26.0100",
          medium: "D" as const,
          recipients: [],
          attorneys: [{ name: profile.name, oab: profile.oabNumber, uf: profile.oabUf }],
        }],
      }),
    };
    const engine = new ManualSearchEngine(cnjLike, new SearchRepository(database));

    const saved = await engine.run({ profiles: [profile], startDate: "2026-06-10", endDate: "2026-06-10" });
    const publications = new PublicationRepository(database);

    assert.equal(saved.newPublicationCount, 1, "mesma chave em outra fonte é publicação nova");
    assert.equal((await publications.list({}, 50, 0)).total, 4, "as três da fonte simulada continuam salvas");
  });

  it("um erro da fonte vira mensagem compreensível", async () => {
    const provider = createRestProvider(config(port, {
      query: { ...config(port).query, oab: "documento" },
    }), httpTransport);
    const engine = new ManualSearchEngine(provider, new SearchRepository(database));

    await assert.rejects(
      engine.run({ profiles: [profile], startDate: "2026-06-10", endDate: "2026-06-10" }),
      /HTTP 400/,
    );
  });
});
