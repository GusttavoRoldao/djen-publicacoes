import { getDatabase } from "../database.ts";
import { SettingsRepository } from "./repository.ts";

let repositoryPromise: Promise<SettingsRepository> | undefined;

export function getSettingsRepository(): Promise<SettingsRepository> {
  repositoryPromise ??= getDatabase().then((database) => new SettingsRepository(database));
  return repositoryPromise;
}
