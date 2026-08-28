import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O Tauri nomeia o instalador com versão e arquitetura.
 * A distribuição usa o nome DJENPublicacoes-Setup.exe, então ele é copiado com esse nome
 * para `release/`, junto do arquivo de verificação SHA-256.
 */
const NSIS_DIRECTORY = join("src-tauri", "target", "release", "bundle", "nsis");
const OUTPUT_DIRECTORY = "release";
const OUTPUT_NAME = "DJENPublicacoes-Setup.exe";

const candidates = readdirSync(NSIS_DIRECTORY).filter((name) => name.endsWith("-setup.exe"));
if (candidates.length === 0) {
  console.error(`Nenhum instalador encontrado em ${NSIS_DIRECTORY}. Rode "npm run build:desktop" antes.`);
  process.exit(1);
}

const newest = candidates
  .map((name) => ({ name, at: statSync(join(NSIS_DIRECTORY, name)).mtimeMs }))
  .sort((left, right) => right.at - left.at)[0].name;

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
const target = join(OUTPUT_DIRECTORY, OUTPUT_NAME);
copyFileSync(join(NSIS_DIRECTORY, newest), target);

const bytes = readFileSync(target);
const digest = createHash("sha256").update(bytes).digest("hex");
const version = JSON.parse(readFileSync(join("src-tauri", "tauri.conf.json"), "utf8")).version;

console.log(`origem:    ${join(NSIS_DIRECTORY, newest)}`);
console.log(`instalador: ${target}`);
console.log(`versão:    ${version}`);
console.log(`tamanho:   ${(bytes.length / (1024 * 1024)).toFixed(1)} MB`);
console.log(`SHA-256:   ${digest}`);
