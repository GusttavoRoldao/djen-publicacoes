import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Confirmação para ações destrutivas. Mostra exatamente o que será removido
 * antes de excluir e lembra que a exclusão afeta somente a cópia local.
 */
export function ConfirmDialog(props: {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !props.busy) props.onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.busy, props.onCancel]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return createPortal((
    <div className="confirm-overlay" role="presentation">
      <section aria-modal="true" className="confirm-dialog" role="dialog">
        <header><TriangleAlert size={22} /><h2>{props.title}</h2></header>
        <p>{props.description}</p>
        {props.children}
        <p className="confirm-scope">
          A exclusão vale apenas para a cópia guardada neste computador. Nada muda nos registros do CNJ,
          e a mesma publicação pode voltar em uma nova pesquisa.
        </p>
        <div className="confirm-actions">
          <button className="secondary-action" disabled={props.busy} onClick={props.onCancel} type="button">
            Cancelar
          </button>
          <button className="danger-action" disabled={props.busy} onClick={props.onConfirm} type="button">
            {props.busy ? <><LoaderCircle className="spin" size={15} /> Excluindo…</> : props.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  ), document.body);
}
