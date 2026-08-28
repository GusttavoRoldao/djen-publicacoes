import { CircleAlert, Download, FilterX, LoaderCircle, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AttorneyProfile } from "../attorneys/types.ts";
import { formatRegistration } from "../attorneys/validation.ts";
import { PublicationList } from "../components/PublicationList.tsx";
import { exportFiltered } from "../publications/export.ts";
import { STATUS_LABELS } from "../publications/format.ts";
import type {
  PublicationCounts,
  PublicationFacets,
  PublicationFilters,
  PublicationOrder,
  PublicationsApi,
  ReviewStatus,
} from "../publications/types.ts";

export function PublicationsPage(props: {
  api: PublicationsApi;
  profiles: AttorneyProfile[];
  onOpenSearches: () => void;
}) {
  const [status, setStatus] = useState<ReviewStatus | "">("");
  const [attention, setAttention] = useState(false);
  const [tribunal, setTribunal] = useState("");
  const [attorney, setAttorney] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [term, setTerm] = useState("");
  const [appliedProcess, setAppliedProcess] = useState("");
  const [appliedTerm, setAppliedTerm] = useState("");
  const [order, setOrder] = useState<PublicationOrder>("recent");

  const [counts, setCounts] = useState<PublicationCounts>();
  const [facets, setFacets] = useState<PublicationFacets>({ tribunals: [] });
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportNotice, setExportNotice] = useState<string>();
  const [exportError, setExportError] = useState<string>();

  const filters = useMemo<PublicationFilters>(() => {
    const [oabNumber, oabUf] = attorney ? attorney.split("|") : [];
    return {
      status: status || undefined,
      needsAttention: attention || undefined,
      tribunal: tribunal || undefined,
      oabNumber,
      oabUf,
      processNumber: appliedProcess || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      term: appliedTerm || undefined,
      order,
    };
  }, [status, attention, tribunal, attorney, appliedProcess, appliedTerm, startDate, endDate, order]);

  const filtered = Boolean(
    status || attention || tribunal || attorney || appliedProcess || appliedTerm || startDate || endDate,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedProcess(processNumber), 350);
    return () => window.clearTimeout(timer);
  }, [processNumber]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedTerm(term), 350);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => { void refreshSummary(); }, []);

  async function refreshSummary() {
    try {
      const [nextCounts, nextFacets] = await Promise.all([props.api.counts(), props.api.facets()]);
      setCounts(nextCounts);
      setFacets(nextFacets);
    } catch {
      // O resumo é secundário: uma falha aqui não pode impedir a leitura da lista.
    }
  }

  async function runExport() {
    setExporting(true);
    setExportNotice(undefined);
    setExportError(undefined);
    setExportDone(0);
    setExportTotal(0);
    try {
      const outcome = await exportFiltered(filters, (done, total) => {
        setExportDone(done);
        setExportTotal(total);
      });
      if (outcome.status === "saved") {
        setExportNotice(`${outcome.rows} publicações exportadas para ${outcome.path}.`);
      } else if (outcome.status === "empty") {
        setExportNotice("Não há publicações para exportar com os filtros atuais.");
      }
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setStatus("");
    setAttention(false);
    setTribunal("");
    setAttorney("");
    setStartDate("");
    setEndDate("");
    setProcessNumber("");
    setTerm("");
    setAppliedProcess("");
    setAppliedTerm("");
  }

  return (
    <div className="page-stack publications-page">
      <header className="page-heading compact-heading">
        <div><span className="eyebrow">Acervo local</span><h1>Caixa de publicações</h1></div>
        <p>Tudo já está neste computador. Alterar o status ou marcar atenção não consulta a fonte novamente.</p>
      </header>

      {counts ? (
        <section className="publication-counts" aria-label="Resumo do acervo">
          <span><small>Publicações salvas</small><strong>{counts.total}</strong></span>
          <span><small>Não conferidas</small><strong>{counts.unchecked}</strong></span>
          <span><small>Conferidas</small><strong>{counts.checked}</strong></span>
          <span><small>Descartadas</small><strong>{counts.discarded}</strong></span>
          <span className="accent"><small>Requer atenção</small><strong>{counts.needsAttention}</strong></span>
        </section>
      ) : null}

      <section className="publication-filters" aria-label="Filtros locais">
        <label className="field"><span>Status</span>
          <select onChange={(event) => setStatus(event.target.value as ReviewStatus | "")} value={status}>
            <option value="">Todos</option>
            <option value="unchecked">{STATUS_LABELS.unchecked}</option>
            <option value="checked">{STATUS_LABELS.checked}</option>
            <option value="discarded">{STATUS_LABELS.discarded}</option>
          </select>
        </label>
        <label className="field"><span>Tribunal</span>
          <select onChange={(event) => setTribunal(event.target.value)} value={tribunal}>
            <option value="">Todos</option>
            {facets.tribunals.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="field"><span>OAB cadastrada</span>
          <select onChange={(event) => setAttorney(event.target.value)} value={attorney}>
            <option value="">Todas</option>
            {props.profiles.map((profile) => (
              <option key={profile.id} value={`${profile.oabNumber}|${profile.oabUf}`}>
                {profile.name} — {formatRegistration(profile.oabNumber, profile.oabUf)}
              </option>
            ))}
          </select>
        </label>
        <label className="field"><span>Ordenar por</span>
          <select onChange={(event) => setOrder(event.target.value as PublicationOrder)} value={order}>
            <option value="recent">Data mais recente</option>
            <option value="oldest">Data mais antiga</option>
          </select>
        </label>
        <label className="field"><span>De</span>
          <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
        </label>
        <label className="field"><span>Até</span>
          <input min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
        </label>
        <label className="field"><span>Número do processo</span>
          <input onChange={(event) => setProcessNumber(event.target.value)} placeholder="Parte do número" value={processNumber} />
        </label>
        <label className="field"><span>Palavra no texto</span>
          <input onChange={(event) => setTerm(event.target.value)} placeholder="Ex.: audiência" value={term} />
        </label>
        <div className="filter-actions">
          <label className={attention ? "attention-filter active" : "attention-filter"}>
            <input checked={attention} onChange={(event) => setAttention(event.target.checked)} type="checkbox" />
            <Star fill={attention ? "currentColor" : "none"} size={15} /> Somente com atenção
          </label>
          <div className="filter-buttons">
            <button className="secondary-action" disabled={exporting} onClick={() => void runExport()} type="button">
              {exporting
                ? <><LoaderCircle className="spin" size={15} /> Preparando {exportTotal > 0 ? `${exportDone} de ${exportTotal}` : ""}</>
                : <><Download size={15} /> Exportar para planilha</>}
            </button>
            <button className="text-action" disabled={!filtered} onClick={clearFilters} type="button">
              <FilterX size={15} /> Limpar filtros
            </button>
          </div>
        </div>
      </section>

      {exportNotice ? <p className="export-notice" role="status">{exportNotice}</p> : null}
      {exportError ? <div className="error-banner"><CircleAlert size={18} />{exportError}</div> : null}

      <PublicationList
        api={props.api}
        emptyAction={!filtered ? (
          <button className="primary-action" onClick={props.onOpenSearches} type="button">Ir para pesquisas</button>
        ) : undefined}
        emptyMessage={filtered
          ? "Nenhuma publicação corresponde aos filtros aplicados."
          : "Ainda não há publicações salvas. Faça uma pesquisa para preencher o acervo local."}
        filters={filters}
        onReviewed={() => void refreshSummary()}
      />
    </div>
  );
}
