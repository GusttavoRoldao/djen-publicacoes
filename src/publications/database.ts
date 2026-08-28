import { isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "../database.ts";
import { PublicationRepository } from "./repository.ts";
import type { PublicationCounts, PublicationsApi } from "./types.ts";

const EMPTY_COUNTS: PublicationCounts = {
  total: 0,
  unchecked: 0,
  checked: 0,
  discarded: 0,
  needsAttention: 0,
};

let repositoryPromise: Promise<PublicationRepository> | undefined;

export function getPublicationRepository(): Promise<PublicationRepository> {
  repositoryPromise ??= getDatabase().then((database) => new PublicationRepository(database));
  return repositoryPromise;
}

async function run<T>(action: (repository: PublicationRepository) => Promise<T>, preview: T): Promise<T> {
  if (!isTauri()) return preview;
  return action(await getPublicationRepository());
}

export const publicationsApi: PublicationsApi = {
  list: (filters, limit, offset) => run(
    (repository) => repository.list(filters, limit, offset),
    { total: 0, offset, items: [] },
  ),
  detail: (id) => run((repository) => repository.detail(id), undefined),
  counts: () => run((repository) => repository.counts(), EMPTY_COUNTS),
  facets: () => run((repository) => repository.facets(), { tribunals: [] }),
  history: (limit) => run((repository) => repository.history(limit), []),
  exportRows: (filters, onProgress, signal) => run(
    (repository) => repository.exportRows(filters, onProgress, signal),
    [],
  ),
  setStatus: (id, status) => run((repository) => repository.setStatus(id, status), undefined),
  setAttention: (id, needsAttention) => run((repository) => repository.setAttention(id, needsAttention), undefined),
};
