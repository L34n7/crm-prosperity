import fs from "node:fs";

const pagePath = "src/app/(private)/disparos-whatsapp/page.tsx";
const cssPath =
  "src/app/(private)/disparos-whatsapp/disparos-whatsapp.module.css";

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) {
    throw new Error(`[SELECAO MASSA] Trecho ausente: ${label}`);
  }
  return content.replace(search, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");
const originalPage = page;

if (!page.includes("CRM_BULK_CONTACT_SELECTION_V4")) {
  page = replaceRequired(
    page,
    `  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);\n\n  const [loadingUsuario, setLoadingUsuario] = useState(true);`,
    `  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);\n  // CRM_BULK_CONTACT_SELECTION_V4\n  const [quantidadeAdicionarContatos, setQuantidadeAdicionarContatos] = useState("");\n  const [quantidadeRemoverContatos, setQuantidadeRemoverContatos] = useState("");\n  const [adicionandoContatosEmMassa, setAdicionandoContatosEmMassa] = useState(false);\n\n  const [loadingUsuario, setLoadingUsuario] = useState(true);`,
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
    `  const contatosDisponiveis = useMemo(() => {\n    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));\n    return contatos.filter((item) => !idsSelecionados.has(item.id));\n  }, [contatos, contatosSelecionados]);`,
    `  const contatosDisponiveis = useMemo(() => contatos, [contatos]);`,
    "manter contatos disponiveis visiveis"
  );

  page = replaceRequired(
    page,
    `  const contatosSelecionadosFiltrados = useMemo(() => {\n    return contatosSelecionados.filter(contatoPassaFiltrosSelecionados);\n  }, [contatosSelecionados, contatoPassaFiltrosSelecionados]);\n\n  const gruposConflitoAtivos = useMemo(() => {`,
    `  const contatosSelecionadosFiltrados = useMemo(() => {\n    return contatosSelecionados.filter(contatoPassaFiltrosSelecionados);\n  }, [contatosSelecionados, contatoPassaFiltrosSelecionados]);\n\n  const idsContatosSelecionados = useMemo(\n    () => new Set(contatosSelecionados.map((contato) => contato.id)),\n    [contatosSelecionados]\n  );\n\n  const totalContatosDisponiveisRestantes = useMemo(\n    () =>\n      contatosDisponiveisValidos.filter(\n        (contato) => !idsContatosSelecionados.has(contato.id)\n      ).length,\n    [contatosDisponiveisValidos, idsContatosSelecionados]\n  );\n\n  const gruposConflitoAtivos = useMemo(() => {`,
    "contadores e ids selecionados"
  );

  const bulkFunctions = `  function normalizarQuantidadeAcaoMassa(valor: string, maximo = 0) {\n    const numero = Number.parseInt(String(valor || "").replace(/\\D/g, ""), 10);\n    if (!Number.isFinite(numero) || numero <= 0) return 0;\n    const inteiro = Math.floor(numero);\n    return maximo > 0 ? Math.min(inteiro, maximo) : inteiro;\n  }\n\n  function contatoElegivelParaAcaoMassa(contato: ContatoOpcao) {\n    return contatoTemTelefoneValido(contato) &&\n      !contatoTemOptOutParaCategoria(contato, categoriaTemplateSelecionado) &&\n      !(contatoTemCooldownMarketing(contato) && categoriaTemplateSelecionado !== "utility");\n  }\n\n  function montarParametrosContatosAcaoMassa(paginaAtual: number, limite: number) {\n    const params = new URLSearchParams();\n    if (buscaContato.trim()) params.set("busca", buscaContato.trim());\n    if (origemFiltro.trim()) params.set("origem", origemFiltro.trim());\n    if (campanhaFiltro.trim()) params.set("campanha", campanhaFiltro.trim());\n    if (disparoAnteriorFiltroContatos.trim()) params.set("disparo_anterior_id", disparoAnteriorFiltroContatos.trim());\n    if (telefoneRevisarFiltro === "true" || telefoneRevisarFiltro === "false") params.set("telefone_revisar", telefoneRevisarFiltro);\n    if (integracaoId) params.set("integracao_whatsapp_id", integracaoId);\n    if (integracaoId && somenteIntegracaoFiltro) params.set("filtrar_por_integracao", "true");\n    if (mensagemDataInicioFiltro) params.set("mensagem_data_inicio", mensagemDataInicioFiltro);\n    if (mensagemDataFimFiltro) params.set("mensagem_data_fim", mensagemDataFimFiltro);\n    if (ultimoAtendenteFiltro) params.set("ultimo_atendente_id", ultimoAtendenteFiltro);\n    if (integracaoId && optInFiltro) params.set("opt_in", optInFiltro);\n    if (integracaoId && optOutFiltro) params.set("opt_out", optOutFiltro);\n    params.set("pagina", String(paginaAtual));\n    params.set("limite", String(limite));\n    return params;\n  }\n\n  async function buscarContatosParaAdicionarEmMassa(quantidade: number) {\n    const idsSelecionados = new Set(contatosSelecionados.map((contato) => contato.id));\n    const encontrados = new Map<string, ContatoOpcao>();\n    const adicionar = (contato: ContatoOpcao) => {\n      if (!idsSelecionados.has(contato.id) && contatoElegivelParaAcaoMassa(contato)) {\n        encontrados.set(contato.id, contato);\n      }\n    };\n\n    contatosDisponiveisValidos.forEach(adicionar);\n\n    const limitePagina = 500;\n    const totalPaginas = Math.max(1, Math.ceil(totalContatosDisponiveis / limitePagina));\n    let paginaAtual = 1;\n\n    while (encontrados.size < quantidade && paginaAtual <= totalPaginas) {\n      const params = montarParametrosContatosAcaoMassa(paginaAtual, limitePagina);\n      const resposta = await fetch("/api/contatos?" + params.toString(), { cache: "no-store" });\n      const json = await resposta.json();\n\n      if (!resposta.ok) {\n        throw new Error(json.error || "Erro ao carregar contatos para a seleção em massa.");\n      }\n\n      const lista = Array.isArray(json.contatos)\n        ? (json.contatos as ContatoOpcao[])\n        : [];\n      lista.forEach(adicionar);\n\n      if (lista.length < limitePagina) break;\n      paginaAtual += 1;\n    }\n\n    return Array.from(encontrados.values()).slice(0, quantidade);\n  }\n\n  async function adicionarTodosDisponiveis() {\n    const quantidadeInformada = normalizarQuantidadeAcaoMassa(\n      quantidadeAdicionarContatos,\n      totalContatosDisponiveis\n    );\n    const quantidadeAlvo = quantidadeInformada > 0\n      ? quantidadeInformada\n      : Math.max(totalContatosDisponiveis, contatosDisponiveisValidos.length);\n\n    if (quantidadeAlvo <= 0 || totalContatosDisponiveisRestantes <= 0) {\n      setErro("Nenhum contato válido disponível para adicionar.");\n      return;\n    }\n\n    try {\n      setAdicionandoContatosEmMassa(true);\n      setErro("");\n      setMensagem("");\n\n      const novos = await buscarContatosParaAdicionarEmMassa(quantidadeAlvo);\n\n      if (novos.length === 0) {\n        setErro("Nenhum contato válido disponível para adicionar com os filtros atuais.");\n        return;\n      }\n\n      invalidarDecisoesConflitoParaContatos(novos.map((contato) => contato.id));\n      setContatos((atuais) => {\n        const mapa = new Map(atuais.map((contato) => [contato.id, contato]));\n        novos.forEach((contato) => mapa.set(contato.id, contato));\n        return Array.from(mapa.values());\n      });\n      setContatosSelecionados((atuais) => {\n        const ids = new Set(atuais.map((contato) => contato.id));\n        return [...atuais, ...novos.filter((contato) => !ids.has(contato.id))];\n      });\n      setQuantidadeAdicionarContatos("");\n      setMensagem(\n        quantidadeInformada > 0\n          ? String(novos.length) + " contato(s) adicionado(s)."\n          : "Todos os " + String(novos.length) + " contato(s) disponíveis foram adicionados."\n      );\n    } catch (error) {\n      setErro(\n        error instanceof Error\n          ? error.message\n          : "Erro ao adicionar contatos em massa."\n      );\n    } finally {\n      setAdicionandoContatosEmMassa(false);\n    }\n  }\n\n  function removerContato(contatoId: string) {`;

  page = page.replace(
    /  function adicionarTodosDisponiveis\(\) \{[\s\S]*?\n  \}\n\n  function removerContato\(contatoId: string\) \{/,
    bulkFunctions
  );

  if (!page.includes("function normalizarQuantidadeAcaoMassa")) {
    throw new Error("[SELECAO MASSA] Não foi possível aplicar as funções em massa.");
  }

  page = replaceRequired(
    page,
    `  function removerContato(contatoId: string) {\n    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));\n  }\n\n  function limparSelecao() {`,
    `  function removerContato(contatoId: string) {\n    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));\n  }\n\n  function removerSelecionadosFiltrados() {\n    const quantidadeInformada = normalizarQuantidadeAcaoMassa(\n      quantidadeRemoverContatos,\n      contatosSelecionadosFiltrados.length\n    );\n    const quantidade = quantidadeInformada > 0\n      ? quantidadeInformada\n      : contatosSelecionadosFiltrados.length;\n\n    if (quantidade <= 0) {\n      setErro("Nenhum contato selecionado para remover.");\n      return;\n    }\n\n    const removidos = contatosSelecionadosFiltrados.slice(0, quantidade);\n    const ids = new Set(removidos.map((contato) => contato.id));\n    setContatosSelecionados((atuais) =>\n      atuais.filter((contato) => !ids.has(contato.id))\n    );\n    invalidarDecisoesConflitoParaContatos(Array.from(ids));\n    setQuantidadeRemoverContatos("");\n    setErro("");\n    setMensagem(String(removidos.length) + " contato(s) removido(s).");\n  }\n\n  function limparSelecao() {`,
    "remover selecionados"
  );

  page = page.replace(
    /\n\s*\{!telefoneValido \? \([\s\S]*?Sem telefone válido[\s\S]*?\) : null\}\n/,
    "\n"
  );

  const availableHeaderOriginal = `                      <div className={styles.contactsHeaderActions}>\n                        <button\n                          type="button"\n                          className={styles.TextButtonAdd}\n                          onClick={adicionarTodosDisponiveis}\n                          disabled={\n                            loadingContatos ||\n                            contatosDisponiveisValidos.length === 0\n                          }\n                        >\n                          Add todos\n                        </button>\n\n                        <span className={styles.contactsCount}>\n                          {loadingContatos\n                            ? "..."\n                            : temFiltrosContatosAtivos\n                            ? \`\${contatosDisponiveisFiltrados.length}/\${totalContatosDisponiveis}\`\n                            : totalContatosDisponiveis}\n                        </span>\n                      </div>`;

  const availableHeader = `                      <div className={styles.contactsHeaderActions}>\n                        <input\n                          type="number"\n                          min={0}\n                          step={1}\n                          inputMode="numeric"\n                          value={quantidadeAdicionarContatos}\n                          onChange={(event) =>\n                            setQuantidadeAdicionarContatos(\n                              event.target.value.replace(/\\D/g, "")\n                            )\n                          }\n                          className={styles.bulkQuantityInput}\n                          placeholder="Qtd."\n                          title="Informe a quantidade. Com 0 ou vazio, adiciona todos os contatos disponíveis."\n                          aria-label="Quantidade de contatos para adicionar; zero ou vazio adiciona todos"\n                        />\n                        <button\n                          type="button"\n                          className={styles.TextButtonAdd}\n                          onClick={adicionarTodosDisponiveis}\n                          disabled={\n                            loadingContatos ||\n                            adicionandoContatosEmMassa ||\n                            totalContatosDisponiveisRestantes === 0\n                          }\n                        >\n                          {adicionandoContatosEmMassa ? "Adicionando..." : "Add todos"}\n                        </button>\n                        <span className={styles.contactsCount}>\n                          {loadingContatos\n                            ? "..."\n                            : temFiltrosContatosAtivos\n                            ? \`\${contatosDisponiveisFiltrados.length}/\${totalContatosDisponiveis}\`\n                            : totalContatosDisponiveis}\n                        </span>\n                      </div>`;

  page = replaceRequired(
    page,
    availableHeaderOriginal,
    availableHeader,
    "cabecalho disponiveis"
  );

  const selectedHeaderOriginal = `                      <div className={styles.contactsHeaderActions}>\n                        <button\n                          type="button"\n                          className={styles.TextButtonRemover}\n                          onClick={limparSelecao}\n                          disabled={contatosSelecionados.length === 0}\n                        >\n                          Remover todos\n                        </button>\n\n                        <span className={styles.contactsCount}>`;

  const selectedHeader = `                      <div className={styles.contactsHeaderActions}>\n                        <input\n                          type="number"\n                          min={0}\n                          step={1}\n                          inputMode="numeric"\n                          value={quantidadeRemoverContatos}\n                          onChange={(event) =>\n                            setQuantidadeRemoverContatos(\n                              event.target.value.replace(/\\D/g, "")\n                            )\n                          }\n                          className={styles.bulkQuantityInput}\n                          placeholder="Qtd."\n                          title="Informe a quantidade. Com 0 ou vazio, remove todos os contatos selecionados exibidos."\n                          aria-label="Quantidade de contatos para remover; zero ou vazio remove todos"\n                        />\n                        <button\n                          type="button"\n                          className={styles.TextButtonRemover}\n                          onClick={removerSelecionadosFiltrados}\n                          disabled={contatosSelecionadosFiltrados.length === 0}\n                        >\n                          Remover todos\n                        </button>\n\n                        <span className={styles.contactsCount}>`;

  page = replaceRequired(
    page,
    selectedHeaderOriginal,
    selectedHeader,
    "cabecalho selecionados"
  );
}

if (page !== originalPage) {
  fs.writeFileSync(pagePath, page, "utf8");
}

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes("CRM_BULK_CONTACT_SELECTION_INPUT_V4")) {
  css += `\n\n/* CRM_BULK_CONTACT_SELECTION_INPUT_V4 */\n.bulkQuantityInput { width: 74px; min-width: 74px; height: 32px; border: 1px solid var(--crm-border-strong); border-radius: 9px; background: var(--crm-surface); color: var(--crm-text-strong); padding: 0 8px; font-size: 12px; font-weight: 700; text-align: center; outline: none; }\n.bulkQuantityInput:focus { border-color: var(--crm-primary-strong); box-shadow: var(--crm-focus-ring); }\n.bulkQuantityInput::-webkit-inner-spin-button, .bulkQuantityInput::-webkit-outer-spin-button { margin: 0; }\n@media (max-width: 640px) { .bulkQuantityInput { width: 66px; min-width: 66px; } }\n`;
  fs.writeFileSync(cssPath, css, "utf8");
}

console.log(
  "Lista de disponíveis persistente e seleção por quantidade ajustadas."
);
