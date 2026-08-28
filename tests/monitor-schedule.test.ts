import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoveryStartDate, shouldRunMonitor, validMonitorTime } from "../src/monitor/schedule.ts";

describe("agendamento do monitor", () => {
  it("aceita somente horários válidos", () => {
    assert.equal(validMonitorTime("08:30"), true);
    assert.equal(validMonitorTime("24:00"), false);
  });

  it("executa uma vez após o horário configurado", () => {
    const now = new Date(2026, 7, 27, 9, 0);
    assert.equal(shouldRunMonitor(now, "08:00"), true);
    assert.equal(shouldRunMonitor(now, "08:00", new Date(2026, 7, 27, 8, 5).toISOString()), false);
    assert.equal(shouldRunMonitor(now, "10:00"), false);
  });

  it("recupera desde o dia do último sucesso", () => {
    const now = new Date(2026, 7, 27, 9, 0);
    assert.equal(recoveryStartDate(now, new Date(2026, 7, 24, 8, 0).toISOString()), "2026-08-24");
    assert.equal(recoveryStartDate(now), "2026-08-27");
  });
});
