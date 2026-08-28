export type PageId = "overview" | "publications" | "searches" | "attorneys" | "sources" | "settings";

export type ProfileDraft = {
  name: string;
  oabNumber: string;
  oabUf: string;
  photoDataUrl?: string;
};
