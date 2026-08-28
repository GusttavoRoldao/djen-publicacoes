import { CircleAlert } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { getAttorneyRepository } from "./attorneys/database.ts";
import { DuplicateRegistrationError } from "./attorneys/repository.ts";
import type { AttorneyInput, AttorneyProfile } from "./attorneys/types.ts";
import { normalizeRegistration, validateRegistration } from "./attorneys/validation.ts";
import type { PageId, ProfileDraft } from "./app-types.ts";
import { BrandMark } from "./components/BrandMark.tsx";
import { Shell } from "./components/Shell.tsx";
import { createDjenProvider } from "./providers/djen-provider.ts";
import type { PublicationProvider } from "./providers/publication-provider.ts";
import { resolveActiveProvider, setActiveProviderId } from "./providers/registry.ts";
import { DJEN_PROVIDER_ID } from "./providers/rest/types.ts";
import { AttorneysPage } from "./pages/AttorneysPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { OverviewPage } from "./pages/OverviewPage.tsx";
import { PublicationsPage } from "./pages/PublicationsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { SearchesPage } from "./pages/SearchesPage.tsx";
import { SourcesPage } from "./pages/SourcesPage.tsx";
import { publicationsApi } from "./publications/database.ts";
import type { SearchHistoryEntry } from "./publications/types.ts";
import {
  completeOnboarding,
  exitCompletely,
  loadWorkspaceState,
  runRetention,
  saveMonitorTime,
  saveMonitoringState,
  saveRetentionDays,
  saveStorageLimit,
  type WorkspaceState,
} from "./runtime/desktop.ts";
import type { RetentionDays } from "./settings/repository.ts";
import { ManualSearchEngine } from "./search/engine.ts";
import { searchErrorMessage } from "./search/engine.ts";
import { getSearchRepository } from "./search/database.ts";
import type { ManualSearchInput, ManualSearchProgress, SavedSearch } from "./search/types.ts";
import { localDate, recoveryStartDate, shouldRunMonitor } from "./monitor/schedule.ts";
import { getSettingsRepository } from "./settings/database.ts";

const INITIAL_WORKSPACE: WorkspaceState = {
  monitoring: { available: false, enabled: false, time: "08:00", running: false },
  onboardingCompleted: true,
  retentionDays: 0,
  storageLimitMb: 0,
  activeProviderId: DJEN_PROVIDER_ID,
  profiles: [],
};

