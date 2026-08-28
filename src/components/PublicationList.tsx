import { ChevronLeft, ChevronRight, CircleAlert, FileSearch, LoaderCircle, Star, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { PublicationDetailPanel } from "./PublicationDetail.tsx";
import { formatDay, STATUS_LABELS } from "../publications/format.ts";
import { storageApi } from "../storage/database.ts";
import type { DeletionPreview } from "../storage/types.ts";
import type {
  PublicationDetail,
  PublicationFilters,
  PublicationPage,
  PublicationsApi,
  PublicationSummary,
  ReviewStatus,
} from "../publications/types.ts";

export const PAGE_SIZE = 20;

const EMPTY_RESULT: PublicationPage = { total: 0, offset: 0, items: [] };

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function StatusDot({ item }: { item: PublicationSummary }) {
  return (
    <span className={`status-dot ${item.status}`} title={STATUS_LABELS[item.status]}>
      <i aria-hidden="true" />
      <small>{STATUS_LABELS[item.status]}</small>
    </span>
  );
}

/**
 * Lista do acervo local para um conjunto de filtros. Usada pela caixa de publicações e pelos
 * resultados de uma pesquisa reaberta pelo histórico, para que as duas telas se comportem igual.
 */
export function PublicationList(props: {
  api: PublicationsApi;
  filters: PublicationFilters;
  emptyMessage: string;
  emptyAction?: ReactNode;
  onReviewed?: () => void;
  onDeleted?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<PublicationPage>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [detail, setDetail] = useState<PublicationDetail>();
  const [busyId, setBusyId] = useState<number>();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [pendingDeletion, setPendingDeletion] = useState<DeletionPreview>();
  const [deleting, setDeleting] = useState(false);

  const filterKey = JSON.stringify(props.filters);
  const [appliedKey, setAppliedKey] = useState(filterKey);

  // Trocar de filtro precisa voltar para a primeira página antes da busca, e não depois dela.
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey);
    setOffset(0);
    setSelected(new Set());
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    props.api.list(props.filters, PAGE_SIZE, offset)
      .then((page) => { if (active) setResult(page); })
      .catch((reason: unknown) => { if (active) { setResult(EMPTY_RESULT); setError(errorMessage(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterKey, offset, reloadToken]);

  function patch(id: number, change: (item: PublicationSummary) => PublicationSummary) {
    setResult((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? change(item) : item)),
    }));
    setDetail((current) => (current && current.id === id ? { ...current, ...change(current) } : current));
  }

  async function review(
    id: number,
    action: () => Promise<void>,
    change: (item: PublicationSummary) => PublicationSummary,
  ) {
    setBusyId(id);
    setError(undefined);
    try {
      await action();
      patch(id, change);
      props.onReviewed?.();
      // A publicação pode ter deixado de atender ao filtro que a trouxe até aqui.
      if (props.filters.status || props.filters.needsAttention) setReloadToken((token) => token + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyId(undefined);
    }
  }

  function changeStatus(id: number, next: ReviewStatus) {
    void review(id, () => props.api.setStatus(id, next), (item) => ({ ...item, status: next }));
  }

  function changeAttention(id: number, next: boolean) {
    void review(id, () => props.api.setAttention(id, next), (item) => ({ ...item, needsAttention: next }));
  }

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of result.items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  async function askDeletion() {
    setError(undefined);
    try {
      setPendingDeletion(await storageApi.previewSelection([...selected]));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function confirmDeletion() {
    setDeleting(true);
    setError(undefined);
    try {
      await storageApi.deletePublications([...selected]);
      setSelected(new Set());
      setPendingDeletion(undefined);
      setOffset(0);
      setReloadToken((token) => token + 1);
      props.onDeleted?.();
      props.onReviewed?.();
    } catch (reason) {
      setError(errorMessage(reason));
      setPendingDeletion(undefined);
    } finally {
      setDeleting(false);
    }
  }

  function openDetail(id: number) {
    setError(undefined);
    props.api.detail(id)
      .then((found) => setDetail(found))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }

  const firstItem = result.total === 0 ? 0 : offset + 1;
  const lastItem = Math.min(offset + PAGE_SIZE, result.total);
  const pageFullySelected = result.items.length > 0 && result.items.every((item) => selected.has(item.id));

  return (
    <section className="publication-list" aria-busy={loading}>
      {error ? <div className="error-banner"><CircleAlert size={18} />{error}</div> : null}

      <div className="list-summary">
        <span>{result.total === 0 ? "Nenhuma publicação encontrada" : `Mostrando ${firstItem}–${lastItem} de ${result.total}`}</span>
        {loading ? <small><LoaderCircle className="spin" size={14} /> Carregando</small> : null}
      </div>

      {result.items.length > 0 ? (
        <div className={selected.size > 0 ? "selection-bar active" : "selection-bar"}>
          <label>
            <input
              checked={pageFullySelected}
              onChange={(event) => togglePage(event.target.checked)}
              type="checkbox"
            />
            Selecionar as {result.items.length} desta página
          </label>
          {selected.size > 0 ? (
            <>
              <span>{selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}</span>
              <button className="text-action" onClick={() => setSelected(new Set())} type="button">Limpar seleção</button>
              <button className="danger-action" onClick={() => void askDeletion()} type="button">
                <Trash2 size={15} /> Excluir selecionadas
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {result.items.map((item) => (
        <article className={item.needsAttention ? "publication-row attention" : "publication-row"} key={item.id}>
          <div className="publication-mark">
            <label className="row-select">
              <input
                aria-label={`Selecionar a publicação do processo ${item.processNumber}`}
                checked={selected.has(item.id)}
                onChange={() => toggleSelected(item.id)}
                type="checkbox"
              />
            </label>
            <StatusDot item={item} />
            <button
              aria-label={item.needsAttention ? "Remover indicador de atenção" : "Marcar como requer atenção"}
              aria-pressed={item.needsAttention}
              className={item.needsAttention ? "attention-toggle active" : "attention-toggle"}
              disabled={busyId === item.id}
              onClick={() => changeAttention(item.id, !item.needsAttention)}
              type="button"
            >
              <Star fill={item.needsAttention ? "currentColor" : "none"} size={16} />
            </button>
          </div>

          <div className="publication-body">
            <span className="publication-meta">
              {formatDay(item.availableOn)} · {item.tribunal} · {item.communicationType || "Comunicação"}
              {item.className ? ` · ${item.className}` : ""}
            </span>
            <h2>{item.processNumber || "Processo não informado"}</h2>
            {item.courtUnit ? <p className="publication-unit">{item.courtUnit}</p> : null}
            <p className="publication-excerpt">{item.excerpt}{item.truncated ? "…" : ""}</p>
            {item.attorneys.length > 0 ? (
              <p className="publication-attorneys">
                {item.attorneys.map((person) => `${person.name} (OAB ${person.oabUf} ${person.oabNumber})`).join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="publication-actions">
            <label className="field row-status">
              <span>Status local</span>
              <select
                disabled={busyId === item.id}
                onChange={(event) => changeStatus(item.id, event.target.value as ReviewStatus)}
                value={item.status}
              >
                <option value="unchecked">{STATUS_LABELS.unchecked}</option>
                <option value="checked">{STATUS_LABELS.checked}</option>
                <option value="discarded">{STATUS_LABELS.discarded}</option>
              </select>
            </label>
            <button className="secondary-action" onClick={() => openDetail(item.id)} type="button">
              Abrir detalhes <ChevronRight size={15} />
            </button>
          </div>
        </article>
      ))}

      {!loading && result.items.length === 0 ? (
        <div className="empty-page">
          <FileSearch size={38} strokeWidth={1.3} />
          <p>{props.emptyMessage}</p>
          {props.emptyAction}
        </div>
      ) : null}

      {result.total > PAGE_SIZE ? (
        <div className="list-pagination">
          <button
            className="secondary-action"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
            type="button"
          >
            <ChevronLeft size={15} /> Anteriores
          </button>
          <span>Página {Math.floor(offset / PAGE_SIZE) + 1} de {Math.max(Math.ceil(result.total / PAGE_SIZE), 1)}</span>
          <button
            className="secondary-action"
            disabled={lastItem >= result.total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            type="button"
          >
            Próximas <ChevronRight size={15} />
          </button>
        </div>
      ) : null}

      {pendingDeletion ? (
        <ConfirmDialog
          busy={deleting}
          confirmLabel={`Excluir ${pendingDeletion.publications} ${pendingDeletion.publications === 1 ? "publicação" : "publicações"}`}
          description={`Serão removidas ${pendingDeletion.publications} ${pendingDeletion.publications === 1 ? "publicação selecionada" : "publicações selecionadas"} e os vínculos delas com as pesquisas salvas. O histórico das pesquisas continua.`}
          onCancel={() => setPendingDeletion(undefined)}
          onConfirm={() => void confirmDeletion()}
          title="Excluir as publicações selecionadas?"
        >
          {pendingDeletion.protectedAttention > 0 ? (
            <p className="confirm-attention">
              {pendingDeletion.protectedAttention} {pendingDeletion.protectedAttention === 1
                ? "delas está marcada"
                : "delas estão marcadas"} como <strong>Requer atenção</strong> e também será removida.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {detail ? (
        <PublicationDetailPanel
          busy={busyId === detail.id}
          detail={detail}
          onAttentionChange={(next) => changeAttention(detail.id, next)}
          onClose={() => setDetail(undefined)}
          onStatusChange={(next) => changeStatus(detail.id, next)}
        />
      ) : null}
    </section>
  );
}
