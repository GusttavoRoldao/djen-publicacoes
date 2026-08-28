import type { ApplicationDatabase } from "../database.ts";
import { tidyUpperCase } from "./format.ts";
import { excerptOf, toReadableText } from "./text.ts";
import type {
  ExportRow,
  PublicationAttorney,
  PublicationCounts,
  PublicationDetail,
  PublicationFacets,
  PublicationFilters,
  PublicationPage,
  PublicationRecipient,
  PublicationSummary,
  PublicationsApi,
  ReviewStatus,
  SearchHistoryEntry,
} from "./types.ts";

export const EXCERPT_LENGTH = 320;

/**
 * Janela do texto lida para montar o trecho da lista. Parte dos tribunais devolve HTML, e o
 * cabeçalho da marcação sozinho já ocupa centenas de caracteres antes do conteúdo real.
 */
const EXCERPT_SOURCE_LENGTH = 6000;

/** Tamanho do lote da exportação, para não carregar todo o texto integral de uma vez. */
const EXPORT_BATCH = 500;

const REVIEW_STATUSES: ReviewStatus[] = ["unchecked", "checked", "discarded"];

type SummaryRow = {
  id: number;
  available_on: string;
  tribunal: string;
  communication_type: string;
  court_unit: string;
  process_number: string;
  class_name: string | null;
  raw_excerpt: string;
  text_length: number;
  status: string;
  needs_attention: number;
};

type DetailRow = SummaryRow & {
  source: string;
  source_id: string;
  medium: string;
  full_text: string;
  official_link: string | null;
  document_type: string | null;
  communication_number: number | null;
  official_hash: string | null;
};

type ExportQueryRow = {
  id: number;
  available_on: string;
  tribunal: string;
  communication_type: string;
  class_name: string | null;
  process_number: string;
  court_unit: string;
  source: string;
  source_id: string;
  official_link: string | null;
  full_text: string;
  status: string;
  needs_attention: number;
};

type AttorneyRow = {
  publication_id: number;
  name: string;
  oab_number: string;
  oab_uf: string;
};

type RecipientRow = {
  name: string;
  role: string;
};

type HistoryRow = {
  id: string;
  start_date: string;
  end_date: string;
  tribunal: string | null;
  executed_at: string;
  result_count: number;
  linked_count: number;
  warning: string | null;
};

type HistoryAttorneyRow = {
  search_id: string;
  attorney_name: string;
  oab_number: string;
  oab_uf: string;
};

const SUMMARY_COLUMNS = `
  p.id,
  p.available_on,
  p.tribunal,
  p.communication_type,
  p.court_unit,
  p.process_number,
  p.class_name,
  substr(p.full_text, 1, ${EXCERPT_SOURCE_LENGTH}) AS raw_excerpt,
  length(p.full_text) AS text_length,
  COALESCE(r.status, 'unchecked') AS status,
  COALESCE(r.needs_attention, 0) AS needs_attention
`;

