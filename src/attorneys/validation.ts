import type { PublicationProvider } from "../providers/publication-provider.ts";
import type { AttorneyValidationStatus } from "./types.ts";

export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const STATE_SET = new Set<string>(BRAZILIAN_STATES);

export type NormalizedRegistration = {
  number: string;
  uf: string;
};

export function normalizeRegistration(number: string, uf: string): NormalizedRegistration {
  const normalizedNumber = number.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const normalizedUf = uf.trim().toUpperCase();

  if (!/^\d{1,8}[A-Z]{0,2}$/.test(normalizedNumber)) {
    throw new Error("Informe um número de OAB válido.");
  }
  if (!STATE_SET.has(normalizedUf)) {
    throw new Error("Selecione uma UF válida.");
  }
  return { number: normalizedNumber, uf: normalizedUf };
}

export function formatRegistration(number: string, uf: string): string {
  return `OAB ${uf} ${number}`;
}

function matchesRegistration(number: string, uf: string, target: NormalizedRegistration): boolean {
  try {
    const normalized = normalizeRegistration(number, uf);
    return normalized.number === target.number && normalized.uf === target.uf;
  } catch {
    return false;
  }
}

function dateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function validateRegistration(
  provider: PublicationProvider,
  registration: NormalizedRegistration,
  today = new Date(),
): Promise<AttorneyValidationStatus> {
  const date = dateValue(today);
  try {
    const result = await provider.search({
      oab: registration.number,
      uf: registration.uf,
      startDate: date,
      endDate: date,
    });
    const found = result.publications.some((publication) => publication.attorneys.some(
      (attorney) => matchesRegistration(attorney.oab, attorney.uf, registration),
    ));
    return found ? "confirmed" : "no_recent_publications";
  } catch {
    return "unavailable";
  }
}
