import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RestClient, type RestTransportRequest, type RestTransportResponse } from "../src/providers/rest/client.ts";
import { mapPage, readPath } from "../src/providers/rest/mapper.ts";
import { emptyConfig, type RestProviderConfig } from "../src/providers/rest/types.ts";
import { exportConfig, importConfig, validateConfig, withoutSecrets } from "../src/providers/rest/validation.ts";

function config(overrides: Partial<RestProviderConfig> = {}): RestProviderConfig {
  const base = emptyConfig("fonte-teste");
  return {
    ...base,
    name: "Fonte de teste",
    baseUrl: "https://api.exemplo.com/v1/publicacoes",
    ...overrides,
  };
}

/** Resposta com campos aninhados, como várias APIs comerciais devolvem. */
const NESTED_MAPPING = {
  items: "dados.resultados",
  total: "dados.paginacao.total",
  sourceId: "identificacao.hash",
  availableOn: "datas.disponibilizacao",
  tribunal: "orgao.sigla",
  communicationType: "tipo",
  courtUnit: "orgao.nome",
  text: "conteudo.integra",
  processNumber: "processo.numero",
  officialLink: "links.oficial",
  attorneys: "partes.advogados",
  attorneyName: "nome",
  attorneyOab: "inscricao.numero",
  attorneyUf: "inscricao.uf",
  recipients: "partes.envolvidos",
  recipientName: "nome",
  recipientRole: "polo",
};

function nestedItem(id: string) {
  return {
    identificacao: { hash: id },
    datas: { disponibilizacao: "2026-06-10T00:00:00Z" },
    orgao: { sigla: "TJSP", nome: "3ª Vara Cível" },
    tipo: "Intimação",
    conteudo: { integra: "Texto integral da intimação." },
    processo: { numero: "1000000-11.2020.8.26.0100" },
    links: { oficial: "https://exemplo.com/publicacao/1" },
    partes: {
      advogados: [{ nome: "Maria Silva", inscricao: { numero: "123456", uf: "pe" } }],
      envolvidos: [{ nome: "Empresa Ré", polo: "Passivo" }],
    },
  };
}

function nestedPage(ids: string[], total: number) {
  return { dados: { paginacao: { total }, resultados: ids.map(nestedItem) } };
}

function transportOf(pages: unknown[], seen: RestTransportRequest[] = []): {
  transport: (request: RestTransportRequest) => Promise<RestTransportResponse>;
  seen: RestTransportRequest[];
} {
  let call = 0;
  return {
    seen,
    transport: async (request) => {
      seen.push(request);
      const body = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return { status: 200, body: JSON.stringify(body) };
    },
  };
}

const SEARCH = { oab: "123456", uf: "PE", startDate: "2026-06-10", endDate: "2026-06-11" };

describe("leitura de caminhos na resposta", () => {
  it("lê campos aninhados e índices de lista", () => {
    const value = { a: { b: [{ c: "achou" }] } };

    assert.equal(readPath(value, "a.b.0.c"), "achou");
    assert.equal(readPath(value, "a.b.1.c"), undefined);
    assert.equal(readPath(value, "a.x.y"), undefined);
    assert.equal(readPath(value, ""), undefined);
  });
});

describe("mapeamento da resposta", () => {
  it("converte JSON aninhado em publicações normalizadas", () => {
    const mapped = mapPage(nestedPage(["hash-1"], 1), NESTED_MAPPING, "fonte-teste");
    const publication = mapped.items[0];

    assert.equal(mapped.total, 1);
    assert.equal(publication?.source, "fonte-teste");
    assert.equal(publication?.sourceId, "hash-1");
    assert.equal(publication?.availableOn, "2026-06-10", "aceita data em ISO completo");
    assert.equal(publication?.tribunal, "TJSP");
    assert.equal(publication?.courtUnit, "3ª Vara Cível");
    assert.equal(publication?.text, "Texto integral da intimação.");
    assert.equal(publication?.officialLink, "https://exemplo.com/publicacao/1");
    assert.deepEqual(publication?.attorneys, [{ name: "Maria Silva", oab: "123456", uf: "PE" }]);
    assert.deepEqual(publication?.recipients, [{ name: "Empresa Ré", role: "Passivo" }]);
  });

  it("avisa quando o caminho da lista não existe na resposta", () => {
    assert.throws(
      () => mapPage({ outro: [] }, NESTED_MAPPING, "fonte-teste"),
      /dados\.resultados/,
    );
  });
});

