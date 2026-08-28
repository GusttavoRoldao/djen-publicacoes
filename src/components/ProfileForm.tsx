import { Camera, ImageMinus, LoaderCircle } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { createAvatar } from "../attorneys/avatar.ts";
import { BRAZILIAN_STATES, normalizeRegistration } from "../attorneys/validation.ts";
import type { ProfileDraft } from "../app-types.ts";
import { Avatar } from "./Avatar.tsx";

export function ProfileForm(props: {
  initial?: ProfileDraft;
  busy?: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (draft: ProfileDraft) => void | Promise<void>;
}) {
  const [name, setName] = useState(props.initial?.name ?? "");
  const [oabNumber, setOabNumber] = useState(props.initial?.oabNumber ?? "");
  const [oabUf, setOabUf] = useState(props.initial?.oabUf ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState(props.initial?.photoDataUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setError(undefined);
    try {
      setPhotoDataUrl(await createAvatar(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPhotoBusy(false);
      event.target.value = "";
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      if (!name.trim()) throw new Error("Informe o nome do advogado.");
      const registration = normalizeRegistration(oabNumber, oabUf);
      await props.onSubmit({
        name: name.trim(),
        oabNumber: registration.number,
        oabUf: registration.uf,
        photoDataUrl,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const busy = props.busy || photoBusy;
  return (
    <form className="profile-form" onSubmit={(event) => void submit(event)}>
      <div className="photo-field">
        <Avatar name={name || "Novo perfil"} photo={photoDataUrl} size="large" />
        <div>
          <label className="photo-action">
            <Camera size={16} /> {photoBusy ? "Processando..." : "Escolher foto"}
            <input accept="image/*" disabled={busy} onChange={(event) => void choosePhoto(event)} type="file" />
          </label>
          {photoDataUrl ? (
            <button className="remove-photo" onClick={() => setPhotoDataUrl(undefined)} type="button">
              <ImageMinus size={15} /> Remover foto
            </button>
          ) : null}
          <small>Recorte central automático, até 256 × 256 e 200 KB.</small>
        </div>
      </div>

      <div className="form-grid">
        <label className="field field-wide">
          <span>Nome completo</span>
          <input autoComplete="name" disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Maria Silva" value={name} />
        </label>
        <label className="field">
          <span>Número da OAB</span>
          <input disabled={busy} inputMode="text" onChange={(event) => setOabNumber(event.target.value)} placeholder="Ex.: 123456" value={oabNumber} />
        </label>
        <label className="field">
          <span>UF</span>
          <select disabled={busy} onChange={(event) => setOabUf(event.target.value)} value={oabUf}>
            <option value="">Selecione</option>
            {BRAZILIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions">
        {props.onCancel ? <button className="secondary-action" disabled={busy} onClick={props.onCancel} type="button">Cancelar</button> : null}
        <button className="primary-action" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="spin" size={17} /> : null}{props.submitLabel}
        </button>
      </div>
    </form>
  );
}
