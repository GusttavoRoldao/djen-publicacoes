import { BellRing, CircleAlert, Database, LogOut, TimerReset } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { StorageSection } from "../components/StorageSection.tsx";
import { storageApi } from "../storage/database.ts";
import { retentionCutoff } from "../storage/retention.ts";
import type { DeletionPreview } from "../storage/types.ts";
import type { RetentionDays } from "../settings/repository.ts";
import type { MonitoringState } from "../runtime/desktop.ts";

const RETENTION_OPTIONS: { value: RetentionDays; label: string }[] = [
  { value: 0, label: "Manter até eu excluir" },
  { value: 30, label: "Excluir após 30 dias" },
  { value: 90, label: "Excluir após 90 dias" },
  { value: 180, label: "Excluir após 180 dias" },
];

function formatMonitorDate(value?: string): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Ainda não ocorreu";
}

export function SettingsPage(props: {
  monitoring: MonitoringState;
  retentionDays: RetentionDays;
  storageLimitMb: number;
  saving: boolean;
  error?: string;
  onMonitoringChange: (enabled: boolean) => void;
  onMonitorTimeChange: (time: string) => void;
  onRetentionChange: (days: RetentionDays) => void;
  onStorageLimitChange: (limit: number) => void;
  onStorageChanged: () => void;
  onRestored: () => void;
  onExit: () => void;
}) {
  const [pendingRetention, setPendingRetention] = useState<{ days: RetentionDays; preview: DeletionPreview }>();
  const [applying, setApplying] = useState(false);
  const disabled = props.saving || !props.monitoring.available;

  /**
   * A retenção apaga publicações de verdade, então a escolha precisa ser explícita:
   * o número de itens afetados aparece antes de a preferência ser gravada.
   */
  async function askRetention(days: RetentionDays) {
    const cutoff = retentionCutoff(new Date(), days);
    if (!cutoff) {
      props.onRetentionChange(days);
      return;
    }
    setPendingRetention({ days, preview: await storageApi.previewRetention(cutoff) });
  }

  function confirmRetention() {
    if (!pendingRetention) return;
    setApplying(true);
    props.onRetentionChange(pendingRetention.days);
    setPendingRetention(undefined);
    setApplying(false);
  }
  return (
    <div className="page-stack settings-page">
      <header className="page-heading compact-heading">
        <div><span className="eyebrow">Preferências</span><h1>Configurações</h1></div>
        <p>Escolha o ciclo de vida e por quanto tempo os dados devem permanecer neste computador.</p>
      </header>

      {props.error ? <div className="error-banner"><CircleAlert size={18} />{props.error}</div> : null}

      <section className="settings-section">
        <div className="settings-title"><BellRing size={21} /><div><h2>Monitoramento em segundo plano</h2><p>Ative somente se quiser manter o aplicativo na bandeja.</p></div></div>
        <label className={disabled ? "switch-row disabled" : "switch-row"}>
          <span><strong>Iniciar com o Windows e manter o monitor</strong><small>{props.monitoring.enabled ? "Ao fechar a janela, o aplicativo continua na bandeja." : "Ao fechar a janela, o aplicativo é encerrado por completo."}</small></span>
          <input checked={props.monitoring.enabled} disabled={disabled} onChange={(event) => props.onMonitoringChange(event.target.checked)} role="switch" type="checkbox" />
        </label>
        <label className="field monitor-time-field"><span>Horário diário</span><input disabled={disabled} onChange={(event) => props.onMonitorTimeChange(event.target.value)} type="time" value={props.monitoring.time} /></label>
        <div className="monitor-history">
          <span><small>Última tentativa</small><strong>{formatMonitorDate(props.monitoring.lastAttempt)}</strong></span>
          <span><small>Último sucesso</small><strong>{formatMonitorDate(props.monitoring.lastSuccess)}</strong></span>
          <span><small>Estado</small><strong>{props.monitoring.running ? "Pesquisando agora" : props.monitoring.lastError ? "Última tentativa falhou" : "Aguardando horário"}</strong></span>
        </div>
        {props.monitoring.lastError ? <p className="monitor-error">{props.monitoring.lastError}</p> : null}
      </section>

      <section className="settings-section retention-section">
        <div className="settings-title"><TimerReset size={21} /><div><h2>Retenção de dados</h2><p>A limpeza roda uma vez por dia, ao abrir o aplicativo, e nunca apaga itens marcados como Requer atenção.</p></div></div>
        <label className="field retention-field"><span>Prazo das publicações</span><select disabled={props.saving} onChange={(event) => void askRetention(Number(event.target.value) as RetentionDays)} value={props.retentionDays}>{RETENTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </section>

      <section className="settings-section local-data-section">
        <div className="settings-title"><Database size={21} /><div><h2>Dados locais</h2><p>Perfis, preferências e o acervo ficam no SQLite da pasta de dados do aplicativo.</p></div></div>
        <code>%APPDATA%\br.com.djenpublicacoes.desktop</code>
      </section>

      {pendingRetention ? (
        <ConfirmDialog
          busy={applying}
          confirmLabel={pendingRetention.preview.publications > 0 ? "Ativar e apagar agora" : "Ativar a limpeza"}
          description={pendingRetention.preview.publications > 0
            ? `A limpeza vai apagar ${pendingRetention.preview.publications} publicações com mais de ${pendingRetention.days} dias, hoje e uma vez por dia daqui em diante.`
            : `A limpeza passará a apagar, uma vez por dia, o que tiver mais de ${pendingRetention.days} dias. Nada será apagado agora.`}
          onCancel={() => setPendingRetention(undefined)}
          onConfirm={confirmRetention}
          title={`Apagar automaticamente o que passar de ${pendingRetention.days} dias?`}
        >
          {pendingRetention.preview.protectedAttention > 0 ? (
            <p className="confirm-attention">
              {pendingRetention.preview.protectedAttention} marcadas como <strong>Requer atenção</strong> serão preservadas, hoje e sempre.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      <StorageSection
        onChanged={props.onStorageChanged}
        onRestored={props.onRestored}
        onStorageLimitChange={props.onStorageLimitChange}
        saving={props.saving}
        storageLimitMb={props.storageLimitMb}
      />

      <section className="settings-section danger-section">
        <div className="settings-title"><LogOut size={21} /><div><h2>Sair completamente</h2><p>Encerra também qualquer processo que esteja na bandeja.</p></div></div>
        <button className="outline-action" disabled={!props.monitoring.available} onClick={props.onExit} type="button">Encerrar aplicativo</button>
      </section>
    </div>
  );
}
