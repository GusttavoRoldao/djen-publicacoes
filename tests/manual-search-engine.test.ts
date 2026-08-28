import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Publication } from "../src/djen/types.ts";
import type { PublicationProvider } from "../src/providers/publication-provider.ts";
import { ManualSearchEngine, searchErrorMessage, splitDateRange } from "../src/search/engine.ts";
import type { SearchSaveInput, SearchStorage } from "../src/search/types.ts";

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
    recipients: [],
    attorneys: [{ name: profile.name, oab: profile.oabNumber, uf: profile.oabUf }],
  };
}

class MemoryStorage implements SearchStorage {
  saved?: SearchSaveInput;

  async save(input: SearchSaveInput): Promise<{ id: string; resultCount: number; newPublicationCount: number; warnings: string[] }> {
    this.saved = input;
    return { id: "search-1", resultCount: input.publications.length, newPublicationCount: input.publications.length, warnings: input.warnings };
  }
}

describe("ManualSearchEngine", () => {
  it("divide intervalos longos em períodos sequenciais", () => {
    assert.deepEqual(splitDateRange("2026-06-01", "2026-06-15"), [
      { startDate: "2026-06-01", endDate: "2026-06-07" },
      { startDate: "2026-06-08", endDate: "2026-06-14" },
      { startDate: "2026-06-15", endDate: "2026-06-15" },
    ]);
  });

  it("pesquisa múltiplas OABs com tribunal e deduplica a entrada", async () => {
    const queries: string[] = [];
    const provider: PublicationProvider = {
      id: "fake",
      name: "Fake",
      search: async (query) => {
        queries.push(`${query.oab}:${query.tribunal}`);
        return { total: 1, publications: [publication("igual")], rateLimit: {} };
      },
    };
    const storage = new MemoryStorage();
    const engine = new ManualSearchEngine(provider, storage, { today: () => new Date("2026-08-27T12:00:00") });

    await engine.run({
      profiles: [profile, { ...profile, id: 2, name: "Paulo Nunes", oabNumber: "77777" }],
      startDate: "2026-06-10",
      endDate: "2026-06-10",
      tribunal: "trt2",
    });

    assert.deepEqual(queries, ["123456:TRT2", "77777:TRT2"]);
    assert.equal(storage.saved?.publications.length, 1);
  });

  it("aceita um intervalo histórico sem tribunal", async () => {
    let receivedPeriod = "";
    let receivedTribunal: string | undefined;
    const provider: PublicationProvider = {
      id: "fake",
      name: "Fake",
      search: async (query) => {
        receivedPeriod = `${query.startDate}:${query.endDate}`;
        receivedTribunal = query.tribunal;
        return { total: 0, publications: [], rateLimit: {} };
      },
    };
    const storage = new MemoryStorage();

    await new ManualSearchEngine(provider, storage, {
      today: () => new Date("2026-08-27T12:00:00"),
    }).run({ profiles: [profile], startDate: "2023-08-23", endDate: "2023-08-23" });

    assert.equal(receivedPeriod, "2023-08-23:2023-08-23");
    assert.equal(receivedTribunal, undefined);
    assert.equal(storage.saved?.publications.length, 0);
  });

  it("subdivide novamente um período que atinge o limite da API", async () => {
    const periods: string[] = [];
    const provider: PublicationProvider = {
      id: "fake",
      name: "Fake",
      search: async (query) => {
        periods.push(`${query.startDate}:${query.endDate}`);
        const saturated = query.startDate === "2026-06-01" && query.endDate === "2026-06-07";
        return { total: saturated ? 10 : 1, publications: saturated ? [] : [publication(periods.at(-1)!)], rateLimit: {} };
      },
    };
    const storage = new MemoryStorage();
    const engine = new ManualSearchEngine(provider, storage, {
      resultLimit: 10,
      today: () => new Date("2026-08-27T12:00:00"),
    });

    await engine.run({ profiles: [profile], startDate: "2026-06-01", endDate: "2026-06-07" });

    assert.deepEqual(periods, [
      "2026-06-01:2026-06-07",
      "2026-06-01:2026-06-04",
      "2026-06-05:2026-06-07",
    ]);
    assert.equal(storage.saved?.publications.length, 2);
  });

  it("avisa quando um único dia atinge o limite", async () => {
    const provider: PublicationProvider = {
      id: "fake",
      name: "Fake",
      search: async () => ({ total: 10, publications: [publication("limite")], rateLimit: {} }),
    };
    const result = await new ManualSearchEngine(provider, new MemoryStorage(), {
      resultLimit: 10,
      today: () => new Date("2026-08-27T12:00:00"),
    }).run({ profiles: [profile], startDate: "2026-06-10", endDate: "2026-06-10" });

    assert.match(result.warnings[0] ?? "", /Refine por tribunal/);
  });

  it("cancela a fila sem chamar o armazenamento", async () => {
    const controller = new AbortController();
    const provider: PublicationProvider = {
      id: "fake",
      name: "Fake",
      search: async (_query, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      }),
    };
    const storage = new MemoryStorage();
    const execution = new ManualSearchEngine(provider, storage, {
      today: () => new Date("2026-08-27T12:00:00"),
    }).run({ profiles: [profile], startDate: "2026-06-01", endDate: "2026-06-15" }, { signal: controller.signal });

    controller.abort(new DOMException("Cancelada", "AbortError"));

    await assert.rejects(execution, /Cancelada/);
    assert.equal(storage.saved, undefined);
  });

  it("rejeita data futura e traduz falhas de conexão", async () => {
    const provider: PublicationProvider = {
      id: "fake",
      name: "Fake",
      search: async () => ({ total: 0, publications: [], rateLimit: {} }),
    };
    const engine = new ManualSearchEngine(provider, new MemoryStorage(), {
      today: () => new Date("2026-08-27T12:00:00"),
    });

    await assert.rejects(
      engine.run({ profiles: [profile], startDate: "2026-08-28", endDate: "2026-08-28" }),
      /datas futuras/,
    );
    assert.match(searchErrorMessage(new TypeError("Failed to fetch")), /Verifique sua internet/);
    assert.match(searchErrorMessage(new Error("error sending request for url (https://example.test)")), /Verifique sua internet/);
    assert.match(searchErrorMessage(new Error("HTTP 403")), /VPN ou proxy/);
  });
});
