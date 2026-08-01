import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, current, replacement, description) {
  if (content.includes(replacement)) return content;
  if (!content.includes(current)) {
    throw new Error(`Não foi possível aplicar: ${description}.`);
  }
  return content.replace(current, replacement);
}

function patchRuntimeStatus() {
  const relativePath = "src/app/(private)/agendas/AgendaAutomationRuntimeStatus.tsx";
  let content = read(relativePath);

  const singleColumnRule =
    ".agendaAutomationGrid{grid-template-columns:minmax(0,1fr)!important}.agendaAutomationCard{min-width:0!important}";

  if (!content.includes(singleColumnRule)) {
    content = content.replace(
      "@media(max-width:760px)",
      `${singleColumnRule}\n@media(max-width:760px)`
    );
  }

  if (!content.includes("CRM_CALENDAR_TERMINOLOGY_V1")) {
    const terminologyCode = `
const CRM_CALENDAR_TERMINOLOGY_V1 = true;
const CALENDAR_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\bNova agenda\\b/g, "Novo calendário"],
  [/\\bnova agenda\\b/g, "novo calendário"],
  [/\\bConfigurar agenda\\b/g, "Configurar calendário"],
  [/\\bconfigurar agenda\\b/g, "configurar calendário"],
  [/\\bCriar agenda\\b/g, "Criar calendário"],
  [/\\bcriar agenda\\b/g, "criar calendário"],
  [/\\bEditar agenda\\b/g, "Editar calendário"],
  [/\\beditar agenda\\b/g, "editar calendário"],
  [/\\bAgenda arquivada\\b/g, "Calendário arquivado"],
  [/\\bagenda arquivada\\b/g, "calendário arquivado"],
  [/\\bAgenda selecionada\\b/g, "Calendário selecionado"],
  [/\\bagenda selecionada\\b/g, "calendário selecionado"],
  [/\\bAgenda ativa\\b/g, "Calendário ativo"],
  [/\\bagenda ativa\\b/g, "calendário ativo"],
  [/\\bAgenda fixa\\b/g, "Calendário fixo"],
  [/\\bagenda fixa\\b/g, "calendário fixo"],
  [/\\bAgenda vinculada\\b/g, "Calendário vinculado"],
  [/\\bagenda vinculada\\b/g, "calendário vinculado"],
  [/\\bEsta agenda\\b/g, "Este calendário"],
  [/\\besta agenda\\b/g, "este calendário"],
  [/\\bUma agenda\\b/g, "Um calendário"],
  [/\\buma agenda\\b/g, "um calendário"],
  [/\\bDa agenda\\b/g, "Do calendário"],
  [/\\bda agenda\\b/g, "do calendário"],
  [/\\bNa agenda\\b/g, "No calendário"],
  [/\\bna agenda\\b/g, "no calendário"],
  [/\\bÀ agenda\\b/g, "Ao calendário"],
  [/\\bà agenda\\b/g, "ao calendário"],
  [/\\bPela agenda\\b/g, "Pelo calendário"],
  [/\\bpela agenda\\b/g, "pelo calendário"],
  [/\\bA agenda\\b/g, "O calendário"],
  [/\\ba agenda\\b/g, "o calendário"],
  [/\\bAgendas\\b/g, "Calendários"],
  [/\\bagendas\\b/g, "calendários"],
  [/\\bAgenda\\b/g, "Calendário"],
  [/\\bagenda\\b/g, "calendário"],
];

function replaceAgendaWithCalendar(value: string) {
  return CALENDAR_TEXT_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  );
}

function updateCalendarAttributes(element: HTMLElement) {
  for (const attribute of ["aria-label", "title", "placeholder"]) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) element.setAttribute(attribute, next);
  }
}

function applyCalendarTerminology(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const textNode = root as Text;
    const current = textNode.nodeValue || "";
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) textNode.nodeValue = next;
    return;
  }

  if (!(root instanceof HTMLElement)) return;
  updateCalendarAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const current = textNode.nodeValue || "";
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) textNode.nodeValue = next;
    node = walker.nextNode();
  }

  root
    .querySelectorAll<HTMLElement>("[aria-label],[title],[placeholder]")
    .forEach(updateCalendarAttributes);
}
`;

    content = content.replace(
      "export default function AgendaAutomationRuntimeStatus() {",
      `${terminologyCode}\nexport default function AgendaAutomationRuntimeStatus() {`
    );
  }

  if (!content.includes("applyCalendarTerminology(document.body);")) {
    content = content.replace(
      'document.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach(applyRuntimeStatus);',
      'document.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach(applyRuntimeStatus);\n    applyCalendarTerminology(document.body);'
    );
  }

  const oldObserver = /const observer = new MutationObserver\(\(mutations\) => \{\s*for \(const mutation of mutations\) mutation\.addedNodes\.forEach\(applyFromAddedNode\);\s*\}\);/;
  if (oldObserver.test(content)) {
    content = content.replace(
      oldObserver,
      `const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          applyFromAddedNode(node);
          applyCalendarTerminology(node);
        });
      }
    });`
    );
  }

  write(relativePath, content);
  console.log("Terminologia de calendário e cards em coluna única aplicados.");
}

