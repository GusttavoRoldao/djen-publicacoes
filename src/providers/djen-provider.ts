import { isTauri } from "@tauri-apps/api/core";
import { fetch as nativeFetch } from "@tauri-apps/plugin-http";
import { DjenClient } from "../djen/client.ts";
import type { PublicationProvider } from "./publication-provider.ts";

function defaultClient(): DjenClient {
  return new DjenClient({ fetch: isTauri() ? nativeFetch : fetch });
}

export function createDjenProvider(client = defaultClient()): PublicationProvider {
  return {
    id: "djen-cnj",
    name: "DJEN / CNJ",
    search: (query, options) => client.search(query, options),
  };
}
