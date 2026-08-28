import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DjenClient } from "../src/djen/client.ts";

const search = {
  oab: "65.432-1n",
  uf: "sp",
  startDate: "2026-08-26",
  endDate: "2026-08-26",
};

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("normaliza a consulta e a publicação retornada", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/djen-page.json", import.meta.url), "utf8"));
  let requestedUrl = "";
  const client = new DjenClient({
    fetch: async (input) => {
      requestedUrl = String(input);
      return jsonResponse(fixture, { "x-ratelimit-limit": "25", "x-ratelimit-remaining": "24" });
    },
  });

  const result = await client.search(search);
  const url = new URL(requestedUrl);

  assert.equal(url.searchParams.get("numeroOab"), "654321N");
  assert.equal(url.searchParams.get("ufOab"), "SP");
  assert.equal(url.searchParams.get("itensPorPagina"), "100");
  assert.equal(url.searchParams.get("meio"), "D");
  assert.equal(result.rateLimit.remaining, 24);
  assert.deepEqual(result.publications[0]?.attorneys[0], {
    name: "ADVOGADO DE TESTE",
    oab: "654321N",
    uf: "SP",
  });
  assert.equal(result.publications[0]?.processNumber, "0000001-22.2020.8.26.0000");
});

test("pagina sequencialmente quando há mais de 100 resultados", async () => {
  const pages = [
    { count: 101, items: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) },
    { count: 101, items: [{ id: 101 }] },
  ];
  const requestedPages: string[] = [];
  const client = new DjenClient({
    fetch: async (input) => {
      requestedPages.push(new URL(String(input)).searchParams.get("pagina") ?? "");
      return jsonResponse(pages.shift());
    },
  });

  const result = await client.search(search);

  assert.deepEqual(requestedPages, ["1", "2"]);
  assert.equal(result.publications.length, 101);
});

test("trata resultado vazio sem nova requisição", async () => {
  let requests = 0;
  const client = new DjenClient({
    fetch: async () => {
      requests += 1;
      return jsonResponse({ count: 0, items: [] });
    },
  });

  const result = await client.search(search);

  assert.equal(requests, 1);
  assert.deepEqual(result.publications, []);
});

test("aguarda e tenta novamente após HTTP 429", async () => {
  const delays: number[] = [];
  let requests = 0;
  const client = new DjenClient({
    fetch: async () => {
      requests += 1;
      if (requests === 1) return new Response(null, { status: 429 });
      return jsonResponse({ count: 0, items: [] });
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  await client.search(search);

  assert.equal(requests, 2);
  assert.deepEqual(delays, [60_000]);
});

test("cancela também a espera após HTTP 429", async () => {
  const controller = new AbortController();
  const client = new DjenClient({
    fetch: async () => new Response(null, { status: 429 }),
    sleep: async (_milliseconds, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  const execution = client.search(search, { signal: controller.signal });

  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(new DOMException("Cancelada", "AbortError"));

  await assert.rejects(execution, /Cancelada/);
});

test("rejeita OAB vazia, UF inválida e intervalo invertido", async () => {
  const client = new DjenClient({ fetch: async () => jsonResponse({ count: 0, items: [] }) });

  await assert.rejects(() => client.search({ ...search, oab: "---" }), /número da OAB/);
  await assert.rejects(() => client.search({ ...search, uf: "S" }), /UF válida/);
  await assert.rejects(() => client.search({ ...search, startDate: "2026-02-30" }), /formato AAAA-MM-DD/);
  await assert.rejects(() => client.search({ ...search, startDate: "2026-08-27" }), /data inicial/);
});

test("rejeita resposta incompatível com o contrato", async () => {
  const client = new DjenClient({ fetch: async () => jsonResponse({ data: [] }) });

  await assert.rejects(() => client.search(search), /count e items/);
});
