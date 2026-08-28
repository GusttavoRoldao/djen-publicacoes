import type { DatabaseOperation, TransactionalDatabase } from "../database.ts";
import type { Publication } from "../djen/types.ts";
import type { SavedSearch, SearchSaveInput, SearchStorage } from "./types.ts";

export function publicationKey(publication: Publication): string {
  if (publication.sourceId) return `${publication.source}:${publication.sourceId}`;
  return [
    publication.source,
    publication.tribunal,
    publication.communicationNumber ?? "",
    publication.processNumber,
    publication.availableOn,
  ].join("|");
}

function uniquePublications(publications: Publication[]): Publication[] {
  return [...new Map(publications.map((publication) => [publicationKey(publication), publication])).values()];
}

export class SearchRepository implements SearchStorage {
  private readonly database: TransactionalDatabase;

  constructor(database: TransactionalDatabase) {
    this.database = database;
  }

  async save(input: SearchSaveInput, signal?: AbortSignal): Promise<SavedSearch> {
    signal?.throwIfAborted();
    const searchId = crypto.randomUUID();
    const publications = uniquePublications(input.publications);
    const operations: DatabaseOperation[] = [{
      query: `INSERT INTO searches (id, start_date, end_date, tribunal, warning, result_count)
              VALUES ($1, $2, $3, $4, $5, $6)`,
      values: [
        searchId,
        input.startDate,
        input.endDate,
        input.tribunal ?? null,
        input.warnings.join("\n") || null,
        publications.length,
      ],
    }];

    for (const profile of input.profiles) {
      operations.push({
        query: `INSERT INTO search_attorneys
                (search_id, attorney_profile_id, attorney_name, oab_number, oab_uf)
                VALUES ($1, $2, $3, $4, $5)`,
        values: [searchId, profile.id, profile.name, profile.oabNumber, profile.oabUf],
      });
    }

    const publicationInsertIndexes: number[] = [];
    for (const publication of publications) {
      signal?.throwIfAborted();
      const key = publicationKey(publication);
      publicationInsertIndexes.push(operations.length);
      operations.push({
        query: `INSERT OR IGNORE INTO publications
                (dedup_key, source, source_id, available_on, tribunal, communication_type,
                 court_unit, full_text, process_number, medium, official_link, document_type,
                 class_name, communication_number, official_hash)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        values: [
          key, publication.source, publication.sourceId, publication.availableOn,
          publication.tribunal, publication.communicationType, publication.courtUnit,
          publication.text, publication.processNumber, publication.medium,
          publication.officialLink ?? null, publication.documentType ?? null,
          publication.className ?? null, publication.communicationNumber ?? null,
          publication.hash ?? null,
        ],
      });
      for (const attorney of publication.attorneys) {
        operations.push({
          query: `INSERT OR IGNORE INTO publication_attorneys
                  (publication_id, name, oab_number, oab_uf)
                  SELECT id, $2, $3, $4 FROM publications WHERE dedup_key = $1`,
          values: [key, attorney.name, attorney.oab, attorney.uf],
        });
      }
      for (const recipient of publication.recipients) {
        operations.push({
          query: `INSERT OR IGNORE INTO publication_recipients
                  (publication_id, name, role)
                  SELECT id, $2, $3 FROM publications WHERE dedup_key = $1`,
          values: [key, recipient.name, recipient.role ?? ""],
        });
      }
      operations.push({
        query: `INSERT OR IGNORE INTO search_publications (search_id, publication_id)
                SELECT $1, id FROM publications WHERE dedup_key = $2`,
        values: [searchId, key],
      });
    }

    const results = await this.database.transaction(operations);
    const newPublicationCount = publicationInsertIndexes.reduce(
      (total, index) => total + (results[index]?.rowsAffected ?? 0),
      0,
    );
    return {
      id: searchId,
      resultCount: publications.length,
      newPublicationCount,
      warnings: input.warnings,
    };
  }
}
