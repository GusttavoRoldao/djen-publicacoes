import { avatarInitials } from "../attorneys/avatar.ts";

export function Avatar({ name, photo, size = "medium" }: { name: string; photo?: string; size?: "small" | "medium" | "large" }) {
  return photo
    ? <img alt={`Foto de ${name}`} className={`avatar avatar-${size}`} src={photo} />
    : <span aria-label={`Iniciais de ${name}`} className={`avatar avatar-${size} avatar-initials`}>{avatarInitials(name)}</span>;
}
