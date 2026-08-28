import { getDatabase } from "../database.ts";
import { SearchRepository } from "./repository.ts";

let repositoryPromise: Promise<SearchRepository> | undefined;

export function getSearchRepository(): Promise<SearchRepository> {
  repositoryPromise ??= getDatabase().then((database) => new SearchRepository(database));
  return repositoryPromise;
}