function patchTemplatePreview() {
  const relativePath = "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
  let content = read(relativePath);

  const oldCss = `.agendaTemplatePreview{padding:11px;border:1px solid var(--crm-border);border-radius:12px;background:var(--crm-surface)}.agendaTemplatePreview span{display:block;margin-bottom:6px;color:var(--crm-text-muted);font-size:9px;font-weight:900;text-transform:uppercase}.agendaTemplatePreview pre{margin:0;color:var(--crm-text);font:inherit;font-size:10.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}`;
  const newCss = `.agendaTemplatePreview{padding:0;border:1px solid var(--crm-border);border-radius:18px;background:var(--crm-surface);overflow:hidden}.agendaTemplatePreviewHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--crm-border);background:var(--crm-surface-soft)}.agendaTemplatePreviewHeader span{color:var(--crm-text-strong);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.agendaTemplatePreviewHeader small{color:var(--crm-text-muted);font-size:9px;font-weight:700}.agendaTemplatePreviewArea{padding:16px;background:radial-gradient(circle at 20% 20%,var(--crm-ui-private-surface-rgb-15-23-42-0-04) 0 2px,transparent 2px),var(--crm-ui-private-surface-hex-efe7dd);background-size:18px 18px}.agendaTemplatePreviewBubble{width:min(100%,420px);position:relative;padding:12px 12px 8px;border-radius:0 14px 14px 14px;background:var(--crm-surface);box-shadow:0 8px 22px var(--crm-ui-private-shadow-rgb-15-23-42-0-12)}.agendaTemplatePreviewBubble:before{content:\"\";position:absolute;top:0;left:-9px;border-top:9px solid var(--crm-surface);border-left:9px solid transparent}.agendaTemplatePreviewBubble pre{margin:0;color:var(--crm-text-strong);font:inherit;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.agendaTemplatePreviewMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:var(--crm-text-muted);font-size:8.5px}.agendaTemplatePreviewMeta span{font-weight:700}.agendaTemplatePreviewMeta time{white-space:nowrap;font-weight:800}`;

  if (!content.includes("agendaTemplatePreviewArea")) {
    if (!content.includes(oldCss)) {
      throw new Error("Não foi possível localizar o CSS antigo da prévia da agenda.");
    }
    content = content.replace(oldCss, newCss);
  }

  const oldMarkup = '<div class="agendaTemplatePreview"><span>Prévia com dados de exemplo</span><pre></pre></div>';
  const newMarkup = '<div class="agendaTemplatePreview"><div class="agendaTemplatePreviewHeader"><span>Prévia da mensagem</span><small>Dados de exemplo</small></div><div class="agendaTemplatePreviewArea"><div class="agendaTemplatePreviewBubble"><pre></pre><div class="agendaTemplatePreviewMeta"><span>Automação do calendário</span><time>14:30 ✓✓</time></div></div></div></div>';

  if (!content.includes('class="agendaTemplatePreviewArea"')) {
    if (!content.includes(oldMarkup)) {
      throw new Error("Não foi possível localizar a estrutura antiga da prévia da agenda.");
    }
    content = content.replace(oldMarkup, newMarkup);
  }

  write(relativePath, content);
  console.log("Prévia da automação alinhada ao designer da tela de disparos.");
}

