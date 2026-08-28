import { getDatabase } from "../database.ts";
import { AttorneyRepository } from "./repository.ts";

let repositoryPromise: Promise<AttorneyRepository> | undefined;

export function getAttorneyRepository(): Promise<AttorneyRepository> {
  repositoryPromise ??= getDatabase().then((database) => new AttorneyRepository(database));
  return repositoryPromise;
}
