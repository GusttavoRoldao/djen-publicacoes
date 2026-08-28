import { Archive, ChevronRight, Database, Gavel, MonitorCog, Star, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttorneyProfile } from "../attorneys/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { formatTimestamp } from "../publications/format.ts";
import type { MonitoringState } from "../runtime/desktop.ts";
import type { PublicationCounts, PublicationsApi } from "../publications/types.ts";

export function OverviewPage(props: {
  api: PublicationsApi;
  monitoring: MonitoringState;
  profiles: AttorneyProfile[];
  sourceName: string;
  onOpenAttorneys: () => void;
  onOpenPublications: () => void;
  onOpenSearches: () => void;
}) {
  const [counts, setCounts] = useState<PublicationCounts>();

  useEffect(() => {
    let active = true;
    props.api.counts()
      .then((next) => { if (active) setCounts(next); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const first = props.profiles[0];
  const hasArchive = (counts?.total ?? 0) > 0;

  return (
    <div className="page-stack">
      <header className="page-heading overview-heading">
        <div>
          <span className="eyebrow">Visão geral</span>
          <h1>Seu diário jurídico,<br /><em>sem sair da sua mesa.</em></h1>
        </div>
        <p>Acompanhe publicações oficiais do DJEN em um espaço local, direto e construído para o trabalho diário.</p>
      </header>

      {hasArchive && counts ? (
        <section className="overview-summary" aria-label="Resumo do acervo">
          <button className="overview-metric" onClick={props.onOpenPublications} type="button">
            <small>Publicações salvas</small><strong>{counts.total}</strong>
          </button>
          <button className="overview-metric" onClick={props.onOpenPublications} type="button">
            <small>Aguardando conferência</small><strong>{counts.unchecked}</strong>
          </button>
          <button className="overview-metric accent" onClick={props.onOpenPublications} type="button">
            <small><Star size={12} /> Requer atenção</small><strong>{counts.needsAttention}</strong>
          </button>
        </section>
      ) : null}

      <section className="readiness-panel" aria-labelledby="readiness-title">
        <div className="section-number">01</div>
        <div className="readiness-copy">
          <span className="eyebrow">Perfis de acompanhamento</span>
          <h2 id="readiness-title">
            {props.profiles.length > 0
              ? `${props.profiles.length} ${props.profiles.length === 1 ? "OAB preparada" : "OABs preparadas"}.`
              : "Cadastre sua primeira OAB."}
          </h2>
          <p>As pesquisas combinam as OABs cadastradas aqui. Tudo fica no banco local deste computador.</p>
        </div>
        <button className="text-action" onClick={props.onOpenAttorneys} type="button">
          Gerenciar perfis <ChevronRight size={17} />
        </button>
      </section>

      <section className="foundation-grid" aria-label="Estado do aplicativo">
        <article className="foundation-item">
          <Database size={22} />
          <span>Armazenamento</span>
          <strong>SQLite local</strong>
          <small>Fora da pasta do executável</small>
        </article>
        <article className="foundation-item accent">
          <Gavel size={22} />
          <span>Fonte ativa</span>
          <strong>{props.sourceName}</strong>
          <small>Trocável na tela de Fontes</small>
        </article>
        <article className="foundation-item">
          <MonitorCog size={22} />
          <span>Segundo plano</span>
          <strong>{props.monitoring.enabled ? "Ativo" : "Desativado"}</strong>
          <small>
            {props.monitoring.enabled
              ? props.monitoring.lastSuccess
                ? `Última busca em ${formatTimestamp(props.monitoring.lastSuccess)}`
                : `Busca diária às ${props.monitoring.time}`
              : "Fechar encerra o aplicativo"}
          </small>
        </article>
      </section>

      {first ? (
        <section className="featured-profile">
          <Avatar name={first.name} photo={first.photoDataUrl} />
          <div><span className="eyebrow">Perfil principal</span><h2>{first.name}</h2><p>OAB {first.oabUf} {first.oabNumber}</p></div>
          {props.profiles.length > 1 ? <span className="profile-total"><UsersRound size={17} /> +{props.profiles.length - 1}</span> : null}
        </section>
      ) : (
        <section className="empty-ledger">
          <Archive size={25} strokeWidth={1.6} />
          <div><h2>Nenhum perfil cadastrado</h2><p>Adicione uma OAB para preparar suas pesquisas.</p></div>
        </section>
      )}

      {!hasArchive && props.profiles.length > 0 ? (
        <section className="overview-cta">
          <div>
            <h2>Ainda não há publicações salvas.</h2>
            <p>Faça a primeira pesquisa para preencher o acervo local. A consulta só começa quando você clicar.</p>
          </div>
          <button className="primary-action large-action" onClick={props.onOpenSearches} type="button">
            Pesquisar no DJEN
          </button>
        </section>
      ) : null}
    </div>
  );
}
