import type { ApplicationDatabase } from "../database.ts";

type SettingRow = { value: string };
export type RetentionDays = 0 | 30 | 90 | 180;

export type MonitorHistory = {
  time: string;
  lastAttempt?: string;
  lastSuccess?: string;
  lastError?: string;
};

const RETENTION_VALUES = new Set<RetentionDays>([0, 30, 90, 180]);

export class SettingsRepository {
  private readonly database: ApplicationDatabase;

  constructor(database: ApplicationDatabase) {
    this.database = database;
  }

  async isMonitoringEnabled(): Promise<boolean> {
    return (await this.getValue("monitoring_enabled")) === "1";
  }

  async setMonitoringEnabled(enabled: boolean): Promise<void> {
    await this.setValue("monitoring_enabled", enabled ? "1" : "0");
  }

  async getMonitorHistory(): Promise<MonitorHistory> {
    const [time, lastAttempt, lastSuccess, lastError] = await Promise.all([
      this.getValue("monitoring_time"),
      this.getValue("monitoring_last_attempt"),
      this.getValue("monitoring_last_success"),
      this.getValue("monitoring_last_error"),
    ]);
    return { time: time ?? "08:00", lastAttempt, lastSuccess, lastError: lastError || undefined };
  }

  async setMonitorTime(time: string): Promise<void> {
    await this.setValue("monitoring_time", time);
  }

  async recordMonitorAttempt(at: string): Promise<void> {
    await this.setValue("monitoring_last_attempt", at);
  }

  async recordMonitorSuccess(at: string): Promise<void> {
    await Promise.all([
      this.setValue("monitoring_last_success", at),
      this.setValue("monitoring_last_error", ""),
    ]);
  }

  async recordMonitorError(message: string): Promise<void> {
    await this.setValue("monitoring_last_error", message);
  }

  async isOnboardingCompleted(): Promise<boolean> {
    return (await this.getValue("onboarding_completed")) === "1";
  }

  async setOnboardingCompleted(): Promise<void> {
    await this.setValue("onboarding_completed", "1");
  }

  async getRetentionDays(): Promise<RetentionDays> {
    const value = Number(await this.getValue("retention_days"));
    return RETENTION_VALUES.has(value as RetentionDays) ? value as RetentionDays : 0;
  }

  async setRetentionDays(days: RetentionDays): Promise<void> {
    await this.setValue("retention_days", String(days));
  }

  /** Limite de armazenamento escolhido pelo usuário, em MB. Zero significa `Sem limite`. */
  async getStorageLimitMb(): Promise<number> {
    const value = Number(await this.getValue("storage_limit_mb"));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  async setStorageLimitMb(limit: number): Promise<void> {
    await this.setValue("storage_limit_mb", String(Math.max(Math.trunc(limit), 0)));
  }

  /** Fonte de dados escolhida. Ausente significa o provedor padrão do CNJ. */
  async getActiveProvider(): Promise<string | undefined> {
    return this.getValue("active_provider");
  }

  async setActiveProvider(id: string): Promise<void> {
    await this.setValue("active_provider", id);
  }

  /** Dia da última limpeza automática, para não repeti-la a cada abertura. */
  async getRetentionLastRun(): Promise<string | undefined> {
    return this.getValue("retention_last_run");
  }

  async setRetentionLastRun(day: string): Promise<void> {
    await this.setValue("retention_last_run", day);
  }

  private async getValue(key: string): Promise<string | undefined> {
    const rows = await this.database.select<SettingRow[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [key],
    );
    return rows[0]?.value;
  }

  private async setValue(key: string, value: string): Promise<void> {
    await this.database.execute(
      `INSERT INTO app_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}
