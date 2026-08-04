import fs from "node:fs";

const pagePath = "src/app/(private)/disparos-whatsapp/page.tsx";
const cssPath = "src/app/(private)/disparos-whatsapp/disparos-whatsapp.module.css";

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`[SELECAO MASSA] Trecho ausente: ${label}`);
  return content.replace(search, replacement);
}

function replaceRegexRequired(content, regex, replacement, label) {
  if (!regex.test(content)) throw new Error(`[SELECAO MASSA] Trecho ausente: ${label}`);
  return content.replace(regex, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");
const originalPage = page;

if (!page.includes("CRM_BULK_CONTACT_SELECTION_V3")) {
  page = replaceRequired(
    page,
    `  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);\n\n  const [loadingUsuario, setLoadingUsuario] = useState(true);`,
    `  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);\n  // CRM_BULK_CONTACT_SELECTION_V3\n  const [quantidadeAdicionarContatos, setQuantidadeAdicionarContatos] = useState("");\n  const [quantidadeRemoverContatos, setQuantidadeRemoverContatos] = useState("");\n  const [adicionandoContatosEmMassa, setAdicionandoContatosEmMassa] = useState(false);\n\n  const [loadingUsuario, setLoadingUsuario] = useState(true);`,
    "estados"
  );

  page = replaceRequired(
    page,
    `  const filtrosServidorContatosAtivos = Boolean(\n    disparoAnteriorFiltroContatos ||\n      telefoneRevisarFiltro ||\n      mensagemDataInicioFiltro ||`,
    `  const filtrosServidorContatosAtivos = Boolean(\n    disparoAnteriorFiltroContatos ||\n      mensagemDataInicioFiltro ||`,
    "revisao local"
  );

  page = replaceRequired(
    page,
    `      if (\n        campanhaFiltro &&\n        obterCampanhaContato(contato) !== campanhaFiltro\n      ) {\n        return false;\n      }\n\n      return true;`,
    `      if (\n        campanhaFiltro &&\n        obterCampanhaContato(contato) !== campanhaFiltro\n      ) {\n        return false;\n      }\n\n      if (telefoneRevisarFiltro === "true" && contato.telefone_revisar !== true) return false;\n      if (telefoneRevisarFiltro === "false" && contato.telefone_revisar === true) return false;\n\n      return true;`,
    "filtro revisao"
  );

  page = replaceRequired(
    page,
    `      obterHistoricoDisparosDoContato,\n      origemFiltro,\n    ]`,
    `      obterHistoricoDisparosDoContato,\n      origemFiltro,\n      telefoneRevisarFiltro,\n    ]`,
    "dependencia revisao"
  );

  page = replaceRequired(
    page,
    `  const contatosSelecionadosFiltrados = useMemo(() => {\n    return contatosSelecionados.filter(contatoPassaFiltrosSelecionados);\n  }, [contatosSelecionados, contatoPassaFiltrosSelecionados]);\n\n  const gruposConflitoAtivos = useMemo(() => {`,
    `  const contatosSelecionadosFiltrados = useMemo(() => {\n    return contatosSelecionados.filter(contatoPassaFiltrosSelecionados);\n  }, [contatosSelecionados, contatoPassaFiltrosSelecionados]);\n\n  const totalContatosDisponiveisRestantes = useMemo(\n    () => Math.max(totalContatosDisponiveis - contatosSelecionadosFiltrados.length, 0),\n    [totalContatosDisponiveis, contatosSelecionadosFiltrados.length]\n  );\n\n  const gruposConflitoAtivos = useMemo(() => {`,
    "contador"
  );

  const bulkFunctions = `  function normalizarQuantidadeAcaoMassa(valor: string, maximo: number) {\n    const numero = Number.parseInt(String(valor || "").replace(/\\D/g, ""), 10);\n    if (!Number.isFinite(numero) || numero <= 0 || maximo <= 0) return 0;\n    return Math.min(numero, maximo);\n  }\n\n  function contatoElegivelParaAcaoMassa(contato: ContatoOpcao) {\n    return contatoTemTelefoneValido(contato) &&\n      !contatoTemOptOutParaCategoria(contato, categoriaTemplateSelecionado) &&\n      !(contatoTemCooldownMarketing(contato) && categoriaTemplateSelecionado !== "utility");\n  }\n\n  function montarParametrosContatosAcaoMassa(paginaAtual: number, limite: number) {\n    const params = new URLSearchParams();\n    if (buscaContato.trim()) params.set("busca", buscaContato.trim());\n    if (origemFiltro.trim()) params.set("origem", origemFiltro.trim());\n    if (campanhaFiltro.trim()) params.set("campanha", campanhaFiltro.trim());\n    if (disparoAnteriorFiltroContatos.trim()) params.set("disparo_anterior_id", disparoAnteriorFiltroContatos.trim());\n    if (telefoneRevisarFiltro === "true" || telefoneRevisarFiltro === "false") params.set("telefone_revisar", telefoneRevisarFiltro);\n    if (integracaoId) params.set("integracao_whatsapp_id", integracaoId);\n    if (integracaoId && somenteIntegracaoFiltro) params.set("filtrar_por_integracao", "true");\n    if (mensagemDataInicioFiltro) params.set("mensagem_data_inicio", mensagemDataInicioFiltro);\n    if (mensagemDataFimFiltro) params.set("mensagem_data_fim", mensagemDataFimFiltro);\n    if (ultimoAtendenteFiltro) params.set("ultimo_atendente_id", ultimoAtendenteFiltro);\n    if (integracaoId && optInFiltro) params.set("opt_in", optInFiltro);\n    if (integracaoId && optOutFiltro) params.set("opt_out", optOutFiltro);\n    params.set("pagina", String(paginaAtual));\n    params.set("limite", String(limite));\n    return params;\n  }\n\n  async function buscarContatosParaAdicionarEmMassa(quantidade: number) {\n    const idsSelecionados = new Set(contatosSelecionados.map((contato) => contato.id));\n    const encontrados = new Map<string, ContatoOpcao>();\n    const adicionar = (contato: ContatoOpcao) => {\n      if (!idsSelecionados.has(contato.id) && contatoElegivelParaAcaoMassa(contato)) encontrados.set(contato.id, contato);\n    };\n    contatosDisponiveisValidos.forEach(adicionar);\n    const limitePagina = 500;\n    const totalPaginas = Math.max(1, Math.ceil(totalContatosDisponiveis / limitePagina));\n    let paginaAtual = 1;\n    while (encontrados.size < quantidade && paginaAtual <= totalPaginas) {\n      const params = montarParametrosContatosAcaoMassa(paginaAtual, limitePagina);\n      const resposta = await fetch("/api/contatos?" + params.toString(), { cache: "no-store" });\n      const json = await resposta.json();\n      if (!resposta.ok) throw new Error(json.error || "Erro ao carregar contatos para a seleção em massa.");\n      const lista = Array.isArray(json.contatos) ? (json.contatos as ContatoOpcao[]) : [];\n      lista.forEach(adicionar);\n      if (lista.length < limitePagina) break;\n      paginaAtual += 1;\n    }\n    return Array.from(encontrados.values()).slice(0, quantidade);\n  }\n\n  async function adicionarTodosDisponiveis() {\n    const quantidade = normalizarQuantidadeAcaoMassa(quantidadeAdicionarContatos, totalContatosDisponiveisRestantes);\n    if (quantidade === 0) { setErro("Informe uma quantidade válida de contatos para adicionar."); return; }\n    try {\n      setAdicionandoContatosEmMassa(true); setErro(""); setMensagem("");\n      const novos = await buscarContatosParaAdicionarEmMassa(quantidade);\n      if (novos.length === 0) { setErro("Nenhum contato válido disponível para adicionar com os filtros atuais."); return; }\n      invalidarDecisoesConflitoParaContatos(novos.map((contato) => contato.id));\n      setContatos((atuais) => { const mapa = new Map(atuais.map((contato) => [contato.id, contato])); novos.forEach((contato) => mapa.set(contato.id, contato)); return Array.from(mapa.values()); });\n      setContatosSelecionados((atuais) => { const ids = new Set(atuais.map((contato) => contato.id)); return [...atuais, ...novos.filter((contato) => !ids.has(contato.id))]; });\n      setQuantidadeAdicionarContatos("");\n      setMensagem(novos.length === quantidade ? String(novos.length) + " contato(s) adicionado(s)." : String(novos.length) + " contato(s) válido(s) adicionado(s); não havia mais contatos elegíveis para completar a quantidade informada.");\n    } catch (error) {\n      setErro(error instanceof Error ? error.message : "Erro ao adicionar contatos em massa.");\n    } finally { setAdicionandoContatosEmMassa(false); }\n  }\n\n  function removerContato(contatoId: string) {`;

  page = replaceRegexRequired(
    page,
    /  function adicionarTodosDisponiveis\(\) \{[\s\S]*?\n  \}\n\n  function removerContato\(contatoId: string\) \{/,
    bulkFunctions,
    "adicionar todos"
  );

  page = replaceRequired(
    page,
    `  function removerContato(contatoId: string) {\n    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));\n  }\n\n  function limparSelecao() {`,
    `  function removerContato(contatoId: string) {\n    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));\n  }\n\n  function removerSelecionadosFiltrados() {\n    const quantidade = normalizarQuantidadeAcaoMassa(quantidadeRemoverContatos, contatosSelecionadosFiltrados.length);\n    if (quantidade === 0) { setErro("Informe uma quantidade válida de contatos para remover."); return; }\n    const removidos = contatosSelecionadosFiltrados.slice(0, quantidade);\n    const ids = new Set(removidos.map((contato) => contato.id));\n    setContatosSelecionados((atuais) => atuais.filter((contato) => !ids.has(contato.id)));\n    invalidarDecisoesConflitoParaContatos(Array.from(ids));\n    setQuantidadeRemoverContatos(""); setErro("");\n    setMensagem(String(removidos.length) + " contato(s) removido(s).");\n  }\n\n  function limparSelecao() {`,
    "remover filtrados"
  );

  page = page.replace(/\n\s*\{!telefoneValido \? \([\s\S]*?Sem telefone válido[\s\S]*?\) : null\}\n/, "\n");

  const availableHeader = `                      <div className={styles.contactsHeaderActions}>\n                        <input type="number" min={1} max={Math.max(totalContatosDisponiveisRestantes, 1)} inputMode="numeric" value={quantidadeAdicionarContatos} onChange={(event) => setQuantidadeAdicionarContatos(event.target.value.replace(/\\D/g, ""))} className={styles.bulkQuantityInput} placeholder="Qtd." aria-label="Quantidade de contatos para adicionar" />\n                        <button type="button" className={styles.TextButtonAdd} onClick={adicionarTodosDisponiveis} disabled={loadingContatos || adicionandoContatosEmMassa || totalContatosDisponiveisRestantes === 0 || normalizarQuantidadeAcaoMassa(quantidadeAdicionarContatos, totalContatosDisponiveisRestantes) === 0}>\n                          {adicionandoContatosEmMassa ? "Adicionando..." : "Add todos"}\n                        </button>\n                        <span className={styles.contactsCount}>{loadingContatos ? "..." : totalContatosDisponiveisRestantes}</span>\n                      </div>`;

  page = replaceRegexRequired(
    page,
    /                      <div className=\{styles\.contactsHeaderActions\}>[\s\S]*?className=\{styles\.TextButtonAdd\}[\s\S]*?<\/button>[\s\S]*?<span className=\{styles\.contactsCount\}>[\s\S]*?<\/span>\n                      <\/div>/,
    availableHeader,
    "cabecalho disponiveis"
  );

  const selectedHeader = `                      <div className={styles.contactsHeaderActions}>\n                        <input type="number" min={1} max={Math.max(contatosSelecionadosFiltrados.length, 1)} inputMode="numeric" value={quantidadeRemoverContatos} onChange={(event) => setQuantidadeRemoverContatos(event.target.value.replace(/\\D/g, ""))} className={styles.bulkQuantityInput} placeholder="Qtd." aria-label="Quantidade de contatos filtrados para remover" />\n                        <button type="button" className={styles.TextButtonRemover} onClick={removerSelecionadosFiltrados} disabled={contatosSelecionadosFiltrados.length === 0 || normalizarQuantidadeAcaoMassa(quantidadeRemoverContatos, contatosSelecionadosFiltrados.length) === 0}>\n                          Remover todos\n                        </button>\n                        <span className={styles.contactsCount}>`;

  page = replaceRegexRequired(
    page,
    /                      <div className=\{styles\.contactsHeaderActions\}>[\s\S]*?className=\{styles\.TextButtonRemover\}[\s\S]*?<\/button>\n\n                        <span className=\{styles\.contactsCount\}>/,
    selectedHeader,
    "cabecalho selecionados"
  );
}

if (page !== originalPage) fs.writeFileSync(pagePath, page, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes("CRM_BULK_CONTACT_SELECTION_INPUT_V3")) {
  css += `\n\n/* CRM_BULK_CONTACT_SELECTION_INPUT_V3 */\n.bulkQuantityInput { width: 68px; min-width: 68px; height: 32px; border: 1px solid var(--crm-border-strong); border-radius: 9px; background: var(--crm-surface); color: var(--crm-text-strong); padding: 0 8px; font-size: 12px; font-weight: 700; text-align: center; outline: none; }\n.bulkQuantityInput:focus { border-color: var(--crm-primary-strong); box-shadow: var(--crm-focus-ring); }\n.bulkQuantityInput::-webkit-inner-spin-button, .bulkQuantityInput::-webkit-outer-spin-button { margin: 0; }\n@media (max-width: 640px) { .bulkQuantityInput { width: 62px; min-width: 62px; } }\n`;
  fs.writeFileSync(cssPath, css, "utf8");
}

console.log("Selecao em massa e contadores dos disparos ajustados.");