describe("RestClient", () => {
  it("monta a URL com os nomes de parâmetro configurados", async () => {
    const { transport, seen } = transportOf([nestedPage(["hash-1"], 1)]);
    const client = new RestClient(config({
      mapping: NESTED_MAPPING,
      query: { oab: "oab", uf: "seccional", startDate: "de", endDate: "ate", tribunal: "corte", page: "p", pageSize: "tamanho" },
      extraParams: [{ name: "meio", value: "D" }],
      pageSize: 50,
    }), { transport });

    await client.search({ ...SEARCH, tribunal: "TJSP" });
    const url = new URL(seen[0]!.url);

    assert.equal(url.searchParams.get("oab"), "123456");
    assert.equal(url.searchParams.get("seccional"), "PE");
    assert.equal(url.searchParams.get("de"), "2026-06-10");
    assert.equal(url.searchParams.get("ate"), "2026-06-11");
    assert.equal(url.searchParams.get("corte"), "TJSP");
    assert.equal(url.searchParams.get("p"), "1");
    assert.equal(url.searchParams.get("tamanho"), "50");
    assert.equal(url.searchParams.get("meio"), "D");
  });

  it("pagina até completar o total informado pela fonte", async () => {
    const { transport, seen } = transportOf([
      nestedPage(["a", "b"], 3),
      nestedPage(["c"], 3),
    ]);
    const client = new RestClient(config({ mapping: NESTED_MAPPING, pageSize: 2 }), { transport });

    const result = await client.search(SEARCH);

    assert.equal(result.total, 3);
    assert.equal(result.publications.length, 3);
    assert.equal(seen.length, 2);
    assert.equal(new URL(seen[1]!.url).searchParams.get("pagina"), "2");
  });

  it("para quando a página vem menor que o pedido e a fonte não informa total", async () => {
    const mapping = { ...NESTED_MAPPING, total: "" };
    const { transport, seen } = transportOf([nestedPage(["a"], 0)]);
    const client = new RestClient(config({ mapping, pageSize: 2 }), { transport });

    const result = await client.search(SEARCH);

    assert.equal(result.publications.length, 1);
    assert.equal(seen.length, 1);
  });

  it("respeita a primeira página zero", async () => {
    const { transport, seen } = transportOf([nestedPage(["a"], 1)]);
    const client = new RestClient(config({ mapping: NESTED_MAPPING, firstPage: 0 }), { transport });

    await client.search(SEARCH);

    assert.equal(new URL(seen[0]!.url).searchParams.get("pagina"), "0");
  });

  it("repete após HTTP 429 e desiste com mensagem própria", async () => {
    const waits: number[] = [];
    let calls = 0;
    const client = new RestClient(config({ mapping: NESTED_MAPPING }), {
      transport: async () => {
        calls += 1;
        return { status: 429, body: "", retryAfter: 2 };
      },
      sleep: async (milliseconds) => { waits.push(milliseconds); },
      retries: 2,
    });

    await assert.rejects(client.search(SEARCH), /limitou as consultas/);
    assert.equal(calls, 3);
    assert.deepEqual(waits, [2000, 2000]);
  });

  it("traduz erro HTTP e resposta que não é JSON", async () => {
    const failing = new RestClient(config({ mapping: NESTED_MAPPING }), {
      transport: async () => ({ status: 503, body: "" }),
    });
    const broken = new RestClient(config({ mapping: NESTED_MAPPING }), {
      transport: async () => ({ status: 200, body: "<html>erro</html>" }),
    });

    await assert.rejects(failing.search(SEARCH), /HTTP 503/);
    await assert.rejects(broken.search(SEARCH), /não devolveu JSON válido/);
  });

  it("envia a forma de autenticação escolhida sem carregar a chave", async () => {
    const { transport, seen } = transportOf([nestedPage(["a"], 1)]);
    const client = new RestClient(config({
      mapping: NESTED_MAPPING,
      authMode: "header-key",
      authName: "X-Api-Key",
      headers: [{ name: "X-Cliente", value: "djen" }],
    }), { transport });

    await client.search(SEARCH);
    const request = seen[0]!;

    assert.equal(request.authMode, "header-key");
    assert.equal(request.authName, "X-Api-Key");
    assert.deepEqual(request.headers, [["X-Cliente", "djen"]]);
    assert.ok(!JSON.stringify(request).toLowerCase().includes("secret"));
  });

  it("cancela a fila pelo sinal", async () => {
    const controller = new AbortController();
    const client = new RestClient(config({ mapping: NESTED_MAPPING }), {
      transport: async () => {
        controller.abort();
        return { status: 200, body: JSON.stringify(nestedPage(["a", "b"], 10)) };
      },
    });

    await assert.rejects(client.search(SEARCH, { signal: controller.signal }));
  });
});

