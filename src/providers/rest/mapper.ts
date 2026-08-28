import type { Attorney, Publication, Recipient } from "../../djen/types.ts";
import type { FieldMapping } from "./types.ts";

/**
 * Lê um caminho em notação de ponto dentro da resposta, aceitando índices de lista.
 * `dados.0.itens` funciona tanto para objetos quanto para arrays.
 */
export function readPath(value: unknown, path: string): unknown {
  if (!path) return undefined;
  let current = value;
  for (const step of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(step);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[step];
    } else {
      return undefined;
    }
  }
  return current;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function optionalText(value: unknown): string | undefined {
  const normalized = text(value).trim();
  return normalized || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Aceita a data em ISO completo ou já em AAAA-MM-DD. */
function day(value: unknown): string {
  const raw = text(value).trim();
  return raw.length > 10 && raw.includes("T") ? raw.slice(0, 10) : raw;
}

function mapAttorneys(item: unknown, mapping: FieldMapping): Attorney[] {
  if (!mapping.attorneys) return [];
  return list(readPath(item, mapping.attorneys))
    .map((entry) => ({
      name: text(readPath(entry, mapping.attorneyName ?? "nome")),
      oab: text(readPath(entry, mapping.attorneyOab ?? "oab")),
      uf: text(readPath(entry, mapping.attorneyUf ?? "uf")).toUpperCase(),
    }))
    .filter((attorney) => attorney.name && attorney.oab && attorney.uf);
}

function mapRecipients(item: unknown, mapping: FieldMapping): Recipient[] {
  if (!mapping.recipients) return [];
  return list(readPath(item, mapping.recipients))
    .map((entry): Recipient => ({
      name: text(readPath(entry, mapping.recipientName ?? "nome")),
      role: optionalText(readPath(entry, mapping.recipientRole ?? "polo")),
    }))
    .filter((recipient) => recipient.name);
}

export function mapPublication(item: unknown, mapping: FieldMapping, source: string): Publication {
  return {
    sourceId: text(readPath(item, mapping.sourceId)),
    source,
    availableOn: day(readPath(item, mapping.availableOn)),
    tribunal: text(readPath(item, mapping.tribunal)),
    communicationType: text(readPath(item, mapping.communicationType)),
    courtUnit: text(readPath(item, mapping.courtUnit)),
    text: text(readPath(item, mapping.text)),
    processNumber: text(readPath(item, mapping.processNumber)),
    medium: "D",
    officialLink: mapping.officialLink ? optionalText(readPath(item, mapping.officialLink)) : undefined,
    documentType: mapping.documentType ? optionalText(readPath(item, mapping.documentType)) : undefined,
    className: mapping.className ? optionalText(readPath(item, mapping.className)) : undefined,
    communicationNumber: mapping.communicationNumber
      ? optionalNumber(readPath(item, mapping.communicationNumber))
      : undefined,
    hash: optionalText(readPath(item, mapping.sourceId)),
    recipients: mapRecipients(item, mapping),
    attorneys: mapAttorneys(item, mapping),
  };
}

export function mapPage(
  payload: unknown,
  mapping: FieldMapping,
  source: string,
): { items: Publication[]; total?: number } {
  const raw = readPath(payload, mapping.items);
  if (!Array.isArray(raw)) {
    throw new Error(`A resposta não trouxe uma lista em "${mapping.items}".`);
  }
  return {
    items: raw.map((item) => mapPublication(item, mapping, source)),
    total: mapping.total ? optionalNumber(readPath(payload, mapping.total)) : undefined,
  };
}