function patchCalendarEnhancers() {
  const automationPath =
    "src/app/(private)/agendas/AgendaAutomationEnhancer.tsx";
  let automation = read(automationPath);
  automation = replaceRequired(
    automation,
    'const isEdit = normalizedTitle.includes("configurar agenda");\n      const isNew = normalizedTitle.includes("nova agenda");',
    'const isEdit =\n        normalizedTitle.includes("configurar agenda") ||\n        normalizedTitle.includes("configurar calendario");\n      const isNew =\n        normalizedTitle.includes("nova agenda") ||\n        normalizedTitle.includes("novo calendario");',
    "reconhecimento do modal de automação do calendário"
  );
  write(automationPath, automation);

  const googlePath =
    "src/app/(private)/agendas/AgendaGoogleAgendaBindingFix.tsx";
  let google = read(googlePath);
  google = replaceRequired(
    google,
    '      const modal = shell.querySelector<HTMLElement>(".a2 .modalbg .modal");\n      if (!modal || !text(modal.querySelector(".dhead h2")).includes("Configurar agenda")) return;',
    '      const modal = shell.querySelector<HTMLElement>(".a2 .modalbg .modal");\n      if (!modal) return;\n      const modalTitle = normalize(text(modal.querySelector(".dhead h2")));\n      if (\n        !modalTitle.includes("configurar agenda") &&\n        !modalTitle.includes("configurar calendario")\n      ) return;',
    "reconhecimento do modal de vínculo com o Google Calendar"
  );
  write(googlePath, google);

  const legacyPath =
    "src/app/(private)/agendas/AgendaEnhancerLegacy.tsx";
  let legacy = read(legacyPath);
  legacy = replaceRequired(
    legacy,
    '      const newCalendar = buttons.find(\n        (button) => normalized(text(button)) === "nova agenda"\n      );',
    '      const newCalendar = buttons.find((button) => {\n        const label = normalized(text(button));\n        return label === "nova agenda" || label === "novo calendario";\n      });',
    "posicionamento do botão Novo calendário"
  );
  write(legacyPath, legacy);

  console.log(
    "Enhancers ajustados para reconhecer agenda e calendário sem depender da ordem de renderização."
  );
}

function replaceDatabaseTableReferences(directory) {
  let changedFiles = 0;
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

  function walk(currentDirectory) {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!extensions.has(path.extname(entry.name))) continue;

      const current = fs.readFileSync(absolutePath, "utf8");
      const next = current.replace(/(["'])agenda_calendarios\1/g, (_match, quote) => {
        return `${quote}calendarios${quote}`;
      });
      if (next === current) continue;
      fs.writeFileSync(absolutePath, next, "utf8");
      changedFiles += 1;
    }
  }

  walk(path.join(root, directory));
  console.log(`Referências da tabela atualizadas em ${changedFiles} arquivo(s).`);
}

