import { Check, Copy, Link2, Star, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatDay, STATUS_LABELS } from "../publications/format.ts";
import type { PublicationDetail as Detail, ReviewStatus } from "../publications/types.ts";

const STATUS_ORDER: ReviewStatus[] = ["unchecked", "checked", "discarded"];

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="detail-field"><small>{label}</small><strong>{children}</strong></div>;
}

export function PublicationDetailPanel(props: {
  detail: Detail;
  busy: boolean;
  onClose: () => void;
  onStatusChange: (status: ReviewStatus) => void;
  onAttentionChange: (needsAttention: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const { detail } = props;
  const markedUp = detail.readableText !== detail.text;

  // O painel vive fora de `.page-stack`: aquele contêiner tem animação com `transform`, o que
  // tornaria o `position: fixed` relativo a ele em vez da janela.
  return createPortal((
    <div className="detail-overlay" onClick={props.onClose} role="presentation">
      <section
        aria-label={`Publicação do processo ${detail.processNumber}`}
        className="detail-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="detail-header">
          <div>
            <span className="eyebrow">{detail.tribunal} · {formatDay(detail.availableOn)}</span>
            <h2>{detail.communicationType || "Comunicação"}</h2>
            <p>{detail.courtUnit}</p>
          </div>
          <button aria-label="Fechar detalhes" className="detail-close" onClick={props.onClose} type="button">
            <X size={19} />
          </button>
        </header>

        <div className="detail-review">
          <div className="status-choice" role="group" aria-label="Status local">
            {STATUS_ORDER.map((status) => (
              <button
                aria-pressed={detail.status === status}
                className={detail.status === status ? `status-button ${status} active` : `status-button ${status}`}
                disabled={props.busy}
                key={status}
                onClick={() => props.onStatusChange(status)}
                type="button"
              >
                {detail.status === status ? <Check size={14} /> : null}
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <button
            aria-pressed={detail.needsAttention}
            className={detail.needsAttention ? "attention-button active" : "attention-button"}
            disabled={props.busy}
            onClick={() => props.onAttentionChange(!detail.needsAttention)}
            type="button"
          >
            <Star fill={detail.needsAttention ? "currentColor" : "none"} size={15} />
            Requer atenção
          </button>
        </div>

        <div className="detail-grid">
          <Field label="Processo">{detail.processNumber || "Não informado"}</Field>
          <Field label="Tribunal">{detail.tribunal}</Field>
          <Field label="Órgão julgador">{detail.courtUnit || "Não informado"}</Field>
          <Field label="Tipo de comunicação">{detail.communicationType || "Não informado"}</Field>
          <Field label="Classe">{detail.className ?? "Não informada"}</Field>
          <Field label="Tipo de documento">{detail.documentType ?? "Não informado"}</Field>
          <Field label="Meio">{detail.medium === "D" ? "Diário Eletrônico" : detail.medium}</Field>
          <Field label="Fonte">{detail.source}</Field>
          <Field label="Identificador da fonte">{detail.hash ?? (detail.sourceId || "Não informado")}</Field>
          <Field label="Número da comunicação">{detail.communicationNumber ?? "Não informado"}</Field>
        </div>

        {detail.attorneys.length > 0 ? (
          <section className="detail-people">
            <h3>Advogados informados pela fonte</h3>
            <ul>
              {detail.attorneys.map((attorney) => (
                <li key={`${attorney.oabNumber}-${attorney.oabUf}-${attorney.name}`}>
                  {attorney.name} <small>OAB {attorney.oabUf} {attorney.oabNumber}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {detail.recipients.length > 0 ? (
          <section className="detail-people">
            <h3>Partes informadas pela fonte</h3>
            <ul>
              {detail.recipients.map((recipient) => (
                <li key={`${recipient.name}-${recipient.role ?? ""}`}>
                  {recipient.name}{recipient.role ? <small>{recipient.role}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="detail-text">
          <div className="detail-text-head">
            <h3>Texto original recebido da fonte</h3>
            {markedUp ? (
              <button className="text-action" onClick={() => setShowSource(!showSource)} type="button">
                {showSource ? "Ver em leitura corrida" : "Ver a marcação recebida"}
              </button>
            ) : null}
          </div>
          <article className={showSource ? "source-text" : undefined}>
            {showSource ? detail.text : detail.readableText}
          </article>
          {markedUp && !showSource ? (
            <small className="detail-text-note">
              Este tribunal envia o texto com marcação HTML. Acima está o mesmo conteúdo em leitura corrida,
              sem nenhum corte: nada foi resumido, removido ou reordenado.
            </small>
          ) : null}
        </section>

        {detail.officialLink ? (
          <section className="detail-link">
            <Link2 size={17} />
            <code>{detail.officialLink}</code>
            <button
              className="secondary-action"
              onClick={() => void copyText(detail.officialLink ?? "").then(setCopied)}
              type="button"
            >
              {copied ? <><Check size={14} /> Link copiado</> : <><Copy size={14} /> Copiar link</>}
            </button>
          </section>
        ) : null}

        <p className="detail-note">
          O texto acima é exibido exatamente como foi recebido da fonte e nunca é resumido. O status e o indicador de
          atenção valem apenas para esta cópia local.
        </p>
      </section>
    </div>
  ), document.body);
}
