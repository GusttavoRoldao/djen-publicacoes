import type { ApplicationDatabase } from "../database.ts";
import type { AttorneyInput, AttorneyProfile, AttorneyValidationStatus } from "./types.ts";

type AttorneyRow = {
  id: number;
  name: string;
  oab_number: string;
  oab_uf: string;
  photo_data_url: string | null;
  validation_status: AttorneyValidationStatus;
  created_at: string;
  updated_at: string;
};

export class DuplicateRegistrationError extends Error {
  constructor() {
    super("Esta OAB já está cadastrada.");
  }
}

function toProfile(row: AttorneyRow): AttorneyProfile {
  return {
    id: row.id,
    name: row.name,
    oabNumber: row.oab_number,
    oabUf: row.oab_uf,
    photoDataUrl: row.photo_data_url ?? undefined,
    validationStatus: row.validation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AttorneyRepository {
  private readonly database: ApplicationDatabase;

  constructor(database: ApplicationDatabase) {
    this.database = database;
  }

  async list(): Promise<AttorneyProfile[]> {
    const rows = await this.database.select<AttorneyRow[]>(
      "SELECT * FROM attorney_profiles ORDER BY name COLLATE NOCASE, id",
    );
    return rows.map(toProfile);
  }

  async create(input: AttorneyInput): Promise<AttorneyProfile> {
    await this.ensureUnique(input.oabNumber, input.oabUf);
    try {
      await this.database.execute(
        `INSERT INTO attorney_profiles
         (name, oab_number, oab_uf, photo_data_url, validation_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.name, input.oabNumber, input.oabUf, input.photoDataUrl ?? null, input.validationStatus],
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new DuplicateRegistrationError();
      throw error;
    }
    const profile = await this.findByRegistration(input.oabNumber, input.oabUf);
    if (!profile) throw new Error("Não foi possível carregar o perfil criado.");
    return profile;
  }

  async update(id: number, input: AttorneyInput): Promise<AttorneyProfile> {
    await this.ensureUnique(input.oabNumber, input.oabUf, id);
    await this.database.execute(
      `UPDATE attorney_profiles
       SET name = $1, oab_number = $2, oab_uf = $3, photo_data_url = $4,
           validation_status = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [input.name, input.oabNumber, input.oabUf, input.photoDataUrl ?? null, input.validationStatus, id],
    );
    const profile = await this.findById(id);
    if (!profile) throw new Error("Perfil não encontrado.");
    return profile;
  }

  async delete(id: number): Promise<void> {
    await this.database.execute("DELETE FROM attorney_profiles WHERE id = $1", [id]);
  }

  private async ensureUnique(oabNumber: string, oabUf: string, ignoredId = -1): Promise<void> {
    const rows = await this.database.select<{ id: number }[]>(
      `SELECT id FROM attorney_profiles
       WHERE oab_number = $1 AND oab_uf = $2 AND id != $3
       LIMIT 1`,
      [oabNumber, oabUf, ignoredId],
    );
    if (rows.length > 0) throw new DuplicateRegistrationError();
  }

  private async findById(id: number): Promise<AttorneyProfile | undefined> {
    const rows = await this.database.select<AttorneyRow[]>(
      "SELECT * FROM attorney_profiles WHERE id = $1",
      [id],
    );
    return rows[0] ? toProfile(rows[0]) : undefined;
  }

  private async findByRegistration(oabNumber: string, oabUf: string): Promise<AttorneyProfile | undefined> {
    const rows = await this.database.select<AttorneyRow[]>(
      "SELECT * FROM attorney_profiles WHERE oab_number = $1 AND oab_uf = $2",
      [oabNumber, oabUf],
    );
    return rows[0] ? toProfile(rows[0]) : undefined;
  }
}
