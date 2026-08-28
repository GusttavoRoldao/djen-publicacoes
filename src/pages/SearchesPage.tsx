import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Database,
  History,
  LoaderCircle,
  Search,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AttorneyProfile } from "../attorneys/types.ts";
import { formatRegistration } from "../attorneys/validation.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { PublicationList } from "../components/PublicationList.tsx";
import { storageApi } from "../storage/database.ts";
import type { DeletionPreview } from "../storage/types.ts";
import { formatPeriod, formatTimestamp } from "../publications/format.ts";
import type { PublicationsApi, SearchHistoryEntry } from "../publications/types.ts";
import { searchErrorMessage } from "../search/engine.ts";
import type {
  ManualSearchInput,
  ManualSearchProgress,
  SavedSearch,
} from "../search/types.ts";

function todayValue(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function progressValue(progress?: ManualSearchProgress): number {
  if (!progress || progress.totalSegments === 0) return 0;
  const pageFraction = progress.total > 0 ? Math.min(progress.fetched / progress.total, 1) : 0;
  return Math.round(((progress.completedSegments + pageFraction) / progress.totalSegments) * 100);
}

export function SearchesPage(props: {
  api: PublicationsApi;
  profiles: AttorneyProfile[];
  history: SearchHistoryEntry[];
  onSearch: (
    input: ManualSearchInput,
    signal: AbortSignal,
    onProgress: (progress: ManualSearchProgress) => void,
  ) => Promise<SavedSearch>;
  onHistoryChanged: () => void;
}) {
  const today = todayValue();
  const [selectedIds, setSelectedIds] = useState(() => new Set(props.profiles.map((profile) => profile.id)));
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [tribunal, setTribunal] = useState("");
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<ManualSearchProgress>();
  const [result, setResult] = useState<SavedSearch>();
  const [error, setError] = useState<string>();
  const [openedId, setOpenedId] = useState<string>();
  const [pendingRemoval, setPendingRemoval] = useState<{ entry: SearchHistoryEntry; preview: DeletionPreview }>();
  const [removing, setRemoving] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const openedFilters = useMemo(() => ({ searchId: openedId }), [openedId]);

  // Os resultados abrem dentro da lista; sem isso eles podem nascer fora da parte visível.
  const revealResults = useCallback((node: HTMLLIElement | null) => {
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  function toggleProfile(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeStartDate(value: string) {
    setStartDate(value);
    if (!endDate || endDate < value) setEndDate(value);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const profiles = props.profiles.filter((profile) => selectedIds.has(profile.id));
    const activeController = new AbortController();
    controller.current = activeController;
    setRunning(true);
    setCancelling(false);
    setProgress(undefined);
    setResult(undefined);
    setError(undefined);
    try {
      const saved = await props.onSearch(
        { profiles, startDate, endDate, tribunal: tribunal || undefined },
        activeController.signal,
        setProgress,
      );
      setResult(saved);
    } catch (reason) {
      setError(activeController.signal.aborted
        ? "Pesquisa cancelada. Nenhum resultado parcial foi salvo."
        : searchErrorMessage(reason));
    } finally {
      if (controller.current === activeController) controller.current = undefined;
      setCancelling(false);
      setRunning(false);
    }
  }

  function cancelSearch() {
    setCancelling(true);
    controller.current?.abort();
  }

  async function askRemoval(entry: SearchHistoryEntry) {
    setError(undefined);
    try {
      setPendingRemoval({ entry, preview: await storageApi.previewSearchDeletion(entry.id, true) });
    } catch (reason) {
      setError(searchErrorMessage(reason));
    }
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    setRemoving(true);
    try {
      await storageApi.deleteSearch(pendingRemoval.entry.id, true);
      if (openedId === pendingRemoval.entry.id) setOpenedId(undefined);
      setPendingRemoval(undefined);
      props.onHistoryChanged();
    } catch (reason) {
      setError(searchErrorMessage(reason));
      setPendingRemoval(undefined);
    } finally {
      setRemoving(false);
    }
  }

  const percentage = progressValue(progress);
  return (
    <div className="page-stack searches-page">
      <header className="page-heading compact-heading search-heading">
        <div><span className="eyebrow">Consulta manual</span><h1>Pesquisar no DJEN</h1></div>
        <p>A consulta só começa quando você clicar em Pesquisar. Os resultados concluídos ficam neste computador.</p>
      </header>

      <form className="search-form" onSubmit={(event) => void submit(event)}>
        <section className="search-section profile-selection">
          <div className="search-section-title"><span>01</span><div><h2>Quem deseja pesquisar?</h2><p>Selecione uma ou mais OABs cadastradas.</p></div></div>
          <div className="profile-options">
            {props.profiles.map((profile) => {
              const checked = selectedIds.has(profile.id);
              return (
                <label className={checked ? "profile-option selected" : "profile-option"} key={profile.id}>
                  <input checked={checked} disabled={running} onChange={() => toggleProfile(profile.id)} type="checkbox" />
                  <Avatar name={profile.name} photo={profile.photoDataUrl} size="small" />
                  <span><strong>{profile.name}</strong><small>{formatRegistration(profile.oabNumber, profile.oabUf)}</small></span>
                  <i aria-hidden="true">{checked ? "✓" : ""}</i>
                </label>
              );
            })}
          </div>
        </section>

        <section className="search-section search-period">
          <div className="search-section-title"><span>02</span><div><h2>Qual período?</h2><p>Datas futuras não são permitidas.</p></div></div>
          <div className="search-fields">
            <label className="field"><span>Data inicial</span><input disabled={running} max={today} onChange={(event) => changeStartDate(event.target.value)} required type="date" value={startDate} /></label>
            <label className="field"><span>Data final</span><input disabled={running} max={today} min={startDate} onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} /></label>
            <label className="field tribunal-field"><span>Tribunal — opcional</span><input autoCapitalize="characters" disabled={running} maxLength={20} onChange={(event) => setTribunal(event.target.value.toUpperCase())} placeholder="Ex.: TJPE ou TRT2" value={tribunal} /></label>
          </div>
        </section>

        <div className="search-submit-row">
          <span><CalendarDays size={17} /> Intervalos longos são divididos automaticamente.</span>
          {running && progress?.phase !== "saving" ? (
            <button className="cancel-search" disabled={cancelling} onClick={cancelSearch} type="button">
              {cancelling ? <><LoaderCircle className="spin" size={14} /> Cancelando…</> : <><Square size={14} fill="currentColor" /> Cancelar pesquisa</>}
            </button>
          ) : running ? (
            <button className="primary-action large-action" disabled type="button"><LoaderCircle className="spin" size={17} /> Concluindo</button>
          ) : (
            <button className="primary-action large-action" type="submit"><Search size={17} /> Pesquisar</button>
          )}
        </div>
      </form>

      {running && progress ? (
        <section className="search-progress" aria-live="polite">
          <div className="progress-copy">
            <LoaderCircle className="spin" size={22} />
            <div><strong>{progress.phase === "saving" ? "Salvando no banco local" : `Consultando ${progress.profileName}`}</strong><small>{progress.phase === "saving" ? `${progress.collected} publicações únicas` : `${progress.startDate} a ${progress.endDate} · página ${progress.page} · ${progress.fetched} de ${progress.total}`}</small></div>
            <b>{percentage}%</b>
          </div>
          <progress max="100" value={percentage}>{percentage}%</progress>
        </section>
      ) : null}

      {error ? <div className="search-message error"><TriangleAlert size={20} /><div><strong>A pesquisa não foi concluída</strong><p>{error}</p></div></div> : null}

      {result ? (
        <section className="search-message success">
          <CheckCircle2 size={22} />
          <div><strong>Pesquisa concluída</strong><p>{result.resultCount} publicações vinculadas a esta pesquisa; {result.newPublicationCount} eram novas no acervo local.</p>{result.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div>
          <Database size={19} />
        </section>
      ) : null}

      <section className="search-history" aria-label="Histórico de pesquisas">
        <div className="settings-title"><History size={21} /><div><h2>Histórico de pesquisas</h2><p>Reabra uma pesquisa anterior lendo apenas o banco local, sem consultar a fonte outra vez.</p></div></div>
        {props.history.length === 0 ? (
          <p className="history-empty">Nenhuma pesquisa registrada até agora.</p>
        ) : (
          <ol className="history-list">
            {props.history.map((entry) => (
              <Fragment key={entry.id}>
                <li className={entry.id === openedId ? "opened" : undefined}>
                  <div>
                    <strong>{formatPeriod(entry.startDate, entry.endDate)}{entry.tribunal ? ` · ${entry.tribunal}` : ""}</strong>
                    <small>{entry.attorneys.map((person) => `${person.name} (OAB ${person.oabUf} ${person.oabNumber})`).join(" · ") || "Sem OAB registrada"}</small>
                    <small>Executada em {formatTimestamp(entry.executedAt)}</small>
                    {entry.warnings.map((warning) => <em key={warning}>{warning}</em>)}
                  </div>
                  <span className="history-count"><b>{entry.linkedCount}</b> publicações</span>
                  <div className="history-actions">
                    <button
                      aria-expanded={entry.id === openedId}
                      className="text-action"
                      onClick={() => setOpenedId(entry.id === openedId ? undefined : entry.id)}
                      type="button"
                    >
                      {entry.id === openedId ? <>Ocultar resultados <X size={15} /></> : <>Ver resultados <ChevronRight size={15} /></>}
                    </button>
                    <button
                      aria-label="Excluir esta pesquisa"
                      className="history-remove"
                      onClick={() => void askRemoval(entry)}
                      title="Excluir esta pesquisa"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
                {entry.id === openedId ? (
                  <li className="history-results-item" ref={revealResults}>
                    <section className="history-results" aria-label="Resultados da pesquisa reaberta">
                      <div className="history-results-head">
                        <div>
                          <span className="eyebrow">Resultados desta pesquisa</span>
                          <h2>{formatPeriod(entry.startDate, entry.endDate)}{entry.tribunal ? ` · ${entry.tribunal}` : ""}</h2>
                          <p>Lido apenas do banco local, sem nova consulta à fonte.</p>
                        </div>
                        <button className="secondary-action" onClick={() => setOpenedId(undefined)} type="button">
                          <X size={15} /> Fechar
                        </button>
                      </div>
                      <PublicationList
                        api={props.api}
                        emptyMessage="Esta pesquisa não tem publicações vinculadas."
                        filters={openedFilters}
                        onDeleted={props.onHistoryChanged}
                      />
                    </section>
                  </li>
                ) : null}
              </Fragment>
            ))}
          </ol>
        )}
      </section>

      {pendingRemoval ? (
        <ConfirmDialog
          busy={removing}
          confirmLabel="Excluir a pesquisa"
          description={`A pesquisa de ${formatPeriod(pendingRemoval.entry.startDate, pendingRemoval.entry.endDate)} sai do histórico e ${pendingRemoval.preview.publications} publicações exclusivas dela serão removidas. As que também aparecem em outra pesquisa continuam no acervo.`}
          onCancel={() => setPendingRemoval(undefined)}
          onConfirm={() => void confirmRemoval()}
          title="Excluir esta pesquisa?"
        >
          {pendingRemoval.preview.protectedAttention > 0 ? (
            <p className="confirm-attention">
              {pendingRemoval.preview.protectedAttention} marcadas como <strong>Requer atenção</strong> serão preservadas.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