describe("configuração da fonte", () => {
  it("rejeita configuração sem os campos mínimos", () => {
    const problems = validateConfig(config({
      name: "",
      baseUrl: "http://api.exemplo.com",
      authMode: "header-key",
      authName: "",
      mapping: { ...emptyConfig("x").mapping, items: "", text: "" },
      pageSize: 0,
    }));

    assert.ok(problems.some((problem) => problem.includes("nome para a fonte")));
    assert.ok(problems.some((problem) => problem.includes("HTTPS")));
    assert.ok(problems.some((problem) => problem.includes("cabeçalho")));
    assert.ok(problems.some((problem) => problem.includes("lista de resultados")));
    assert.ok(problems.some((problem) => problem.includes("texto")));
    assert.ok(problems.some((problem) => problem.includes("entre 1 e 500")));
  });

  it("aceita uma configuração completa", () => {
    assert.deepEqual(validateConfig(config({ mapping: NESTED_MAPPING })), []);
  });

  it("não deixa usar o identificador reservado da fonte padrão", () => {
    const problems = validateConfig(config({ id: "djen-cnj" }));

    assert.ok(problems.some((problem) => problem.includes("reservado")));
  });

  it("exporta sem qualquer credencial e importa de volta", () => {
    const original = config({
      mapping: NESTED_MAPPING,
      authMode: "bearer",
      headers: [{ name: "X-Cliente", value: "djen" }, { name: "Authorization", value: "Bearer abc123" }],
      extraParams: [{ name: "meio", value: "D" }, { name: "api_key", value: "abc123" }],
    });

    const exported = exportConfig(original);
    const imported = importConfig(exported, "outra-fonte");

    assert.ok(!exported.includes("abc123"), "nenhuma credencial pode sair na exportação");
    assert.ok(!exported.toLowerCase().includes("authorization"));
    assert.deepEqual(imported.headers, [{ name: "X-Cliente", value: "djen" }]);
    assert.deepEqual(imported.extraParams, [{ name: "meio", value: "D" }]);
    assert.equal(imported.id, "outra-fonte");
    assert.equal(imported.authMode, "bearer");
    assert.equal(imported.mapping.items, "dados.resultados");
  });

  it("descarta credenciais embutidas em um arquivo importado", () => {
    const smuggled = JSON.stringify({
      format: "djen-publicacoes/provider",
      version: 1,
      provider: { ...config({ mapping: NESTED_MAPPING }), headers: [{ name: "X-Api-Key", value: "roubada" }] },
    });

    const imported = importConfig(smuggled, "fonte-importada");

    assert.deepEqual(imported.headers, []);
    assert.ok(!JSON.stringify(imported).includes("roubada"));
  });

  it("recusa um arquivo que não é do aplicativo", () => {
    assert.throws(() => importConfig("{}", "x"), /não é uma configuração de fonte/);
    assert.throws(() => importConfig("não é json", "x"), /JSON válido/);
  });

  it("remove pares suspeitos de carregar segredo", () => {
    const clean = withoutSecrets(config({
      headers: [{ name: "X-API-KEY", value: "a" }, { name: "Accept-Language", value: "pt-BR" }],
      extraParams: [{ name: "token", value: "b" }, { name: "meio", value: "D" }],
    }));

    assert.deepEqual(clean.headers, [{ name: "Accept-Language", value: "pt-BR" }]);
    assert.deepEqual(clean.extraParams, [{ name: "meio", value: "D" }]);
  });
});
