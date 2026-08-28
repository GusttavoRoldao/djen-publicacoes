import {
  BookOpenText,
  BriefcaseBusiness,
  ChevronRight,
  FileSearch,
  LayoutDashboard,
  Plug,
  TimerReset,
  X,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark.tsx";
import type { MonitoringState } from "../runtime/desktop.ts";
import type { PageId } from "../app-types.ts";

const NAV_ITEMS = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "publications", label: "Publicações", icon: BookOpenText },
  { id: "searches", label: "Pesquisas", icon: FileSearch },
  { id: "attorneys", label: "Advogados", icon: BriefcaseBusiness },
  { id: "sources", label: "Fontes", icon: Plug },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;

function Brand() {
  return (
    <div className="brand">
      <BrandMark />
      <span><strong>DJEN</strong><small>Publicações</small></span>
    </div>
  );
}

function Sidebar({ page, profiles, onChange }: { page: PageId; profiles: number; onChange: (page: PageId) => void }) {
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="navigation" aria-label="Navegação principal">
        <span className="navigation-label">Espaço de trabalho</span>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={page === item.id ? "page" : undefined}
              className={page === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => onChange(item.id)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === "attorneys" && profiles > 0
                ? <small aria-label={`${profiles} OABs cadastradas`} className="nav-count">{profiles}</small>
                : <ChevronRight className="nav-arrow" size={15} />}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={19} />
        <p><strong>Privado por padrão</strong>Dados e configurações ficam neste computador.</p>
      </div>
    </aside>
  );
}

function StatusTag({ monitoring }: { monitoring: MonitoringState }) {
  const label = monitoring.enabled ? "Monitor ativo" : "Monitor pausado";
  return (
    <div className={monitoring.enabled ? "status-tag online" : "status-tag"} role="status">
      <span aria-hidden="true" />
      {monitoring.available ? label : "Prévia da interface"}
    </div>
  );
}

export function Shell(props: {
  children: ReactNode;
  monitoring: MonitoringState;
  page: PageId;
  profileCount: number;
  retentionNotice?: string;
  onPageChange: (page: PageId) => void;
  onDismissNotice: () => void;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">Ir direto para o conteúdo</a>
      <Sidebar onChange={props.onPageChange} page={props.page} profiles={props.profileCount} />
      <main className="main-content" id="conteudo" tabIndex={-1}>
        <div className="topbar">
          <span>Diário de Justiça Eletrônico Nacional</span>
          <StatusTag monitoring={props.monitoring} />
        </div>
        {props.retentionNotice ? (
          <div className="retention-banner" role="status">
            <TimerReset size={19} />
            <p>{props.retentionNotice}</p>
            <button aria-label="Fechar aviso" onClick={props.onDismissNotice} type="button"><X size={16} /></button>
          </div>
        ) : null}
        {props.children}
        <footer className="legal-note">
          <strong>Nota de responsabilidade</strong>
          Esta ferramenta auxilia o acompanhamento e não substitui a consulta aos canais oficiais nem a conferência profissional.
        </footer>
      </main>
    </div>
  );
}
