import fs from "node:fs";

const paginaPath = "src/app/(private)/disparos-whatsapp/page.tsx";
const conflitosPath = "src/app/api/whatsapp/disparos/conflitos/route.ts";

function substituirRegexObrigatorio(conteudo, regex, novo, descricao) {
  if (conteudo.includes(novo)) return conteudo;
  if (!regex.test(conteudo)) {
    throw new Error(`[DISPAROS CONTATOS] Trecho nao encontrado: ${descricao}`);
  }
  return conteudo.replace(regex, novo);
}

let pagina = fs.readFileSync(paginaPath, "utf8");
const paginaOriginal = pagina;

if (!pagina.includes("CRM_AVAILABLE_COUNTER_SELECTED_V5")) {
  pagina = substituirRegexObrigatorio(
    pagina,
    /  const totalContatosDisponiveisRestantes = useMemo\([\s\S]*?\n  \);\n\n  const gruposConflitoAtivos/,
    `  // CRM_AVAILABLE_COUNTER_SELECTED_V5\n  const totalContatosDisponiveisRestantes = useMemo(\n    () =>\n      Math.max(\n        totalContatosDisponiveis - contatosSelecionadosFiltrados.length,\n        0\n      ),\n    [totalContatosDisponiveis, contatosSelecionadosFiltrados.length]\n  );\n\n  const gruposConflitoAtivos`,
    "contador de contatos disponiveis"
  );

  pagina = substituirRegexObrigatorio(
    pagina,
    /\{loadingContatos\n\s*\? "\.\.\."\n\s*: temFiltrosContatosAtivos\n\s*\? `\$\{contatosDisponiveisFiltrados\.length\}\/\$\{totalContatosDisponiveis\}`\n\s*: totalContatosDisponiveis\}/,
    `{loadingContatos ? "..." : totalContatosDisponiveisRestantes}`,
    "valor exibido no contador de disponiveis"
  );
}

if (!pagina.includes("CRM_HISTORICO_ORDEM_DECRESCENTE_V2")) {
  pagina = substituirRegexObrigatorio(
    pagina,
    /function nomeCampanhaHistorico\(/,
    `// CRM_HISTORICO_ORDEM_DECRESCENTE_V2\nfunction timestampHistoricoDisparo(item: ResultadoDisparo) {\n  const timestamp = Date.parse(String(item.created_at || ""));\n  return Number.isFinite(timestamp) ? timestamp : 0;\n}\n\nfunction ordenarHistoricoPorDataHoraDecrescente(\n  itens: ResultadoDisparo[]\n) {\n  return [...itens].sort((a, b) => {\n    const diferencaData =\n      timestampHistoricoDisparo(b) - timestampHistoricoDisparo(a);\n\n    if (diferencaData !== 0) return diferencaData;\n\n    return String(b.id || "").localeCompare(\n      String(a.id || ""),\n      "pt-BR"\n    );\n  });\n}\n\nfunction nomeCampanhaHistorico(`,
    "ordenacao decrescente do historico"
  );

  const chaveCacheAnterior =
    'const HISTORICO_CACHE_STORAGE_KEY = "crm:disparos:historico-cache:v1";';
  const chaveCacheNova =
    'const HISTORICO_CACHE_STORAGE_KEY = "crm:disparos:historico-cache:v2";';

  if (!pagina.includes(chaveCacheNova)) {
    if (!pagina.includes(chaveCacheAnterior)) {
      throw new Error(
        "[DISPAROS CONTATOS] Trecho nao encontrado: invalidacao do cache antigo do historico"
      );
    }
    pagina = pagina.replace(chaveCacheAnterior, chaveCacheNova);
  }

  pagina = substituirRegexObrigatorio(
    pagina,
    /setResultado\(paginaCache\.resultados\);/,
    `setResultado(\n          ordenarHistoricoPorDataHoraDecrescente(paginaCache.resultados)\n        );`,
    "ordenacao do historico restaurado do cache"
  );

  pagina = substituirRegexObrigatorio(
    pagina,
    /setResultado\(resultadosPagina\);/,
    `setResultado(\n          ordenarHistoricoPorDataHoraDecrescente(resultadosPagina)\n        );`,
    "ordenacao do historico retornado pela API"
  );
}

if (pagina !== paginaOriginal) {
  fs.writeFileSync(paginaPath, pagina, "utf8");
}

let conflitos = fs.readFileSync(conflitosPath, "utf8");
const conflitosOriginal = conflitos;

if (!conflitos.includes("CRM_DISPARO_CONFLITOS_RPC_V1")) {
  conflitos = substituirRegexObrigatorio(
    conflitos,
    /    const \{ data, error \} = await supabaseAdmin[\s\S]*?    if \(error\) \{[\s\S]*?    \}\n\n    const campanhasMap/,
    `    // CRM_DISPARO_CONFLITOS_RPC_V1\n    const { data: dadosConflitos, error } = await supabaseAdmin.rpc(\n      "listar_conflitos_disparos_contatos",\n      {\n        p_empresa_id: usuario.empresa_id,\n        p_telefones: telefonesSelecionados,\n        p_desde: desde,\n        p_limite: 5000,\n      }\n    );\n\n    if (error) {\n      return NextResponse.json(\n        {\n          ok: false,\n          error: \`Erro ao verificar contatos repetidos: \${error.message}\`,\n        },\n        { status: 500 }\n      );\n    }\n\n    const data: ItemDisparoRecente[] = (\n      Array.isArray(dadosConflitos) ? dadosConflitos : []\n    ).map((item: any) => ({\n      id: String(item.id || ""),\n      contato_id: item.contato_id ? String(item.contato_id) : null,\n      telefone_normalizado: item.telefone_normalizado\n        ? String(item.telefone_normalizado)\n        : null,\n      campanha_id: item.campanha_id ? String(item.campanha_id) : null,\n      created_at: item.created_at ? String(item.created_at) : null,\n      processed_at: item.processed_at ? String(item.processed_at) : null,\n      campanha: {\n        id: item.campanha_id ? String(item.campanha_id) : null,\n        nome: item.campanha_nome ? String(item.campanha_nome) : null,\n        template_nome: item.campanha_template_nome\n          ? String(item.campanha_template_nome)\n          : null,\n        total_itens: Number(item.campanha_total_itens || 0),\n        created_at: item.campanha_created_at\n          ? String(item.campanha_created_at)\n          : null,\n      },\n    }));\n\n    const campanhasMap`,
    "consulta de contatos repetidos"
  );
}

if (conflitos !== conflitosOriginal) {
  fs.writeFileSync(conflitosPath, conflitos, "utf8");
}

console.log(
  "Contador, conflitos, disparo anterior e ordem do historico ajustados."
);
