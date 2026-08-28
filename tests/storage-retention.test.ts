import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crossedAlert, formatBytes, overLimit, retentionCutoff } from "../src/storage/retention.ts";

const MB = 1024 * 1024;

describe("retenção e faixas de armazenamento", () => {
  it("não define data limite quando a escolha é nunca apagar", () => {
    assert.equal(retentionCutoff(new Date(2026, 7, 27), 0), undefined);
  });

  it("calcula a data limite a partir da escolha do usuário", () => {
    const now = new Date(2026, 7, 27);

    assert.equal(retentionCutoff(now, 30), "2026-07-28");
    assert.equal(retentionCutoff(now, 90), "2026-05-29");
    assert.equal(retentionCutoff(now, 180), "2026-02-28");
  });

  it("atravessa a virada de ano sem erro", () => {
    assert.equal(retentionCutoff(new Date(2026, 0, 10), 30), "2025-12-11");
  });

  it("avisa somente a partir de cada faixa definida", () => {
    assert.equal(crossedAlert(200 * MB), undefined);
    assert.equal(crossedAlert(250 * MB), 250);
    assert.equal(crossedAlert(499 * MB), 250);
    assert.equal(crossedAlert(500 * MB), 500);
    assert.equal(crossedAlert(1024 * MB), 1024);
    assert.equal(crossedAlert(3 * 1024 * MB), 1024);
  });

  it("compara com o limite escolhido, tratando zero como sem limite", () => {
    assert.equal(overLimit(900 * MB, 0), false);
    assert.equal(overLimit(400 * MB, 500), false);
    assert.equal(overLimit(500 * MB, 500), true);
  });

  it("mostra o tamanho em unidade legível", () => {
    assert.equal(formatBytes(820), "820 B");
    assert.equal(formatBytes(64 * 1024), "64 KB");
    assert.equal(formatBytes(12.5 * MB), "12.5 MB");
    assert.equal(formatBytes(2.25 * 1024 * MB), "2.25 GB");
  });
});
