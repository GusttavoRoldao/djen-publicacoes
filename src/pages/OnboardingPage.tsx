import { ArrowLeft, ChevronRight, Database, Eye, ShieldCheck } from "lucide-react";
import { BrandMark } from "../components/BrandMark.tsx";
import { useState } from "react";
import type { ProfileDraft } from "../app-types.ts";
import type { RetentionDays } from "../settings/repository.ts";
import { ProfileForm } from "../components/ProfileForm.tsx";

export function OnboardingPage(props: {
  initialProfile?: ProfileDraft;
  busy: boolean;
  onComplete: (draft: ProfileDraft, monitoring: boolean, retention: RetentionDays) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft | undefined>(props.initialProfile);
  const [monitoring, setMonitoring] = useState(false);
  const [retention, setRetention] = useState<RetentionDays>(180);
  const [error, setError] = useState<string>();

  async function finish() {
    if (!draft) return;
    setError(undefined);
    try {
      await props.onComplete(draft, monitoring, retention);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <main className="onboarding-shell">
      <aside className="onboarding-aside">
        <div className="brand"><BrandMark /><span><strong>DJEN</strong><small>Publicações</small></span></div>
        <p className="onboarding-quote">“Organize primeiro. Pesquise com clareza depois.”</p>
        <div className="step-list" aria-label="Progresso da configuração">
          {["Boas-vindas", "Sua OAB", "Preferências"].map((label, index) => <span className={step === index ? "current" : step > index ? "done" : ""} key={label}><i>{index + 1}</i>{label}</span>)}
        </div>
        <div className="sidebar-note"><ShieldCheck size={19} /><p><strong>Sem conta externa</strong>Seus dados ficam neste computador.</p></div>
      </aside>

      <section className="onboarding-content">
        {step === 0 ? (
          <div className="onboarding-intro">
            <span className="eyebrow">Primeiro acesso</span>
            <h1>Publicações oficiais.<br /><em>Rotina mais simples.</em></h1>
            <p>Configure uma OAB e escolha como o aplicativo deve se comportar. Você poderá alterar tudo depois.</p>
            <div className="privacy-points">
              <span><Database size={20} /><strong>Banco local</strong><small>Nada é enviado para uma conta nossa.</small></span>
              <span><Eye size={20} /><strong>Fonte transparente</strong><small>Consultas usam a API pública do DJEN.</small></span>
            </div>
            <button className="primary-action large-action" onClick={() => setStep(1)} type="button">Começar <ChevronRight size={18} /></button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="onboarding-form-step">
            <button className="back-action" onClick={() => setStep(0)} type="button"><ArrowLeft size={16} /> Voltar</button>
            <span className="eyebrow">Seu primeiro perfil</span>
            <h1>Qual OAB vamos acompanhar?</h1>
            <p>Uma consulta curta ao DJEN tentará confirmar a inscrição. Não encontrar publicação hoje não bloqueia o cadastro.</p>
            <ProfileForm initial={draft} onSubmit={(profile) => { setDraft(profile); setStep(2); }} submitLabel="Continuar" />
          </div>
        ) : null}

        {step === 2 && draft ? (
          <div className="onboarding-preferences">
            <button className="back-action" disabled={props.busy} onClick={() => setStep(1)} type="button"><ArrowLeft size={16} /> Voltar</button>
            <span className="eyebrow">Preferências iniciais</span>
            <h1>Você decide o que fica ativo.</h1>
            <p>Ambas as escolhas são explícitas e podem ser alteradas nas configurações.</p>

            <label className="choice-card">
              <span><strong>Monitoramento em segundo plano</strong><small>Inicia com o Windows e permanece na bandeja quando a janela é fechada.</small></span>
              <input checked={monitoring} disabled={props.busy} onChange={(event) => setMonitoring(event.target.checked)} role="switch" type="checkbox" />
            </label>
            <label className="choice-card retention-choice">
              <span><strong>Retenção das futuras publicações</strong><small>Escolha quando o acervo local deverá ser limpo.</small></span>
              <select disabled={props.busy} onChange={(event) => setRetention(Number(event.target.value) as RetentionDays)} value={retention}>
                <option value={180}>180 dias (recomendado)</option><option value={90}>90 dias</option><option value={30}>30 dias</option><option value={0}>Nunca apagar automaticamente</option>
              </select>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action large-action" disabled={props.busy} onClick={() => void finish()} type="button">{props.busy ? "Validando e salvando..." : "Concluir configuração"}<ChevronRight size={18} /></button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
