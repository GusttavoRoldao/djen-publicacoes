import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  AVATAR_MAX_BYTES,
  avatarInitials,
  coverCrop,
  createAvatar,
} from "../src/attorneys/avatar.ts";

const originalCreateImageBitmap = globalThis.createImageBitmap;
const originalDocument = globalThis.document;
const originalFileReader = globalThis.FileReader;

afterEach(() => {
  Object.assign(globalThis, {
    createImageBitmap: originalCreateImageBitmap,
    document: originalDocument,
    FileReader: originalFileReader,
  });
});

describe("avatar", () => {
  it("calcula recorte quadrado central", () => {
    assert.deepEqual(coverCrop(1200, 800), { sx: 200, sy: 0, size: 800 });
    assert.deepEqual(coverCrop(600, 900), { sx: 0, sy: 150, size: 600 });
  });

  it("usa iniciais quando não há foto", () => {
    assert.equal(avatarInitials("Maria de Almeida"), "MA");
    assert.equal(avatarInitials("Ana"), "A");
  });

  it("recorta e comprime uma imagem grande dentro dos limites", async () => {
    const emittedSizes: number[] = [];
    const drawArguments: unknown[][] = [];
    let closed = false;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...arguments_: unknown[]) => drawArguments.push(arguments_) }),
      toBlob: (callback: BlobCallback, _type?: string, quality = 1) => {
        const blob = new Blob([new Uint8Array(Math.round(quality * 400_000))], { type: "image/webp" });
        emittedSizes.push(blob.size);
        callback(blob);
      },
    };

    Object.assign(globalThis, {
      createImageBitmap: async () => ({ width: 4000, height: 2000, close: () => { closed = true; } }),
      document: { createElement: () => canvas },
      FileReader: class {
        result: string | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(blob: Blob) {
          this.result = `data:${blob.type};base64,AA==`;
          this.onload?.();
        }
      },
    });

    const result = await createAvatar(new File([new Uint8Array(1)], "foto.png", { type: "image/png" }));

    assert.equal(canvas.width, 256);
    assert.equal(canvas.height, 256);
    assert.deepEqual(drawArguments[0]?.slice(1), [1000, 0, 2000, 2000, 0, 0, 256, 256]);
    assert.ok(emittedSizes.at(-1)! <= AVATAR_MAX_BYTES);
    assert.equal(result, "data:image/webp;base64,AA==");
    assert.equal(closed, true);
  });
});
