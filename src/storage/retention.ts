import type { RetentionDays } from "../settings/repository.ts";

/** Faixas em que o tamanho do banco passa a merecer atenção, em MB. */
export const SIZE_ALERTS = [250, 500, 1024] as const;

const MEGABYTE = 1024 * 1024;

/** Data limite da retenção: tudo disponibilizado antes dela pode ser apagado. */
export function retentionCutoff(now: Date, days: RetentionDays): string | undefined {
  if (days === 0) return undefined;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const month = String(cutoff.getMonth() + 1).padStart(2, "0");
  const day = String(cutoff.getDate()).padStart(2, "0");
  return `${cutoff.getFullYear()}-${month}-${day}`;
}

export function megabytes(bytes: number): number {
  return bytes / MEGABYTE;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * MEGABYTE) return `${megabytes(bytes).toFixed(1)} MB`;
  return `${(bytes / (1024 * MEGABYTE)).toFixed(2)} GB`;
}

/** Maior faixa já ultrapassada, em MB, ou indefinido enquanto o banco estiver abaixo de todas. */
export function crossedAlert(bytes: number): number | undefined {
  const size = megabytes(bytes);
  return [...SIZE_ALERTS].reverse().find((limit) => size >= limit);
}

export function overLimit(bytes: number, limitMb: number): boolean {
  return limitMb > 0 && megabytes(bytes) >= limitMb;
}
