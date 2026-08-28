import { invoke, isTauri } from "@tauri-apps/api/core";
import { getAttorneyRepository } from "../attorneys/database.ts";
import type { AttorneyProfile } from "../attorneys/types.ts";
import { localDate } from "../monitor/schedule.ts";
import { DJEN_PROVIDER_ID } from "../providers/rest/types.ts";
import { getSettingsRepository } from "../settings/database.ts";
import type { RetentionDays } from "../settings/repository.ts";
import { storageApi } from "../storage/database.ts";
import { retentionCutoff } from "../storage/retention.ts";

export type MonitoringState = {
  available: boolean;
  enabled: boolean;
  time: string;
  running: boolean;
  lastAttempt?: string;
  lastSuccess?: string;
  lastError?: string;
};

export type WorkspaceState = {
  monitoring: MonitoringState;
  onboardingCompleted: boolean;
  retentionDays: RetentionDays;
  storageLimitMb: number;
  activeProviderId: string;
  profiles: AttorneyProfile[];
};

export async function loadWorkspaceState(): Promise<WorkspaceState> {
  if (!isTauri()) {
    return {
      monitoring: { available: false, enabled: false, time: "08:00", running: false },
      onboardingCompleted: true,
      retentionDays: 0,
      storageLimitMb: 0,
      activeProviderId: DJEN_PROVIDER_ID,
      profiles: [],
    };
  }

  const [settings, attorneys] = await Promise.all([
    getSettingsRepository(),
    getAttorneyRepository(),
  ]);
  const [enabled, history, onboardingCompleted, retentionDays, storageLimitMb, activeProvider, profiles] = await Promise.all([
    settings.isMonitoringEnabled(),
    settings.getMonitorHistory(),
    settings.isOnboardingCompleted(),
    settings.getRetentionDays(),
    settings.getStorageLimitMb(),
    settings.getActiveProvider(),
    attorneys.list(),
  ]);
  await invoke("configure_monitoring", { enabled });
  return {
    monitoring: { available: true, enabled, running: false, ...history },
    onboardingCompleted,
    retentionDays,
    storageLimitMb,
    activeProviderId: activeProvider ?? DJEN_PROVIDER_ID,
    profiles,
  };
}

export async function saveMonitoringState(enabled: boolean): Promise<void> {
  const repository = await getSettingsRepository();
  const previous = await repository.isMonitoringEnabled();
  await repository.setMonitoringEnabled(enabled);

  try {
    await invoke("configure_monitoring", { enabled });
  } catch (error) {
    await repository.setMonitoringEnabled(previous);
    throw error;
  }
}

export async function saveMonitorTime(time: string): Promise<void> {
  const repository = await getSettingsRepository();
  await repository.setMonitorTime(time);
}

export async function saveRetentionDays(days: RetentionDays): Promise<void> {
  const repository = await getSettingsRepository();
  await repository.setRetentionDays(days);
}

export async function saveStorageLimit(limitMb: number): Promise<void> {
  const repository = await getSettingsRepository();
  await repository.setStorageLimitMb(limitMb);
}

/**
 * Limpeza automática do que passou do prazo escolhido, uma vez por dia na abertura.
 * Itens marcados como `Requer atenção` nunca entram nela.
 */
export async function runRetention(now: Date, days: RetentionDays): Promise<number> {
  if (!isTauri()) return 0;
  const cutoff = retentionCutoff(now, days);
  if (!cutoff) return 0;

  const repository = await getSettingsRepository();
  const today = localDate(now);
  if (await repository.getRetentionLastRun() === today) return 0;

  const result = await storageApi.applyRetention(cutoff);
  await repository.setRetentionLastRun(today);
  return result.publications;
}

export async function completeOnboarding(): Promise<void> {
  const repository = await getSettingsRepository();
  await repository.setOnboardingCompleted();
}

export function exitCompletely(): Promise<void> {
  return invoke("exit_completely");
}