function sortProfiles(profiles: AttorneyProfile[]): AttorneyProfile[] {
  return [...profiles].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [workspace, setWorkspace] = useState(INITIAL_WORKSPACE);
  const [provider, setProvider] = useState<PublicationProvider>(() => createDjenProvider());
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [retentionNotice, setRetentionNotice] = useState<string>();
  const [fatalError, setFatalError] = useState<string>();

  useEffect(() => {
    let active = true;
    loadWorkspaceState()
      .then(async (state) => {
        if (!active) return;
        setWorkspace(state);
        setProvider(await resolveActiveProvider());
      })
      .catch((reason: unknown) => { if (active) setFatalError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { void refreshHistory(); }, []);

  // A retenção roda uma vez por dia, logo depois que as preferências foram lidas.
  useEffect(() => {
    if (loading || !workspace.onboardingCompleted) return;
    runRetention(new Date(), workspace.retentionDays)
      .then((removed) => {
        if (removed === 0) return;
        // A exclusão automática não pode passar despercebida.
        setRetentionNotice(
          `A limpeza automática apagou ${removed} ${removed === 1 ? "publicação" : "publicações"} `
          + `com mais de ${workspace.retentionDays} dias. Itens marcados como Requer atenção foram preservados. `
          + `Você pode desligar isso em Configurações.`,
        );
        void refreshHistory();
      })
      .catch(() => undefined);
  }, [loading, workspace.onboardingCompleted, workspace.retentionDays]);

  async function refreshHistory() {
    try {
      setHistory(await publicationsApi.history());
    } catch {
      // O histórico é secundário: uma falha aqui não pode impedir o uso do aplicativo.
    }
  }

  useEffect(() => {
    if (!workspace.monitoring.enabled || workspace.profiles.length === 0) return;
    const controller = new AbortController();
    let lastAttempt = workspace.monitoring.lastAttempt;
    let running = false;

    async function tick(force = false) {
      const now = new Date();
      if (running || (!force && !shouldRunMonitor(now, workspace.monitoring.time, lastAttempt))) return;
      running = true;
      const at = now.toISOString();
      lastAttempt = at;
      setWorkspace((current) => ({ ...current, monitoring: { ...current.monitoring, running: true, lastAttempt: at, lastError: undefined } }));
      try {
        const settings = await getSettingsRepository();
        await settings.recordMonitorAttempt(at);
        const repository = await getSearchRepository();
        await new ManualSearchEngine(provider, repository).run({
          profiles: workspace.profiles,
          startDate: recoveryStartDate(now, workspace.monitoring.lastSuccess),
          endDate: localDate(now),
        }, { signal: controller.signal });
        const success = new Date().toISOString();
        await settings.recordMonitorSuccess(success);
        await refreshHistory();
        setWorkspace((current) => ({ ...current, monitoring: { ...current.monitoring, running: false, lastSuccess: success } }));
      } catch (reason) {
        if (controller.signal.aborted) {
          setWorkspace((current) => ({ ...current, monitoring: { ...current.monitoring, running: false } }));
          return;
        }
        const message = searchErrorMessage(reason);
        await getSettingsRepository().then((settings) => settings.recordMonitorError(message)).catch(() => undefined);
        setWorkspace((current) => ({ ...current, monitoring: { ...current.monitoring, running: false, lastError: message } }));
      } finally {
        running = false;
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 60_000);
    const listeners = isTauri() ? Promise.all([
      listen("monitor-search-now", () => void tick(true)),
      listen("monitor-pause", () => void changeMonitoring(false)),
    ]) : Promise.resolve([]);
    return () => {
      window.clearInterval(timer);
      controller.abort();
      void listeners.then((unlisten) => unlisten.forEach((remove) => remove()));
    };
  }, [workspace.monitoring.enabled, workspace.monitoring.time, workspace.profiles]);

  async function persistProfile(draft: ProfileDraft, id?: number): Promise<AttorneyProfile> {
    const registration = normalizeRegistration(draft.oabNumber, draft.oabUf);
    const duplicate = workspace.profiles.some((profile) => (
      profile.id !== id && profile.oabNumber === registration.number && profile.oabUf === registration.uf
    ));
    if (duplicate) throw new DuplicateRegistrationError();

    const validationStatus = await validateRegistration(provider, registration);
    const input: AttorneyInput = {
      name: draft.name.trim(),
      oabNumber: registration.number,
      oabUf: registration.uf,
      photoDataUrl: draft.photoDataUrl,
      validationStatus,
    };
    const repository = await getAttorneyRepository();
    const saved = id === undefined ? await repository.create(input) : await repository.update(id, input);
    setWorkspace((current) => ({
      ...current,
      profiles: sortProfiles([...current.profiles.filter((profile) => profile.id !== saved.id), saved]),
    }));
    return saved;
  }

  async function saveProfile(draft: ProfileDraft, id?: number) {
    setSaving(true);
    try {
      await persistProfile(draft, id);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(profile: AttorneyProfile) {
    setSaving(true);
    try {
      const repository = await getAttorneyRepository();
      await repository.delete(profile.id);
      setWorkspace((current) => ({
        ...current,
        profiles: current.profiles.filter((item) => item.id !== profile.id),
      }));
    } finally {
      setSaving(false);
    }
  }

  async function finishOnboarding(draft: ProfileDraft, monitoring: boolean, retention: RetentionDays) {
    setSaving(true);
    try {
      const existing = workspace.profiles[0];
      await persistProfile(draft, existing?.id);
      await saveRetentionDays(retention);
      await saveMonitoringState(monitoring);
      await completeOnboarding();
      setWorkspace((current) => ({
        ...current,
        onboardingCompleted: true,
        retentionDays: retention,
        monitoring: { ...current.monitoring, enabled: monitoring },
      }));
    } finally {
      setSaving(false);
    }
  }

  async function changeMonitoring(enabled: boolean) {
    setSaving(true);
    setError(undefined);
    try {
      await saveMonitoringState(enabled);
      setWorkspace((current) => ({
        ...current,
        monitoring: { ...current.monitoring, enabled },
      }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function changeRetention(retentionDays: RetentionDays) {
    setSaving(true);
    setError(undefined);
    try {
      await saveRetentionDays(retentionDays);
      setWorkspace((current) => ({ ...current, retentionDays }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function changeActiveProvider(id: string) {
    setSaving(true);
    setError(undefined);
    try {
      await setActiveProviderId(id);
      setProvider(await resolveActiveProvider());
      setWorkspace((current) => ({ ...current, activeProviderId: id }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function changeStorageLimit(limitMb: number) {
    setSaving(true);
    setError(undefined);
    try {
      await saveStorageLimit(limitMb);
      setWorkspace((current) => ({ ...current, storageLimitMb: limitMb }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function restoreApplication() {
    try {
      await saveMonitoringState(false);
    } catch {
      // Se o desligamento do monitor falhar, o recarregamento abaixo o reavalia pelas preferências.
    }
    window.location.reload();
  }

  async function changeMonitorTime(time: string) {
    setSaving(true);
    setError(undefined);
    try {
      await saveMonitorTime(time);
      setWorkspace((current) => ({ ...current, monitoring: { ...current.monitoring, time } }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function runManualSearch(
    input: ManualSearchInput,
    signal: AbortSignal,
    onProgress: (progress: ManualSearchProgress) => void,
  ): Promise<SavedSearch> {
    const repository = await getSearchRepository();
    const saved = await new ManualSearchEngine(provider, repository).run(input, { signal, onProgress });
    await refreshHistory();
    return saved;
  }

  if (loading) {
    return <main className="loading-screen"><BrandMark size={52} /><p>Preparando seu espaço local…</p></main>;
  }

  if (fatalError) {
    return (
      <main className="loading-screen error-screen">
        <CircleAlert size={32} />
        <h1>Não foi possível iniciar o aplicativo.</h1>
        <p>{fatalError}</p>
        <button className="primary-action" onClick={() => window.location.reload()} type="button">Tentar novamente</button>
      </main>
    );
  }

  if (!workspace.onboardingCompleted) {
    return (
      <OnboardingPage
        busy={saving}
        initialProfile={workspace.profiles[0]}
        onComplete={finishOnboarding}
      />
    );
  }

  let content;
  if (page === "overview") {
    content = (
      <OverviewPage
        api={publicationsApi}
        monitoring={workspace.monitoring}
        onOpenAttorneys={() => setPage("attorneys")}
        onOpenPublications={() => setPage("publications")}
        onOpenSearches={() => setPage("searches")}
        profiles={workspace.profiles}
        sourceName={provider.name}
      />
    );
  } else if (page === "attorneys") {
    content = <AttorneysPage onDelete={deleteProfile} onSave={saveProfile} profiles={workspace.profiles} saving={saving} />;
  } else if (page === "settings") {
    content = (
      <SettingsPage
        error={error}
        monitoring={workspace.monitoring}
        onExit={() => void exitCompletely()}
        onMonitoringChange={(enabled) => void changeMonitoring(enabled)}
        onMonitorTimeChange={(time) => void changeMonitorTime(time)}
        onRestored={() => void restoreApplication()}
        onRetentionChange={(days) => void changeRetention(days)}
        onStorageChanged={() => void refreshHistory()}
        onStorageLimitChange={(limit) => void changeStorageLimit(limit)}
        retentionDays={workspace.retentionDays}
        saving={saving}
        storageLimitMb={workspace.storageLimitMb}
      />
    );
  } else if (page === "sources") {
    content = (
      <SourcesPage
        activeId={workspace.activeProviderId}
        onActiveChange={(id) => void changeActiveProvider(id)}
        profiles={workspace.profiles}
      />
    );
  } else if (page === "searches") {
    content = (
      <SearchesPage
        api={publicationsApi}
        history={history}
        onHistoryChanged={() => void refreshHistory()}
        onSearch={runManualSearch}
        profiles={workspace.profiles}
      />
    );
  } else {
    content = (
      <PublicationsPage
        api={publicationsApi}
        onOpenSearches={() => setPage("searches")}
        profiles={workspace.profiles}
      />
    );
  }

  return (
    <Shell
      monitoring={workspace.monitoring}
      onDismissNotice={() => setRetentionNotice(undefined)}
      onPageChange={setPage}
      page={page}
      profileCount={workspace.profiles.length}
      retentionNotice={retentionNotice}
    >
      {content}
    </Shell>
  );
}
