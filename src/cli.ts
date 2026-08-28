import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DjenClient } from "./djen/client.ts";
import type { DjenSearch } from "./djen/types.ts";

function argumentsByName(args: string[]): Map<string, string> {
  return new Map(args.map((argument) => {
    const [name, ...value] = argument.replace(/^--/, "").split("=");
    return [name ?? "", value.join("=")];
  }));
}

function required(args: Map<string, string>, name: string): string {
  const value = args.get(name);
  if (!value) throw new Error(`Informe --${name}=valor.`);
  return value;
}

async function main(): Promise<void> {
  const args = argumentsByName(process.argv.slice(2));
  const search: DjenSearch = {
    oab: required(args, "oab"),
    uf: required(args, "uf"),
    startDate: required(args, "inicio"),
    endDate: required(args, "fim"),
    tribunal: args.get("tribunal") || undefined,
  };
  const client = new DjenClient({ baseUrl: args.get("base-url") || undefined });
  const result = await client.search(search, {
    onProgress: ({ page, fetched, total }) => {
      process.stderr.write(`Página ${page}: ${fetched} de ${total}\n`);
    },
  });
  const json = JSON.stringify({ search, ...result }, null, 2);
  const output = args.get("output");

  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, json, "utf8");
  }
  else process.stdout.write(`${json}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Erro inesperado."}\n`);
  process.exitCode = 1;
});
