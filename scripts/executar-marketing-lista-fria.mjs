import { readFile, writeFile } from "node:fs/promises";

const patchUrl = new URL("./aplicar-marketing-lista-fria.mjs", import.meta.url);
let source = await readFile(patchUrl, "utf8");

const oldBlock = `  source = replaceAllRequired(
    source,
    \`              utilityComListaFria &&
              confirmacaoResponsabilidadeListaFria\`,
    \`              templateComListaFria &&
              confirmacaoResponsabilidadeListaFria\`,
    "envio da confirmação ao backend",
    2
  );`;

const newBlock = `  source = replaceAllRequired(
    source,
    \`utilityComListaFria &&
\`,
    \`templateComListaFria &&
\`,
    "envio da confirmação ao backend",
    2
  );`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  await writeFile(patchUrl, source, "utf8");
}

await import(`${patchUrl.href}?corrigido=1`);
