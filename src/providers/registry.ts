import { invoke, isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "../database.ts";
import { getSettingsRepository } from "../settings/database.ts";
import { createDjenProvider } from "./djen-provider.ts";
import type { PublicationProvider } from "./publication-provider.ts";
import { ProviderRepository } from "./repository.ts";
import { RestClient, type RestTransport, type RestTransportRequest, type RestTransportResponse } from "./rest/client.ts";
import { DJEN_PROVIDER_ID, type RestProviderConfig } from "./rest/types.ts";

let repositoryPromise: Promise<ProviderRepository> | undefined;

export function getProviderRepository(): Promise<ProviderRepository> {
  repositoryPromise ??= getDatabase().then((database) => new ProviderRepository(database));
  return repositoryPromise;
}

/** Transporte nativo: a chave é lida do cofre no Rust e nunca chega ao WebView. */
export const nativeTransport: RestTransport = (request: RestTransportRequest) => (
  invoke<RestTransportResponse>("rest_request", { request })
);

export function createRestProvider(config: RestProviderConfig, transport = nativeTransport): PublicationProvider {
  const client = new RestClient(config, { transport });
  return {
    id: config.id,
    name: config.name,
    search: (query, options) => client.search(query, options),
  };
}

export async function listProviders(): Promise<PublicationProvider[]> {
  const djen = createDjenProvider();
  if (!isTauri()) return [djen];
  const configs = await (await getProviderRepository()).list();
  return [djen, ...configs.map((config) => createRestProvider(config))];
}

export async function getActiveProviderId(): Promise<string> {
  if (!isTauri()) return DJEN_PROVIDER_ID;
  return (await (await getSettingsRepository()).getActiveProvider()) ?? DJEN_PROVIDER_ID;
}

export async function setActiveProviderId(id: string): Promise<void> {
  await (await getSettingsRepository()).setActiveProvider(id);
}

/**
 * Resolve a fonte ativa. Uma configuração ausente ou quebrada volta ao CNJ,
 * para o aplicativo nunca ficar sem fonte por causa de uma tela de configuração.
 */
export async function resolveActiveProvider(): Promise<PublicationProvider> {
  const djen = createDjenProvider();
  if (!isTauri()) return djen;

  const id = await getActiveProviderId();
  if (id === DJEN_PROVIDER_ID) return djen;

  const config = await (await getProviderRepository()).find(id);
  return config ? createRestProvider(config) : djen;
}

export function saveProviderSecret(provider: string, secret: string): Promise<void> {
  return invoke("save_provider_secret", { provider, secret });
}

export function deleteProviderSecret(provider: string): Promise<void> {
  return invoke("delete_provider_secret", { provider });
}

export function hasProviderSecret(provider: string): Promise<boolean> {
  return isTauri() ? invoke<boolean>("has_provider_secret", { provider }) : Promise.resolve(false);
}