function numbered(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${index += 1}`);
}

function reviewStatus(value: string): ReviewStatus {
  return REVIEW_STATUSES.includes(value as ReviewStatus) ? value as ReviewStatus : "unchecked";
}

function toSummary(row: SummaryRow, attorneys: PublicationAttorney[]): PublicationSummary {
  const { excerpt, truncated } = excerptOf(toReadableText(row.raw_excerpt), EXCERPT_LENGTH);
  return {
    id: row.id,
    availableOn: row.available_on,
    tribunal: row.tribunal,
    communicationType: row.communication_type,
    courtUnit: row.court_unit,
    processNumber: row.process_number,
    className: row.class_name ? tidyUpperCase(row.class_name) : undefined,
    excerpt,
    truncated: truncated || Number(row.text_length) > EXCERPT_SOURCE_LENGTH,
    status: reviewStatus(row.status),
    needsAttention: Number(row.needs_attention) === 1,
    attorneys,
  };
}

function buildConditions(filters: PublicationFilters): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.searchId) {
    clauses.push("EXISTS (SELECT 1 FROM search_publications sp WHERE sp.publication_id = p.id AND sp.search_id = ?)");
    values.push(filters.searchId);
  }
  if (filters.status) {
    clauses.push("COALESCE(r.status, 'unchecked') = ?");
    values.push(filters.status);
  }
  if (filters.needsAttention) {
    clauses.push("COALESCE(r.needs_attention, 0) = 1");
  }
  if (filters.tribunal) {
    clauses.push("p.tribunal = ?");
    values.push(filters.tribunal);
  }
  if (filters.oabNumber && filters.oabUf) {
    clauses.push(
      "EXISTS (SELECT 1 FROM publication_attorneys pa WHERE pa.publication_id = p.id AND pa.oab_number = ? AND pa.oab_uf = ?)",
    );
    values.push(filters.oabNumber, filters.oabUf);
  }
  if (filters.processNumber?.trim()) {
    clauses.push("p.process_number LIKE ?");
    values.push(`%${filters.processNumber.trim()}%`);
  }
  if (filters.startDate) {
    clauses.push("p.available_on >= ?");
    values.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push("p.available_on <= ?");
    values.push(filters.endDate);
  }
  if (filters.term?.trim()) {
    clauses.push("p.full_text LIKE ?");
    values.push(`%${filters.term.trim()}%`);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

export class PublicationRepository implements PublicationsApi {
  private readonly database: ApplicationDatabase;

  constructor(database: ApplicationDatabase) {
    this.database = database;
  }

  async list(filters: PublicationFilters, limit: number, offset: number): Promise<PublicationPage> {
    const { where, values } = buildConditions(filters);
    const direction = filters.order === "oldest" ? "ASC" : "DESC";
    const totals = await this.database.select<{ total: number }[]>(
      numbered(`SELECT COUNT(*) AS total
                FROM publications p
                LEFT JOIN publication_reviews r ON r.publication_id = p.id
                ${where}`),
      values,
    );
    const rows = await this.database.select<SummaryRow[]>(
      numbered(`SELECT ${SUMMARY_COLUMNS}
                FROM publications p
                LEFT JOIN publication_reviews r ON r.publication_id = p.id
                ${where}
                ORDER BY p.available_on ${direction}, p.id ${direction}
                LIMIT ? OFFSET ?`),
      [...values, limit, offset],
    );
    const attorneys = await this.attorneysOf(rows.map((row) => row.id));
    return {
      total: Number(totals[0]?.total ?? 0),
      offset,
      items: rows.map((row) => toSummary(row, attorneys.get(row.id) ?? [])),
    };
  }

  async detail(id: number): Promise<PublicationDetail | undefined> {
    const rows = await this.database.select<DetailRow[]>(
      numbered(`SELECT ${SUMMARY_COLUMNS},
                       p.source, p.source_id, p.medium, p.full_text, p.official_link,
                       p.document_type, p.communication_number, p.official_hash
                FROM publications p
                LEFT JOIN publication_reviews r ON r.publication_id = p.id
                WHERE p.id = ?`),
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;

    const [attorneys, recipients] = await Promise.all([
      this.attorneysOf([id]),
      this.database.select<RecipientRow[]>(
        numbered("SELECT name, role FROM publication_recipients WHERE publication_id = ? ORDER BY name COLLATE NOCASE"),
        [id],
      ),
    ]);

    return {
      ...toSummary(row, attorneys.get(id) ?? []),
      source: row.source,
      sourceId: row.source_id,
      medium: row.medium,
      text: row.full_text,
      readableText: toReadableText(row.full_text),
      officialLink: row.official_link ?? undefined,
      documentType: row.document_type ?? undefined,
      communicationNumber: row.communication_number ?? undefined,
      hash: row.official_hash ?? undefined,
      recipients: recipients.map((recipient): PublicationRecipient => ({
        name: recipient.name,
        role: recipient.role || undefined,
      })),
    };
  }

  async counts(): Promise<PublicationCounts> {
    const rows = await this.database.select<{
      total: number;
      unchecked: number | null;
      checked: number | null;
      discarded: number | null;
      attention: number | null;
    }[]>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN COALESCE(r.status, 'unchecked') = 'unchecked' THEN 1 ELSE 0 END) AS unchecked,
              SUM(CASE WHEN r.status = 'checked' THEN 1 ELSE 0 END) AS checked,
              SUM(CASE WHEN r.status = 'discarded' THEN 1 ELSE 0 END) AS discarded,
              SUM(CASE WHEN COALESCE(r.needs_attention, 0) = 1 THEN 1 ELSE 0 END) AS attention
       FROM publications p
       LEFT JOIN publication_reviews r ON r.publication_id = p.id`,
    );
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      unchecked: Number(row?.unchecked ?? 0),
      checked: Number(row?.checked ?? 0),
      discarded: Number(row?.discarded ?? 0),
      needsAttention: Number(row?.attention ?? 0),
    };
  }

  async facets(): Promise<PublicationFacets> {
    const tribunals = await this.database.select<{ tribunal: string }[]>(
      "SELECT DISTINCT tribunal FROM publications WHERE tribunal != '' ORDER BY tribunal",
    );
    return { tribunals: tribunals.map((row) => row.tribunal) };
  }

  async history(limit = 60): Promise<SearchHistoryEntry[]> {
    const rows = await this.database.select<HistoryRow[]>(
      numbered(`SELECT s.id, s.start_date, s.end_date, s.tribunal, s.executed_at, s.result_count, s.warning,
                       (SELECT COUNT(*) FROM search_publications sp WHERE sp.search_id = s.id) AS linked_count
                FROM searches s
                ORDER BY s.executed_at DESC, s.rowid DESC
                LIMIT ?`),
      [limit],
    );
    if (rows.length === 0) return [];

    const placeholders = rows.map(() => "?").join(", ");
    const attorneys = await this.database.select<HistoryAttorneyRow[]>(
      numbered(`SELECT search_id, attorney_name, oab_number, oab_uf
                FROM search_attorneys
                WHERE search_id IN (${placeholders})
                ORDER BY attorney_name COLLATE NOCASE`),
      rows.map((row) => row.id),
    );

    return rows.map((row) => ({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      tribunal: row.tribunal ?? undefined,
      executedAt: row.executed_at,
      resultCount: Number(row.result_count),
      linkedCount: Number(row.linked_count),
      warnings: row.warning ? row.warning.split("\n") : [],
      attorneys: attorneys
        .filter((attorney) => attorney.search_id === row.id)
        .map((attorney) => ({
          name: attorney.attorney_name,
          oabNumber: attorney.oab_number,
          oabUf: attorney.oab_uf,
        })),
    }));
  }

  /**
   * Percorre todas as publicações que atendem aos filtros, em lotes, para a exportação.
   * Ler tudo de uma vez carregaria o texto integral de dezenas de milhares de linhas na memória.
   */
  async exportRows(
    filters: PublicationFilters,
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<ExportRow[]> {
    const { where, values } = buildConditions(filters);
    const direction = filters.order === "oldest" ? "ASC" : "DESC";
    const totals = await this.database.select<{ total: number }[]>(
      numbered(`SELECT COUNT(*) AS total
                FROM publications p
                LEFT JOIN publication_reviews r ON r.publication_id = p.id
                ${where}`),
      values,
    );
    const total = Number(totals[0]?.total ?? 0);
    const rows: ExportRow[] = [];

    for (let offset = 0; offset < total; offset += EXPORT_BATCH) {
      signal?.throwIfAborted();
      const batch = await this.database.select<ExportQueryRow[]>(
        numbered(`SELECT p.id, p.available_on, p.tribunal, p.communication_type, p.class_name,
                         p.process_number, p.court_unit, p.source, p.source_id, p.official_link,
                         p.full_text,
                         COALESCE(r.status, 'unchecked') AS status,
                         COALESCE(r.needs_attention, 0) AS needs_attention
                  FROM publications p
                  LEFT JOIN publication_reviews r ON r.publication_id = p.id
                  ${where}
                  ORDER BY p.available_on ${direction}, p.id ${direction}
                  LIMIT ? OFFSET ?`),
        [...values, EXPORT_BATCH, offset],
      );
      const attorneys = await this.attorneysOf(batch.map((row) => row.id));
      for (const row of batch) {
        rows.push({
          availableOn: row.available_on,
          tribunal: row.tribunal,
          communicationType: row.communication_type,
          className: row.class_name ? tidyUpperCase(row.class_name) : undefined,
          processNumber: row.process_number,
          courtUnit: row.court_unit,
          status: reviewStatus(row.status),
          needsAttention: Number(row.needs_attention) === 1,
          attorneys: attorneys.get(row.id) ?? [],
          source: row.source,
          sourceId: row.source_id,
          officialLink: row.official_link ?? undefined,
          readableText: toReadableText(row.full_text),
        });
      }
      onProgress?.(rows.length, total);
      if (batch.length === 0) break;
    }

    return rows;
  }

  async setStatus(id: number, status: ReviewStatus): Promise<void> {
    await this.database.execute(
      numbered(`INSERT INTO publication_reviews (publication_id, status) VALUES (?, ?)
                ON CONFLICT(publication_id)
                DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`),
      [id, status],
    );
  }

  async setAttention(id: number, needsAttention: boolean): Promise<void> {
    await this.database.execute(
      numbered(`INSERT INTO publication_reviews (publication_id, needs_attention) VALUES (?, ?)
                ON CONFLICT(publication_id)
                DO UPDATE SET needs_attention = excluded.needs_attention, updated_at = CURRENT_TIMESTAMP`),
      [id, needsAttention ? 1 : 0],
    );
  }

  private async attorneysOf(ids: number[]): Promise<Map<number, PublicationAttorney[]>> {
    const grouped = new Map<number, PublicationAttorney[]>();
    if (ids.length === 0) return grouped;

    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.database.select<AttorneyRow[]>(
      numbered(`SELECT publication_id, name, oab_number, oab_uf
                FROM publication_attorneys
                WHERE publication_id IN (${placeholders})
                ORDER BY name COLLATE NOCASE`),
      ids,
    );
    for (const row of rows) {
      const list = grouped.get(row.publication_id) ?? [];
      list.push({ name: row.name, oabNumber: row.oab_number, oabUf: row.oab_uf });
      grouped.set(row.publication_id, list);
    }
    return grouped;
  }
}
