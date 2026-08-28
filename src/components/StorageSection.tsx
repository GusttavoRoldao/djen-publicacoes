import { CalendarX2, CircleAlert, HardDrive, LoaderCircle, RotateCcw, Trash2, Wind } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { crossedAlert, formatBytes, overLimit } from "../storage/retention.ts";
import { storageApi } from "../storage/database.ts";
import type { DeletionPreview, StorageStats } from "../storage/types.ts";

const LIMIT_OPTIONS = [
  { value: 0, label: "Sem limite" },
  { value: 250, label: "Avisar acima de 250 MB" },
  { value: 500, label: "Avisar acima de 500 MB" },
  { value: 1024, label: "Avisar acima de 1 GB" },
  { value: 2048, label: "Avisar acima de 2 GB" },
];

type PendingAction = "period" | "archive" | "restore";

const TITLES: Record<PendingAction, string> = {
  period: "Excluir as publicações do período?",
  archive: "Limpar todas as pesquisas e publicações?",
  restore: "Restaurar o aplicativo por completo?",
};

const CONFIRM_LABELS: Record<PendingAction, string> = {
  period: "Excluir o período",
  archive: "Limpar o acervo",
  restore: "Apagar tudo e recomeçar",
};

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function StorageSection(props: {
  storageLimitMb: number;
  onStorageLimitChange: (limit: number) => void;
  onRestored: () => void;
  onChanged: () => void;
  saving: boolean;
}) {
  const [stats, setStats] = useState<StorageStats>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [keepAttention, setKeepAttention] = useState(true);
  const [pending, setPending] = useState<{ action: PendingAction; preview: DeletionPreview }>();
  const [busy, setBusy] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      setStats(await storageApi.stats());
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function ask(action: PendingAction) {
    setError(undefined);
    setNotice(undefined);
    try {
      const preview = action === "period"
        ? await storageApi.previewPeriodDeletion({ startDate: startDate || undefined, endDate: endDate || undefined }, keepAttention)
        : await storageApi.previewArchiveClear();
      setPending({ action, preview });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      if (pending.action === "period") {
        const result = await storageApi.deletePeriod(
          { startDate: startDate || undefined, endDate: endDate || undefined },
          keepAttention,
        );
        setNotice(`${result.publications} publicações excluídas. Compacte o banco para liberar o espaço em disco.`);
      } else if (pending.action === "archive") {
        const result = await storageApi.clearArchive();
        setNotice(`${result.searches} pesquisas e ${result.publications} publicações excluídas. Suas OABs e preferências continuam salvas.`);
      } else {
        await storageApi.restoreEverything();
        props.onRestored();
        return;
      }
      setPending(undefined);
      await refresh();
      props.onChanged();
    } catch (reason) {
      setError(errorMessage(reason));
      setPending(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function compact() {
    setCompacting(true);
    setError(undefined);
    const before = stats?.bytes ?? 0;
    try {
      const after = await storageApi.compact();
      const freed = before - after;
      setNotice(freed > 0
        ? `Banco compactado. ${formatBytes(freed)} liberados em disco.`
        : "Banco compactado. Não havia espaço a liberar.");
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCompacting(false);
    }
  }

  const alert = stats ? crossedAlert(stats.bytes) : undefined;
  const exceeded = stats ? overLimit(stats.bytes, props.storageLimitMb) : false;

  return (
    <>
      <section className="settings-section storage-section">
        <div className="settings-title">
          <HardDrive size={21} />
          <div><h2>Espaço ocupado</h2><p>Tudo fica no SQLite da pasta de dados do aplicativo.</p></div>
        </div>

        <div className="storage-grid">
          <span><small>Pesquisas salvas</small><strong>{stats?.searches ?? "—"}</strong></span>
          <span><small>Publicações salvas</small><strong>{stats?.publications ?? "—"}</strong></span>
          <span><small>Marcadas com atenção</small><strong>{stats?.attention ?? "—"}</strong></span>
          <span className="accent"><small>Espaço em disco</small><strong>{stats ? formatBytes(stats.bytes) : "—"}</strong></span>
        </div>

        {alert ? (
          <p className={exceeded ? "storage-alert over" : "storage-alert"}>
            <CircleAlert size={16} />
            O banco passou de {alert >= 1024 ? `${alert / 1024} GB` : `${alert} MB`}.
            {exceeded ? " Isso também ultrapassa o limite que você escolheu." : ""} Considere excluir períodos
            antigos ou ativar a retenção automática.
          </p>
        ) : null}

        <label className="field storage-limit">
          <span>Avisar quando passar de</span>
          <select
            disabled={props.saving}
            onChange={(event) => props.onStorageLimitChange(Number(event.target.value))}
            value={props.storageLimitMb}
          >
            {LIMIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <button className="outline-action" disabled={compacting} onClick={() => void compact()} type="button">
          {compacting ? <><LoaderCircle className="spin" size={14} /> Compactando…</> : <><Wind size={15} /> Compactar o banco</>}
        </button>

        {notice ? <p className="storage-notice">{notice}</p> : null}
        {error ? <p className="storage-error">{error}</p> : null}
      </section>

      <section className="settings-section period-section">
        <div className="settings-title">
          <CalendarX2 size={21} />
          <div><h2>Excluir por período</h2><p>Remove as publicações disponibilizadas dentro do intervalo.</p></div>
        </div>
        <div className="period-fields">
          <label className="field"><span>De</span>
            <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </label>
          <label className="field"><span>Até</span>
            <input min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
          </label>
          <label className="keep-attention">
            <input checked={keepAttention} onChange={(event) => setKeepAttention(event.target.checked)} type="checkbox" />
            Manter as marcadas como Requer atenção
          </label>
          <button
            className="danger-action"
            disabled={!startDate && !endDate}
            onClick={() => void ask("period")}
            type="button"
          >
            <Trash2 size={15} /> Ver o que será excluído
          </button>
        </div>
      </section>

      <section className="settings-section danger-section">
        <div className="settings-title">
          <Trash2 size={21} />
          <div><h2>Limpar o acervo</h2><p>Apaga pesquisas e publicações, mantendo suas OABs e preferências.</p></div>
        </div>
        <button className="danger-action" onClick={() => void ask("archive")} type="button">Limpar tudo</button>
      </section>

      <section className="settings-section danger-section">
        <div className="settings-title">
          <RotateCcw size={21} />
          <div><h2>Restaurar o aplicativo</h2><p>Apaga também as OABs cadastradas e todas as preferências.</p></div>
        </div>
        <button className="danger-action" onClick={() => void ask("restore")} type="button">Restaurar</button>
      </section>

      {pending ? (
        <ConfirmDialog
          busy={busy}
          confirmLabel={CONFIRM_LABELS[pending.action]}
          description={pending.action === "restore"
            ? `Serão apagadas ${pending.preview.searches} pesquisas, ${pending.preview.publications} publicações, as OABs cadastradas e todas as preferências. O aplicativo volta ao primeiro uso.`
            : `Serão removidas ${pending.preview.publications} publicações${pending.action === "archive" ? ` e ${pending.preview.searches} pesquisas` : ""}.`}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void confirm()}
          title={TITLES[pending.action]}
        >
          {pending.preview.protectedAttention > 0 ? (
            <p className="confirm-attention">
              {pending.preview.protectedAttention} marcadas como <strong>Requer atenção</strong> serão preservadas.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
