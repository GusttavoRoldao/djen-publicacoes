import { BadgeCheck, CircleDashed, Pencil, Plus, Trash2, WifiOff } from "lucide-react";
import { useState } from "react";
import type { AttorneyProfile } from "../attorneys/types.ts";
import type { ProfileDraft } from "../app-types.ts";
import { formatRegistration } from "../attorneys/validation.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ProfileForm } from "../components/ProfileForm.tsx";

const VALIDATION = {
  confirmed: { label: "Confirmada no DJEN", icon: BadgeCheck },
  no_recent_publications: { label: "Sem publicação hoje", icon: CircleDashed },
  unavailable: { label: "Validação indisponível", icon: WifiOff },
} as const;

export function AttorneysPage(props: {
  profiles: AttorneyProfile[];
  saving: boolean;
  onSave: (draft: ProfileDraft, id?: number) => Promise<void>;
  onDelete: (profile: AttorneyProfile) => Promise<void>;
}) {
  const [editing, setEditing] = useState<AttorneyProfile | "new">();

  async function save(draft: ProfileDraft) {
    await props.onSave(draft, editing === "new" ? undefined : editing?.id);
    setEditing(undefined);
  }

  async function remove(profile: AttorneyProfile) {
    const confirmed = window.confirm(`Excluir o perfil de ${profile.name}? As publicações já armazenadas não serão apagadas.`);
    if (confirmed) await props.onDelete(profile);
  }

  if (editing) {
    const initial = editing === "new" ? undefined : editing;
    return (
      <div className="page-stack">
        <header className="page-heading compact-heading">
          <div><span className="eyebrow">Perfis de OAB</span><h1>{editing === "new" ? "Novo advogado" : "Editar perfil"}</h1></div>
          <p>A tentativa de validação usa o DJEN, mas a falta de publicação recente não impede o cadastro.</p>
        </header>
        <section className="form-panel">
          <ProfileForm
            busy={props.saving}
            initial={initial}
            onCancel={() => setEditing(undefined)}
            onSubmit={save}
            submitLabel={editing === "new" ? "Cadastrar OAB" : "Salvar alterações"}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-heading compact-heading attorneys-heading">
        <div><span className="eyebrow">Perfis de OAB</span><h1>Advogados</h1></div>
        <button className="primary-action" onClick={() => setEditing("new")} type="button"><Plus size={17} /> Adicionar perfil</button>
      </header>

      {props.profiles.length === 0 ? (
        <section className="empty-page"><Plus size={36} strokeWidth={1.3} /><p>Nenhuma OAB cadastrada. Adicione o primeiro perfil para começar.</p></section>
      ) : (
        <section className="profiles-list" aria-label="Perfis cadastrados">
          {props.profiles.map((profile, index) => {
            const status = VALIDATION[profile.validationStatus];
            const StatusIcon = status.icon;
            return (
              <article className="profile-row" key={profile.id}>
                <span className="profile-index">{String(index + 1).padStart(2, "0")}</span>
                <Avatar name={profile.name} photo={profile.photoDataUrl} />
                <div className="profile-identity">
                  <h2>{profile.name}</h2>
                  <p>{formatRegistration(profile.oabNumber, profile.oabUf)}</p>
                </div>
                <span className={`validation-status ${profile.validationStatus}`}><StatusIcon size={15} /> {status.label}</span>
                <div className="row-actions">
                  <button aria-label={`Editar ${profile.name}`} onClick={() => setEditing(profile)} type="button"><Pencil size={17} /></button>
                  <button aria-label={`Excluir ${profile.name}`} onClick={() => void remove(profile)} type="button"><Trash2 size={17} /></button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
