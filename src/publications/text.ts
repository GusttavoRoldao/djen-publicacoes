/**
 * Parte dos tribunais devolve o campo de texto do DJEN em HTML.
 * O texto recebido é sempre preservado; estas funções apenas produzem uma leitura legível dele.
 * A marcação nunca é inserida no DOM: as tags são removidas antes de qualquer exibição.
 */

/** Acentos combinantes, aplicados à letra da entidade e recompostos com NFC. */
const COMBINING: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
  cedil: "̧",
  ring: "̊",
};

const NAMED: Record<string, string> = {
  nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
  ordm: "º", ordf: "ª", deg: "°", middot: "·", bull: "•", sect: "§", para: "¶",
  hellip: "…", mdash: "—", ndash: "–", minus: "−", shy: "",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", cent: "¢",
  frac12: "½", frac14: "¼", frac34: "¾", sup1: "¹", sup2: "²", sup3: "³",
  oslash: "ø", szlig: "ß", eth: "ð", thorn: "þ", iexcl: "¡", iquest: "¿",
  // Diacríticos soltos, sem letra antes. Não colidem com `COMBINABLE`, que exige letra + acento.
  acute: "´", grave: "`", circ: "ˆ", tilde: "˜", uml: "¨", cedil: "¸", ring: "˚", macr: "¯",
};

const ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g;
const COMBINABLE = /^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil|ring)$/;

const COMMENT = /<!--[\s\S]*?-->/g;
const DOCTYPE = /<![a-zA-Z][^>]*>/g;
const HIDDEN_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
const CELL_END = /<\/(?:td|th)\s*>/gi;
const BLOCK_END = /<\/(?:p|div|section|article|header|footer|tr|li|ul|ol|h[1-6]|table|blockquote|pre)\s*>/gi;
/**
 * Só remove o que tem forma de tag: nome válido seguido de espaço, `/` ou `>`.
 * Os tribunais escrevem endereços entre sinais de menor e maior, como `<https://www.stf.jus.br>`,
 * e um padrão mais frouxo apagaria esse texto junto com a marcação.
 */
const ANY_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?::[a-zA-Z][a-zA-Z0-9]*)?(?:\s[^>]*)?\/?>/g;

function safeCodePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeEntities(value: string): string {
  return value.replace(ENTITY, (full: string, decimal?: string, hexadecimal?: string, name?: string) => {
    if (decimal !== undefined) return safeCodePoint(Number.parseInt(decimal, 10), full);
    if (hexadecimal !== undefined) return safeCodePoint(Number.parseInt(hexadecimal, 16), full);
    if (name === undefined) return full;

    const combinable = COMBINABLE.exec(name);
    const letter = combinable?.[1];
    const mark = combinable ? COMBINING[combinable[2] ?? ""] : undefined;
    if (letter && mark) return (letter + mark).normalize("NFC");
    return NAMED[name] ?? NAMED[name.toLowerCase()] ?? full;
  });
}

/** Converte o texto recebido da fonte em leitura corrida, sem resumir nem reordenar o conteúdo. */
export function toReadableText(raw: string): string {
  const withoutTags = raw
    .replace(COMMENT, " ")
    .replace(HIDDEN_BLOCK, " ")
    .replace(DOCTYPE, " ")
    .replace(LINE_BREAK, "\n")
    .replace(CELL_END, " ")
    .replace(BLOCK_END, "\n")
    .replace(ANY_TAG, "");

  return decodeEntities(withoutTags)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Recorta o começo do texto em uma linha, cortando na última palavra inteira. */
export function excerptOf(text: string, length: number): { excerpt: string; truncated: boolean } {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= length) return { excerpt: single, truncated: false };

  const cut = single.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  const excerpt = lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { excerpt: excerpt.trimEnd(), truncated: true };
}
