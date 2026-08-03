import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_DISPAROS_PROGRAMADOS_DESC_V2";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function localizarChamadasSort(source) {
  const calls = [];
  let index = 0;

  while ((index = source.indexOf(".sort(", index)) !== -1) {
    let cursor = index + ".sort(".length;
    let depth = 1;
    let quote = null;
    let escaped = false;

    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === quote) quote = null;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }

      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;

      if (depth === 0) {
        calls.push({
          start: index,
          end: cursor + 1,
          snippet: source.slice(index, cursor + 1),
        });
        index = cursor + 1;
        break;
      }
    }

    if (depth !== 0) break;
  }

  return calls;
}

const apiPath = "src/app/api/disparos-agendados/route.ts";
let api = read(apiPath);

api = api.replaceAll(
  '.order("created_at", { ascending: false })',
  '.order("executar_em", { ascending: false })'
);

if (!api.includes(marker)) {
  const returnAnchor = "    return NextResponse.json({ ok: true, disparos });";
  if (!api.includes(returnAnchor)) {
    throw new Error(
      "Não foi possível localizar o retorno da API de disparos agendados."
    );
  }

  api = api.replace(
    returnAnchor,
    `    // ${marker}\n    disparos.sort((a: any, b: any) => {\n      const dataB = new Date(b.executar_em || b.created_at || 0).getTime();\n      const dataA = new Date(a.executar_em || a.created_at || 0).getTime();\n      return dataB - dataA;\n    });\n\n${returnAnchor}`
  );
}

write(apiPath, api);

const pagePath = "src/app/(private)/disparos-agendados/page.tsx";
let page = read(pagePath);

if (!page.includes(marker)) {
  const anchor = "const ITENS_POR_PAGINA = 20;";
  if (!page.includes(anchor)) {
    throw new Error(
      "Não foi possível localizar a configuração de paginação dos disparos agendados."
    );
  }

  const helper = `${anchor}\n\n// ${marker}\nfunction obterDataCampoRecenteDisparo(\n  valor: any,\n  campo: string,\n  profundidade = 0\n): number {\n  if (valor == null || profundidade > 6) return 0;\n\n  if (Array.isArray(valor)) {\n    return valor.reduce(\n      (maior, item) =>\n        Math.max(\n          maior,\n          obterDataCampoRecenteDisparo(item, campo, profundidade + 1)\n        ),\n      0\n    );\n  }\n\n  if (typeof valor !== \"object\") return 0;\n\n  let maior = 0;\n  for (const [chave, item] of Object.entries(valor)) {\n    if (chave === campo && typeof item === \"string\") {\n      const timestamp = new Date(item).getTime();\n      if (Number.isFinite(timestamp)) maior = Math.max(maior, timestamp);\n      continue;\n    }\n\n    if (item && typeof item === \"object\") {\n      maior = Math.max(\n        maior,\n        obterDataCampoRecenteDisparo(item, campo, profundidade + 1)\n      );\n    }\n  }\n\n  return maior;\n}\n\nfunction obterDataProgramadaDisparo(valor: any): number {\n  return (\n    obterDataCampoRecenteDisparo(valor, \"executar_em\") ||\n    obterDataCampoRecenteDisparo(valor, \"created_at\")\n  );\n}\n\nfunction compararDisparosAgendados(a: any, b: any): number {\n  const aCancelado = String(a?.status || \"\").toLowerCase() === \"cancelado\";\n  const bCancelado = String(b?.status || \"\").toLowerCase() === \"cancelado\";\n\n  if (aCancelado !== bCancelado) {\n    return aCancelado ? 1 : -1;\n  }\n\n  return obterDataProgramadaDisparo(b) - obterDataProgramadaDisparo(a);\n}`;

  page = page.replace(anchor, helper);
}

const calls = localizarChamadasSort(page);
const candidates = calls.filter(({ snippet }) => {
  if (
    snippet.includes("obterDataProgramadaDisparo") ||
    snippet.includes("compararDisparosAgendados")
  ) {
    return false;
  }
  const normalized = snippet.toLowerCase();
  return [
    "executar_em",
    "proxima_execucao",
    "proximaexecucao",
    "pendentes",
    "dataordenacao",
    "data_ordenacao",
    "grupo.resumo",
    "resumo.pendente",
  ].some((term) => normalized.includes(term));
});

for (const call of [...candidates].sort((a, b) => b.start - a.start)) {
  page =
    page.slice(0, call.start) +
    ".sort(compararDisparosAgendados)" +
    page.slice(call.end);
}

write(pagePath, page);

console.log(
  `Disparos agendados ordenados pela data programada, com cancelados no final dos grupos. Comparadores ajustados: ${candidates.length}.`
);
