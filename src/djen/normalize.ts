import type { Attorney, Publication, Recipient } from "./types.ts";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  const normalized = text(value).trim();
  return normalized || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeRecipients(value: unknown): Recipient[] {
  return Array.isArray(value)
    ? value.map(record).map((recipient) => ({
        name: text(recipient.nome),
        role: optionalText(recipient.polo),
      })).filter((recipient) => recipient.name)
    : [];
}

function normalizeAttorneys(value: unknown): Attorney[] {
  if (!Array.isArray(value)) return [];

  return value.map(record).map((entry) => record(entry.advogado)).map((attorney) => ({
    name: text(attorney.nome),
    oab: text(attorney.numero_oab),
    uf: text(attorney.uf_oab).toUpperCase(),
  })).filter((attorney) => attorney.name && attorney.oab && attorney.uf);
}

export function normalizePublication(value: unknown): Publication {
  const item = record(value);
  const id = optionalNumber(item.id);
  const hash = optionalText(item.hash);

  return {
    sourceId: hash ?? (id === undefined ? "" : String(id)),
    source: "DJEN/CNJ",
    availableOn: text(item.data_disponibilizacao),
    tribunal: text(item.siglaTribunal),
    communicationType: text(item.tipoComunicacao),
    courtUnit: text(item.nomeOrgao),
    text: text(item.texto),
    processNumber: text(item.numeroprocessocommascara) || text(item.numero_processo),
    medium: "D",
    officialLink: optionalText(item.link),
    documentType: optionalText(item.tipoDocumento),
    className: optionalText(item.nomeClasse),
    communicationNumber: optionalNumber(item.numeroComunicacao),
    hash,
    recipients: normalizeRecipients(item.destinatarios),
    attorneys: normalizeAttorneys(item.destinatarioadvogados),
  };
}
