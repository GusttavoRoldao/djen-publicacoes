import { invoke, isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "../database.ts";
import { StorageRepository } from "./repository.ts";
import type { DeletionPreview, DeletionResult, StorageApi, StorageStats } from "./types.ts";

const EMPTY_PREVIEW: DeletionPreview = { publications: 0, searches: 0, protectedAttention: 0 };
const EMPTY_RESULT: DeletionResult = { publications: 0, searches: 0 };
const EMPTY_STATS: StorageStats = {
  searches: 0,
  publications: 0,
  links: 0,
  attention: 0,
  attorneys: 0,
  bytes: 0,
};

let repositoryPromise: Promise<StorageRepository> | undefined;

export function getStorageRepository(): Promise<StorageRepository> {
  repositoryPromise ??= getDatabase().then((database) => new StorageRepository(database));
  return repositoryPromise;
}

async function run<T>(action: (repository: StorageRepository) => Promise<T>, preview: T): Promise<T> {
  if (!isTauri()) return preview;
  return action(await getStorageRepository());
}

function databaseSize(): Promise<number> {
  return isTauri() ? invoke<number>("database_size") : Promise.resolve(0);
}

export const storageApi: StorageApi = {
  stats: async () => {
    if (!isTauri()) return EMPTY_STATS;
    const [repository, bytes] = await Promise.all([getStorageRepository(), databaseSize()]);
    return { ...await repository.stats(), bytes };
  },
  previewSearchDeletion: (searchId, keepAttention) => run(
    (repository) => repository.previewSearchDeletion(searchId, keepAttention),
    EMPTY_PREVIEW,
  ),
  deleteSearch: (searchId, keepAttention) => run(
    (repository) => repository.deleteSearch(searchId, keepAttention),
    EMPTY_RESULT,
  ),
  previewPeriodDeletion: (range, keepAttention) => run(
    (repository) => repository.previewPeriodDeletion(range, keepAttention),
    EMPTY_PREVIEW,
  ),
  deletePeriod: (range, keepAttention) => run(
    (repository) => repository.deletePeriod(range, keepAttention),
    EMPTY_RESULT,
  ),
  previewSelection: (ids) => run((repository) => repository.previewSelection(ids), EMPTY_PREVIEW),
  deletePublications: (ids) => run((repository) => repository.deletePublications(ids), EMPTY_RESULT),
  previewArchiveClear: () => run((repository) => repository.previewArchiveClear(), EMPTY_PREVIEW),
  clearArchive: () => run((repository) => repository.clearArchive(), EMPTY_RESULT),
  restoreEverything: () => run((repository) => repository.restoreEverything(), EMPTY_RESULT),
  previewRetention: (cutoff) => run((repository) => repository.previewRetention(cutoff), EMPTY_PREVIEW),
  applyRetention: (cutoff) => run((repository) => repository.applyRetention(cutoff), EMPTY_RESULT),
  compact: () => (isTauri() ? invoke<number>("compact_database") : Promise.resolve(0)),
};
