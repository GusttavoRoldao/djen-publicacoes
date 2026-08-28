import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicationProvider } from "../src/providers/publication-provider.ts";
import {
  normalizeRegistration,
  validateRegistration,
} from "../src/attorneys/validation.ts";
import type { Publication, SearchResult } from "../src/djen/types.ts";

function result(attorneys: Publication["attorneys"] = []): SearchResult {
  return {
    total: attorneys.length > 0 ? 1 : 0,
    rateLimit: {},
    publications: attorneys.length > 0 ? [{
      sourceId: "1",
      source: "DJEN/CNJ",
      availableOn: "2026-08-26",
      tribunal: "TJPE",
      communicationType: "Intimação",
      courtUnit: "Vara",
      text: "",
      processNumber: "",
      medium: "D",
      recipients: [],
      attorneys,
    }] : [],
  };
}

function provider(search: PublicationProvider["search"]): PublicationProvider {
  return { id: "test", name: "Teste", search };
}

describe("validação de OAB", () => {
  it("normaliza número com separadores e UF", () => {
    assert.deepEqual(normalizeRegistration("77.777-d", "pe"), { number: "77777D", uf: "PE" });
  });

  it("rejeita número vazio e UF inexistente", () => {
    assert.throws(() => normalizeRegistration("", "PE"), /número/);
    assert.throws(() => normalizeRegistration("77777", "XX"), /UF/);
  });

  it("confirma quando a API devolve a mesma inscrição", async () => {
    const api = provider(async () => result([{ name: "Ana", oab: "77.777", uf: "PE" }]));
    assert.equal(
      await validateRegistration(api, { number: "77777", uf: "PE" }, new Date("2026-08-26T12:00:00Z")),
      "confirmed",
    );
  });

  it("permite continuar sem publicação recente ou com API indisponível", async () => {
    const emptyApi = provider(async () => result());
    const unavailableApi = provider(async () => { throw new Error("offline"); });

    assert.equal(await validateRegistration(emptyApi, { number: "77777", uf: "PE" }), "no_recent_publications");
    assert.equal(await validateRegistration(unavailableApi, { number: "77777", uf: "PE" }), "unavailable");
  });
});