function patchSystemCalendarFlows() {
  const enginePath = "src/lib/automacoes/process-automation-engine.ts";
  let engine = read(enginePath);

  if (!engine.includes("CRM_SYSTEM_CALENDAR_FLOW_CONTEXT_V1")) {
    engine = replaceRequired(
      engine,
      `function valoresAgendamentoAgenda(agendamento: any, agenda: any | null) {
  const labels = formatarSlotAgenda(`,
      `function valoresAgendamentoAgenda(agendamento: any, agenda: any | null) {
  // CRM_SYSTEM_CALENDAR_FLOW_CONTEXT_V1
  const labels = formatarSlotAgenda(`,
      "marcador do contexto automático dos fluxos de calendário"
    );

    engine = replaceRequired(
      engine,
      `  return {
    agenda_agendamento_id: String(agendamento.id || ""),
    agenda_nome: String(agenda?.nome || agendamento.titulo || ""),`,
      `  return {
    agenda_agendamento_id: String(agendamento.id || ""),
    agenda_id: String(agendamento.agenda_id || ""),
    agenda_nome: String(agenda?.nome || agendamento.titulo || ""),`,
      "variável agenda_id do agendamento resolvido"
    );

    engine = replaceRequired(
      engine,
      `        agenda_agendamentos_opcoes: proximasOpcoes,
        agenda_agendamento_id: opcaoEscolhida.id,
        agenda_status: opcaoEscolhida.status || "",`,
      `        agenda_agendamentos_opcoes: proximasOpcoes,
        agenda_agendamento_id: opcaoEscolhida.id,
        agenda_id: opcaoEscolhida.agenda_id || null,
        agenda_status: opcaoEscolhida.status || "",`,
      "persistência do calendário após a escolha do agendamento"
    );

    engine = replaceRequired(
      engine,
      `  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  let query = supabaseAdmin
    .from("agenda_agendamentos")`,
      `  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("id", execucaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const metadataContexto = execucao?.metadata_json || {};
  const agendamentoContextoId = String(
    metadataContexto.agenda_agendamento_id ||
      metadataContexto.variaveis?.agenda_agendamento_id ||
      ""
  ).trim();

  if (config.usar_agendamento_contexto === true && agendamentoContextoId) {
    let queryContexto = supabaseAdmin
      .from("agenda_agendamentos")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("id", agendamentoContextoId)
      .in("status", statusBusca)
      .gte("inicio_at", new Date().toISOString());

    if (execucao?.contato_id) {
      queryContexto = queryContexto.eq("contato_id", execucao.contato_id);
    } else {
      queryContexto = queryContexto.eq("telefone_cliente", numeroDestino);
    }

    const { data: agendamentoContexto, error: erroContexto } =
      await queryContexto.maybeSingle();

    if (erroContexto) {
      await registrarLog({
        empresaId,
        execucaoId,
        fluxoId,
        noId: no.id,
        tipoEvento: "agenda_contexto_erro",
        descricao: "Erro ao validar o agendamento recebido pela automação.",
        entrada: {
          agendamento_id: agendamentoContextoId,
        },
        saida: {
          erro: erroContexto.message,
        },
      });

      await seguirParaProximoNo({
        empresaId,
        conversaId,
        execucaoId,
        fluxoId,
        noAtualId: no.id,
        mensagemTexto: "erro",
        numeroDestino,
        runtimeCache,
      });

      return;
    }

    const agendaContexto = agendamentoContexto
      ? await obterAgendaAutomacao(
          empresaId,
          String(agendamentoContexto.agenda_id || "")
        )
      : null;
    const valoresContexto = agendamentoContexto
      ? valoresAgendamentoAgenda(agendamentoContexto, agendaContexto)
      : { agenda_encontrado: "false" };

    await salvarVariaveisAutomacao({
      empresaId,
      execucao: {
        id: execucaoId,
        contato_id: execucao?.contato_id || null,
      },
      valores: {
        ...valoresContexto,
        agenda_encontrado: agendamentoContexto ? "true" : "false",
      },
      origem: "agenda_buscar_agendamento_contexto",
      metadata: {
        agendamento_id: agendamentoContexto?.id || agendamentoContextoId,
      },
    });

    await salvarEstadoExecucaoAgenda({
      empresaId,
      execucaoId,
      metadataAtual: metadataContexto,
      patch: {
        agenda_agendamento_id:
          agendamentoContexto?.id || agendamentoContextoId,
        agenda_id: agendamentoContexto?.agenda_id || null,
        agenda_status: agendamentoContexto?.status || "nao_encontrado",
        variaveis: {
          ...(metadataContexto.variaveis || {}),
          ...valoresContexto,
          agenda_encontrado: agendamentoContexto ? "true" : "false",
        },
      },
    });

    const mensagemContexto = agendamentoContexto
      ? String(config.mensagem_encontrado || "").trim()
      : String(config.mensagem_nao_encontrado || "").trim();

    if (mensagemContexto) {
      await enviarMensagemAutomacao({
        empresaId,
        conversaId,
        numeroDestino,
        conteudo: substituirVariaveisAgenda(mensagemContexto, {
          ...valoresContexto,
          agenda_encontrado: agendamentoContexto ? "true" : "false",
        }),
        execucaoId,
        noId: no.id,
      });
    }

    await registrarLog({
      empresaId,
      execucaoId,
      fluxoId,
      noId: no.id,
      tipoEvento: agendamentoContexto
        ? "agenda_contexto_utilizado"
        : "agenda_contexto_nao_encontrado",
      descricao: agendamentoContexto
        ? "Agendamento recebido pelo botão utilizado sem listar outros compromissos."
        : "O agendamento recebido pelo botão não está mais disponível.",
      entrada: {
        agendamento_id: agendamentoContextoId,
      },
      saida: {
        agendamento_id: agendamentoContexto?.id || null,
        agenda_id: agendamentoContexto?.agenda_id || null,
      },
    });

    await seguirParaProximoNo({
      empresaId,
      conversaId,
      execucaoId,
      fluxoId,
      noAtualId: no.id,
      mensagemTexto: agendamentoContexto ? "encontrado" : "nao_encontrado",
      numeroDestino,
      runtimeCache,
    });

    return;
  }

  let query = supabaseAdmin
    .from("agenda_agendamentos")`,
      "prioridade do agendamento recebido pelo botão"
    );

    engine = replaceRequired(
      engine,
      `      agenda_agendamento_id: agendamento?.id || null,
      agenda_status: agendamento?.status || "nao_encontrado",`,
      `      agenda_agendamento_id: agendamento?.id || null,
      agenda_id: agendamento?.agenda_id || null,
      agenda_status: agendamento?.status || "nao_encontrado",`,
      "persistência do calendário após busca de agendamento"
    );

    engine = replaceRequired(
      engine,
      `  const config = no.configuracao_json || {};
  const agendaId = String(config.agenda_id || "").trim();
  const metadataAtual = execucao.metadata_json || {};
  const agendaEstado = metadataAtual.agenda_estado || {};`,
      `  const config = no.configuracao_json || {};
  const metadataAtual = execucao.metadata_json || {};
  const agendaIdContexto = String(
    metadataAtual.agenda_id ||
      metadataAtual.variaveis?.agenda_id ||
      ""
  ).trim();
  const agendaId = String(
    config.usar_agenda_contexto === true
      ? agendaIdContexto || config.agenda_id || ""
      : config.agenda_id || ""
  ).trim();
  const agendaEstado = metadataAtual.agenda_estado || {};`,
      "calendário dinâmico no bloco Escolher horário"
    );

    engine = engine.replace(
      'descricao: "Bloco de escolha de horario sem agenda configurada.",',
      'descricao: "Bloco de escolha de horario sem calendário configurado ou resolvido.",'
    );
    engine = engine.replace(
      'return { ok: false, aguardando: false, error: "Bloco sem agenda configurada." };',
      'return { ok: false, aguardando: false, error: "Bloco sem calendário configurado ou resolvido." };'
    );
  }

  write(enginePath, engine);

  const editorPath = "src/app/(private)/fluxos/page.tsx";
  let editor = read(editorPath);

  if (!editor.includes("CRM_SYSTEM_CALENDAR_FLOW_EDITOR_V1")) {
    editor = replaceRequired(
      editor,
      `  const fluxo = fluxoSelecionado;
  const [confirmandoExclusaoNo, setConfirmandoExclusaoNo] = useState(false);`,
      `  const fluxo = fluxoSelecionado;
  // CRM_SYSTEM_CALENDAR_FLOW_EDITOR_V1
  const fluxoSistemaCalendario = Boolean(
    fluxoSelecionado?.configuracao_json?.fluxo_sistema_calendario === true &&
      fluxoSelecionado?.configuracao_json?.protegido_sistema === true &&
      [
        "calendario_confirmacao",
        "calendario_cancelamento",
        "calendario_reagendamento",
      ].includes(
        String(
          fluxoSelecionado?.configuracao_json?.finalidade_sistema || ""
        ).trim()
      )
  );
  const [confirmandoExclusaoNo, setConfirmandoExclusaoNo] = useState(false);`,
      "identificação dos fluxos protegidos do calendário"
    );

    editor = replaceRequired(
      editor,
      `      if (tipoFinal === "agenda_buscar_agendamento") {
        configuracao_json.agenda_id = agendaIdNode;
        configuracao_json.status_busca = ["agendado", "confirmado"];`,
      `      if (tipoFinal === "agenda_buscar_agendamento") {
        configuracao_json.agenda_id = fluxoSistemaCalendario ? "" : agendaIdNode;
        configuracao_json.usar_agendamento_contexto = fluxoSistemaCalendario;
        configuracao_json.status_busca = ["agendado", "confirmado"];`,
      "salvamento automático do bloco Buscar agendamento"
    );

    editor = replaceRequired(
      editor,
      `      if (tipoFinal === "agenda_escolher_horario") {
        configuracao_json.agenda_id = agendaIdNode;
        configuracao_json.mensagem =`,
      `      if (tipoFinal === "agenda_escolher_horario") {
        configuracao_json.agenda_id = fluxoSistemaCalendario ? "" : agendaIdNode;
        configuracao_json.usar_agenda_contexto = fluxoSistemaCalendario;
        configuracao_json.mensagem =`,
      "salvamento automático do bloco Escolher horário"
    );

    const selectorAntigo = `                      {[
                        "agenda_buscar_agendamento",
                        "agenda_escolher_horario",
                        "agenda_criar_agendamento",
                      ].includes(tipoNodeEdicao) && (
                        <label className={styles.field}>
                          <span className={styles.label}>
                            {tipoNodeEdicao === "agenda_criar_agendamento"
                              ? "Selecione a agenda"
                              : "Agenda"}
                          </span>

                          <select
                            className={styles.input}
                            value={agendaIdNode}
                            onChange={(e) => setAgendaIdNode(e.target.value)}
                            disabled={carregandoAgendasOpcoes}
                          >
                            <option value="">
                              {tipoNodeEdicao === "agenda_buscar_agendamento"
                                ? "Qualquer agenda"
                                : carregandoAgendasOpcoes
                                ? "Carregando agendas..."
                                : "Selecione uma agenda ativa"}
                            </option>

                            {agendasOpcoes.map((agenda) => (
                              <option key={agenda.id} value={agenda.id}>
                                {agenda.nome} - {agenda.duracao_minutos}min
                              </option>
                            ))}
                          </select>
                        </label>
                      )}`;

    const selectorNovo = `                      {[
                        "agenda_buscar_agendamento",
                        "agenda_escolher_horario",
                        "agenda_criar_agendamento",
                      ].includes(tipoNodeEdicao) && (
                        fluxoSistemaCalendario &&
                        [
                          "agenda_buscar_agendamento",
                          "agenda_escolher_horario",
                        ].includes(tipoNodeEdicao) ? (
                          <div className={styles.field}>
                            <span className={styles.label}>
                              {tipoNodeEdicao === "agenda_buscar_agendamento"
                                ? "Origem dos agendamentos"
                                : "Calendário"}
                            </span>

                            <select
                              className={styles.input}
                              value="automatico_contexto"
                              disabled
                              aria-label="Configuração automática do calendário"
                            >
                              <option value="automatico_contexto">
                                {tipoNodeEdicao === "agenda_buscar_agendamento"
                                  ? "Automático — botão ou todos os calendários"
                                  : "Automático — calendário do agendamento atual"}
                              </option>
                            </select>

                            <span className={styles.help}>
                              {tipoNodeEdicao === "agenda_buscar_agendamento"
                                ? "Quando iniciado por um botão, utiliza somente o agendamento correspondente. Quando iniciado por mensagem, pesquisa os compromissos futuros do contato em todos os calendários."
                                : "Os horários são consultados no mesmo calendário do agendamento recebido pelo botão ou selecionado durante o fluxo."}
                            </span>
                          </div>
                        ) : (
                          <label className={styles.field}>
                            <span className={styles.label}>
                              {tipoNodeEdicao === "agenda_criar_agendamento"
                                ? "Selecione o calendário"
                                : "Calendário"}
                            </span>

                            <select
                              className={styles.input}
                              value={agendaIdNode}
                              onChange={(e) => setAgendaIdNode(e.target.value)}
                              disabled={carregandoAgendasOpcoes}
                            >
                              <option value="">
                                {tipoNodeEdicao === "agenda_buscar_agendamento"
                                  ? "Qualquer calendário"
                                  : carregandoAgendasOpcoes
                                  ? "Carregando calendários..."
                                  : "Selecione um calendário ativo"}
                              </option>

                              {agendasOpcoes.map((agenda) => (
                                <option key={agenda.id} value={agenda.id}>
                                  {agenda.nome} - {agenda.duracao_minutos}min
                                </option>
                              ))}
                            </select>
                          </label>
                        )
                      )}`;

    editor = replaceRequired(
      editor,
      selectorAntigo,
      selectorNovo,
      "seletor exclusivo dos fluxos protegidos do calendário"
    );
  }

  write(editorPath, editor);
  console.log(
    "Fluxos protegidos do calendário configurados com agendamento e calendário automáticos."
  );
}

patchRuntimeStatus();
patchTemplatePreview();
patchCalendarEnhancers();
patchSystemCalendarFlows();
replaceDatabaseTableReferences("src");
