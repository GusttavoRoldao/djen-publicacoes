import type { ApplicationDatabase } from "../database.ts";
import { emptyConfig, type RestProviderConfig } from "./rest/types.ts";
import { withoutSecrets } from "./rest/validation.ts";

type ProviderRow = {
  id: string;
  name: string;
  config: string;
};

function parse(row: ProviderRow): RestProviderConfig {
  const stored = JSON.parse(row.config) as Partial<RestProviderConfig>;
  const base = emptyConfig(row.id);
  return {
    ...base,
    ...stored,
    id: row.id,
    name: row.name,
    query: { ...base.query, ...stored.query },
    mapping: { ...base.mapping, ...stored.mapping },
  };
}

export class ProviderRepository {
  private readonly database: ApplicationDatabase;

  constructor(database: ApplicationDatabase) {
    this.database = database;
  }

  async list(): Promise<RestProviderConfig[]> {
    const rows = await this.database.select<ProviderRow[]>(
      "SELECT id, name, config FROM providers ORDER BY name COLLATE NOCASE",
    );
    return rows.map(parse);
  }

  async find(id: string): Promise<RestProviderConfig | undefined> {
    const rows = await this.database.select<ProviderRow[]>(
      "SELECT id, name, config FROM providers WHERE id = $1",
      [id],
    );
    return rows[0] ? parse(rows[0]) : undefined;
  }

  /** O JSON gravado nunca contém a chave: ela fica no cofre do sistema. */
  async save(config: RestProviderConfig): Promise<void> {
    const clean = withoutSecrets(config);
    await this.database.execute(
      `INSERT INTO providers (id, name, config) VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE
       SET name = excluded.name, config = excluded.config, updated_at = CURRENT_TIMESTAMP`,
      [clean.id, clean.name, JSON.stringify(clean)],
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM providers WHERE id = $1", [id]);
  }
}
