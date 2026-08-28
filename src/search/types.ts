import type { Publication } from "../djen/types.ts";

export type SearchProfile = {
  id: number;
  name: string;
  oabNumber: string;
  oabUf: string;
};

export type ManualSearchInput = {
  profiles: SearchProfile[];
  startDate: string;
  endDate: string;
  tribunal?: string;
};

export type SearchSegment = {
  profile: SearchProfile;
  startDate: string;
  endDate: string;
};

export type ManualSearchProgress = {
  phase: "searching" | "saving";
  completedSegments: number;
  totalSegments: number;
  profileName: string;
  startDate: string;
  endDate: string;
  page: number;
  fetched: number;
  total: number;
  collected: number;
};

export type SearchSaveInput = ManualSearchInput & {
  publications: Publication[];
  warnings: string[];
};

export type SavedSearch = {
  id: string;
  resultCount: number;
  newPublicationCount: number;
  warnings: string[];
};

export interface SearchStorage {
  save(input: SearchSaveInput, signal?: AbortSignal): Promise<SavedSearch>;
}
