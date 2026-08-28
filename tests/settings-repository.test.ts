import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApplicationDatabase, ExecuteResult } from "../src/database.ts";
import { SettingsRepository } from "../src/settings/repository.ts";

class MemoryDatabase implements ApplicationDatabase {
  readonly values = new Map<string, string>();

  async execute(_query: string, bindValues: unknown[] = []): Promise<ExecuteResult> {
    this.values.set(String(bindValues[0]), String(bindValues[1]));
    return { rowsAffected: 1 };
  }

  async select<T>(_query: string, bindValues: unknown[] = []): Promise<T> {
    const value = this.values.get(String(bindValues[0]));
    return (value === undefined ? [] : [{ value }]) as T;
  }
}

describe("SettingsRepository", () => {
  it("mantém o monitor desativado quando não existe configuração", async () => {
    const repository = new SettingsRepository(new MemoryDatabase());
    assert.equal(await repository.isMonitoringEnabled(), false);
  });

  it("persiste a escolha de monitoramento sem alterar outras configurações", async () => {
    const database = new MemoryDatabase();
    database.values.set("outra_configuracao", "preservar");
    const repository = new SettingsRepository(database);

    await repository.setMonitoringEnabled(true);

    assert.equal(await repository.isMonitoringEnabled(), true);
    assert.equal(database.values.get("outra_configuracao"), "preservar");
  });

  it("persiste onboarding e retenção", async () => {
    const repository = new SettingsRepository(new MemoryDatabase());

    await repository.setOnboardingCompleted();
    await repository.setRetentionDays(180);

    assert.equal(await repository.isOnboardingCompleted(), true);
    assert.equal(await repository.getRetentionDays(), 180);
  });

  it("persiste horário e histórico do monitor", async () => {
    const repository = new SettingsRepository(new MemoryDatabase());
    const attempt = "2026-08-27T11:00:00.000Z";

    await repository.setMonitorTime("09:30");
    await repository.recordMonitorAttempt(attempt);
    await repository.recordMonitorSuccess(attempt);

    assert.deepEqual(await repository.getMonitorHistory(), {
      time: "09:30",
      lastAttempt: attempt,
      lastSuccess: attempt,
      lastError: undefined,
    });
  });
});
