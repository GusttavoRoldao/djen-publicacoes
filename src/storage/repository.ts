import type { DatabaseOperation, TransactionalDatabase } from "../database.ts";
import type { DeletionPreview, DeletionResult, PeriodRange, StorageStats } from "./types.ts";

/** Uma publicação marcada como `Requer atenção` nunca é apagada sem escolha explícita. */
const ATTENTION_GUARD =
  "AND NOT EXISTS (SELECT 1 FROM publication_reviews r WHERE r.publication_id = p.id AND r.needs_attention = 1)";

const ORPHAN = "NOT EXISTS (SELECT 1 FROM search_publications sp WHERE sp.publication_id = p.id)";

function numbered(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${index += 1}`);
}

function periodClause(range: PeriodRange): { clause: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (range.startDate) {
    clauses.push("p.available_on >= ?");
    values.push(range.startDate);
  }
  if (range.endDate) {
    clauses.push("p.available_on <= ?");
    values.push(range.endDate);
  }
  return { clause: clauses.length > 0 ? clauses.join(" AND ") : "1 = 1", values };
}

export class StorageRepository {
  private readonly database: TransactionalDatabase;

  constructor(database: TransactionalDatabase) {
    this.database = database;
  }

  async stats(): Promise<StorageStats> {
    const rows = await this.database.select<{
      searches: number;
      publications: number;
      links: number;
      attention: number;
      attorneys: number;
    }[]>(
      `SELECT
         (SELECT COUNT(*) FROM searches) AS searches,
         (SELECT COUNT(*) FROM publications) AS publications,
         (SELECT COUNT(*) FROM search_publications) AS links,
         (SELECT COUNT(*) FROM publication_reviews WHERE needs_attention = 1) AS attention,
         (SELECT COUNT(*) FROM attorney_profiles) AS attorneys`,
    );
    const row = rows[0];
    return {
      searches: Number(row?.searches ?? 0),
      publications: Number(row?.publications ?? 0),
      links: Number(row?.links ?? 0),
      attention: Number(row?.attention ?? 0),
      attorneys: Number(row?.attorneys ?? 0),
      bytes: 0,
    };
  }

  /**
   * Apagar uma pesquisa remove somente as publicações exclusivas dela.
   * As que também aparecem em outra pesquisa continuam no acervo.
   */
  async previewSearchDeletion(searchId: string, keepAttention: boolean): Promise<DeletionPreview> {
    const exclusive = `
      SELECT p.id FROM publications p
      JOIN search_publications sp ON sp.publication_id = p.id AND sp.search_id = ?
      WHERE NOT EXISTS (
        SELECT 1 FROM search_publications other
        WHERE other.publication_id = p.id AND other.search_id <> ?
      )`;
    return this.countPreview(exclusive, [searchId, searchId], keepAttention, 1);
  }

  async deleteSearch(searchId: string, keepAttention: boolean): Promise<DeletionResult> {
    const results = await this.database.transaction([
      {
        query: numbered("DELETE FROM search_publications WHERE search_id = ?"),
        values: [searchId],
      },
      {
        query: numbered("DELETE FROM searches WHERE id = ?"),
        values: [searchId],
      },
      {
        query: `DELETE FROM publications WHERE id IN (
                  SELECT p.id FROM publications p WHERE ${ORPHAN} ${keepAttention ? ATTENTION_GUARD : ""}
                )`,
      },
    ]);
    return {
      searches: Number(results[1]?.rowsAffected ?? 0),
      publications: Number(results[2]?.rowsAffected ?? 0),
    };
  }

  async previewPeriodDeletion(range: PeriodRange, keepAttention: boolean): Promise<DeletionPreview> {
    const { clause, values } = periodClause(range);
    return this.countPreview(`SELECT p.id FROM publications p WHERE ${clause}`, values, keepAttention, 0);
  }

  async deletePeriod(range: PeriodRange, keepAttention: boolean): Promise<DeletionResult> {
    const { clause, values } = periodClause(range);
    const target = `SELECT p.id FROM publications p WHERE ${clause} ${keepAttention ? ATTENTION_GUARD : ""}`;
    return this.removePublications(target, values);
  }

  async previewSelection(ids: number[]): Promise<DeletionPreview> {
    if (ids.length === 0) return { publications: 0, searches: 0, protectedAttention: 0 };
    const placeholders = ids.map(() => "?").join(", ");
    // A seleção é explícita: as marcadas com atenção são apagadas, mas contadas para o aviso.
    const rows = await this.database.select<{ total: number; attention: number }[]>(
      numbered(`SELECT COUNT(*) AS total,
                       SUM(CASE WHEN EXISTS (
                         SELECT 1 FROM publication_reviews r
                         WHERE r.publication_id = p.id AND r.needs_attention = 1
                       ) THEN 1 ELSE 0 END) AS attention
                FROM publications p WHERE p.id IN (${placeholders})`),
      ids,
    );
    return {
      publications: Number(rows[0]?.total ?? 0),
      searches: 0,
      protectedAttention: Number(rows[0]?.attention ?? 0),
    };
  }

  async deletePublications(ids: number[]): Promise<DeletionResult> {
    if (ids.length === 0) return { publications: 0, searches: 0 };
    const placeholders = ids.map(() => "?").join(", ");
    return this.removePublications(`SELECT p.id FROM publications p WHERE p.id IN (${placeholders})`, ids);
  }

  async previewArchiveClear(): Promise<DeletionPreview> {
    const stats = await this.stats();
    return { publications: stats.publications, searches: stats.searches, protectedAttention: 0 };
  }

  /** Remove pesquisas e publicações, preservando OABs e preferências. */
  async clearArchive(): Promise<DeletionResult> {
    const results = await this.database.transaction([
      { query: "DELETE FROM search_publications" },
      { query: "DELETE FROM searches" },
      { query: "DELETE FROM publications" },
    ]);
    return {
      searches: Number(results[1]?.rowsAffected ?? 0),
      publications: Number(results[2]?.rowsAffected ?? 0),
    };
  }

  /** Restaura o aplicativo: apaga também OABs e preferências, voltando ao primeiro uso. */
  async restoreEverything(): Promise<DeletionResult> {
    const results = await this.database.transaction([
      { query: "DELETE FROM search_publications" },
      { query: "DELETE FROM searches" },
      { query: "DELETE FROM publications" },
      { query: "DELETE FROM attorney_profiles" },
      { query: "DELETE FROM app_settings" },
    ]);
    return {
      searches: Number(results[1]?.rowsAffected ?? 0),
      publications: Number(results[2]?.rowsAffected ?? 0),
    };
  }

  previewRetention(cutoff: string): Promise<DeletionPreview> {
    return this.previewPeriodDeletion({ endDate: cutoff }, true);
  }

  /** A retenção é automática, então sempre preserva os itens marcados como `Requer atenção`. */
  applyRetention(cutoff: string): Promise<DeletionResult> {
    return this.deletePeriod({ endDate: cutoff }, true);
  }

  private async countPreview(
    selection: string,
    values: unknown[],
    keepAttention: boolean,
    searches: number,
  ): Promise<DeletionPreview> {
    const rows = await this.database.select<{ total: number; attention: number }[]>(
      numbered(`SELECT COUNT(*) AS total,
                       SUM(CASE WHEN EXISTS (
                         SELECT 1 FROM publication_reviews r
                         WHERE r.publication_id = target.id AND r.needs_attention = 1
                       ) THEN 1 ELSE 0 END) AS attention
                FROM (${selection}) AS target`),
      values,
    );
    const total = Number(rows[0]?.total ?? 0);
    const attention = Number(rows[0]?.attention ?? 0);
    return {
      publications: keepAttention ? total - attention : total,
      searches,
      protectedAttention: keepAttention ? attention : 0,
    };
  }

  /**
   * Os vínculos referenciam as publicações com `ON DELETE RESTRICT`, então saem primeiro.
   * Tudo em uma transação: uma falha no meio não deixa o acervo pela metade.
   */
  private async removePublications(selection: string, values: unknown[]): Promise<DeletionResult> {
    const operations: DatabaseOperation[] = [
      {
        query: numbered(`DELETE FROM search_publications WHERE publication_id IN (${selection})`),
        values,
      },
      {
        query: numbered(`DELETE FROM publications WHERE id IN (${selection})`),
        values,
      },
    ];
    const results = await this.database.transaction(operations);
    return { publications: Number(results[1]?.rowsAffected ?? 0), searches: 0 };
  }
}
