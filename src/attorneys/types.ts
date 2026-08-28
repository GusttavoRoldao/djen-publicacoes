export type AttorneyValidationStatus = "confirmed" | "no_recent_publications" | "unavailable";

export type AttorneyProfile = {
  id: number;
  name: string;
  oabNumber: string;
  oabUf: string;
  photoDataUrl?: string;
  validationStatus: AttorneyValidationStatus;
  createdAt: string;
  updatedAt: string;
};

export type AttorneyInput = Omit<AttorneyProfile, "id" | "createdAt" | "updatedAt">;
