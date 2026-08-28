export const AVATAR_MAX_DIMENSION = 256;
export const AVATAR_MAX_BYTES = 200 * 1024;

export type Crop = { sx: number; sy: number; size: number };

export function coverCrop(width: number, height: number): Crop {
  if (width <= 0 || height <= 0) throw new Error("A imagem possui dimensões inválidas.");
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return [parts[0], parts.at(-1)]
    .filter((part, index, values) => part && (index === 0 || part !== values[0]))
    .map((part) => part?.[0]?.toUpperCase())
    .join("") || "?";
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível processar a foto.")), "image/webp", quality);
  });
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a foto processada."));
    reader.readAsDataURL(blob);
  });
}

export async function createAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");

  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const crop = coverCrop(image.width, image.height);
  const dimension = Math.min(crop.size, AVATAR_MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O processamento de imagem não está disponível.");

  context.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.size,
    crop.size,
    0,
    0,
    dimension,
    dimension,
  );
  image.close();

  let blob = await toBlob(canvas, 0.84);
  for (const quality of [0.7, 0.56, 0.42]) {
    if (blob.size <= AVATAR_MAX_BYTES) break;
    blob = await toBlob(canvas, quality);
  }
  if (blob.size > AVATAR_MAX_BYTES) throw new Error("A foto não pôde ser reduzida para 200 KB.");
  return toDataUrl(blob);
}
