import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, search, replacement, description) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) {
    throw new Error(`Não foi possível aplicar ${description}.`);
  }
  return content.replace(search, replacement);
}

function replaceSection(content, startToken, endToken, replacement, description) {
  const start = content.indexOf(startToken);
  const end = content.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0) {
    throw new Error(`Não foi possível localizar ${description}.`);
  }
  return content.slice(0, start) + replacement + content.slice(end);
}

let enhancer = read("src/app/(private)/agendas/AgendaAutomationEnhancer.tsx");
if (!enhancer.includes(marker)) {
  enhancer = replaceRequired(
    enhancer,
    'const PENDING_KEY = "crm:agenda:automacoes-pendentes";',
    'const PENDING_KEY = "crm:agenda:automacoes-pendentes"; // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1',
    "marcador do disparo de pós-atendimento"
  );

  enhancer = replaceRequired(
    enhancer,
    ".agendaAutomationGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
    ".agendaAutomationFlowNotice{padding:10px 11px;border:1px solid var(--crm-warning-border);border-radius:11px;background:var(--crm-warning-bg);color:var(--crm-warning-text);font-size:9.5px;line-height:1.5}.agendaAutomationFlowNotice strong{display:block;margin-bottom:3px;color:var(--crm-warning-text)}\n.agendaAutomationGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
    "aviso da janela de 24 horas no pós-atendimento"
  );

  enhancer = replaceRequired(
    enhancer,
    '<div class="agendaAutomationNotice"><strong>Nenhum envio será realizado nesta etapa.</strong> As regras serão apenas salvas para uso nas próximas entregas. Disparos, e-mails, notificações e fluxos continuam desativados.</div>',
    '<div class="agendaAutomationNotice"><strong>Ao salvar uma alteração, os disparos pendentes anteriores serão cancelados.</strong> O sistema criará novos agendamentos com os horários atualizados. Execuções já concluídas permanecerão somente no histórico.</div>',
    "orientação sobre o replanejamento das automações"
  );

  const postCard = `\${cardHtml({ key: "pos_atendimento", title: "Pós-atendimento", timing: "Depois do término", channels: '<label class="agendaAutomationCheck"><input type="checkbox" data-channel="fluxo" checked/>Iniciar fluxo</label><label class="agendaAutomationCheck"><input type="checkbox" data-channel="whatsapp"/>Disparo pelo WhatsApp</label>', extras: '<label class="agendaAutomationField"><span>Fluxo que será iniciado</span><select data-role="flow"><option value="">Selecione um fluxo</option></select></label><div class="agendaAutomationFlowNotice"><strong>Importante sobre o fluxo automático</strong>O fluxo só poderá iniciar se existir uma conversa ativa e a janela de atendimento de 24 horas da Meta ainda estiver aberta. Para executar o pós-atendimento horas ou dias depois, use o disparo por template do WhatsApp.</div><div class="agendaAutomationWhatsApp"><label class="agendaAutomationField"><span>Integração do WhatsApp</span><select data-role="integration"><option value="">Selecione</option></select></label><label class="agendaAutomationField"><span>Template do pós-atendimento</span><select data-role="template"><option value="">Selecione</option></select></label><div class="agendaAutomationCompatibility" data-role="compatibility">Selecione o template aprovado que será enviado após o atendimento.</div></div>' })}`;
  enhancer = replaceSection(
    enhancer,
    '${cardHtml({ key: "pos_atendimento"',
    '</div><div class="agendaAutomationError"',
    postCard,
    "card de pós-atendimento"
  );

  const compatibilityReplacement = `function atualizarCompatibilidade(card: HTMLElement, opcoes: Opcoes) {
  const templateId = card.querySelector<HTMLSelectElement>('select[data-role="template"]')?.value || "";
  const status = card.querySelector<HTMLElement>('[data-role="compatibility"]');
  if (!status) return;
  status.classList.remove("ok", "warn");
  const template = opcoes.templates.find((item) => item.id === templateId);
  if (!template) {
    if (card.dataset.rule === "confirmacao") {
      status.textContent = "Selecione um template com botões Confirmar, Cancelar e Reagendar.";
    } else if (card.dataset.rule === "pos_atendimento") {
      status.textContent = "Selecione o template aprovado que será enviado após o atendimento.";
    } else {
      status.textContent = "Selecione o template que será usado no lembrete.";
    }
    return;
  }
  if (card.dataset.rule === "confirmacao") {
    const compativel = templateCompativel(template);
    status.classList.add(compativel ? "ok" : "warn");
    status.textContent = compativel
      ? "Template compatível com os três caminhos planejados."
      : "Botões encontrados: " + ((template.botoes || []).join(", ") || "nenhum") + ". A compatibilidade será validada antes da ativação.";
  } else {
    status.classList.add("ok");
    status.textContent = card.dataset.rule === "pos_atendimento"
      ? "Template aprovado e disponível para o disparo de pós-atendimento, inclusive fora da janela de 24 horas."
      : "Template Utility aprovado e disponível para esta integração.";
  }
}

`;
  enhancer = replaceSection(
    enhancer,
    "function atualizarCompatibilidade(card: HTMLElement, opcoes: Opcoes) {",
    "function aplicarEstadoVisual(section: HTMLElement) {",
    compatibilityReplacement,
    "compatibilidade do template de pós-atendimento"
  );

  enhancer = replaceRequired(
    enhancer,
    '    if (flow) flow.value = principal.fluxo_id || "";',
    '    if (flow) flow.value = encontradas.find((item) => item.canal === "fluxo")?.fluxo_id || "";',
    "carregamento do fluxo de pós-atendimento"
  );

  enhancer = replaceRequired(
    enhancer,
    '        fluxo_id: tipo === "pos_atendimento" ? flow : null,',
    '        fluxo_id: input.dataset.channel === "fluxo" ? flow : null,',
    "serialização independente do fluxo e do disparo"
  );

  const validationReplacement = `function validar(section: HTMLElement, regras: Regra[]) {
  for (const tipo of ["confirmacao", "lembrete", "aviso_responsavel", "pos_atendimento"] as const) {
    const card = section.querySelector<HTMLElement>(\`[data-rule="\${tipo}"]\`);
    const ativo = card?.querySelector<HTMLInputElement>('[data-role="enabled"]')?.checked === true;
    if (!ativo) continue;
    const relacionadas = regras.filter((item) => item.tipo === tipo);
    if (!relacionadas.length) return "Selecione ao menos um canal para " + tipo.replace("_", " ") + ".";
    const whatsapp = relacionadas.find((item) => item.canal === "whatsapp");
    if (whatsapp && (!whatsapp.integracao_whatsapp_id || !whatsapp.whatsapp_template_id)) {
      return "Selecione a integração e o template do WhatsApp para " + tipo.replace("_", " ") + ".";
    }
    const fluxo = relacionadas.find((item) => item.canal === "fluxo");
    if (fluxo && !fluxo.fluxo_id) {
      return "Selecione o fluxo de pós-atendimento ou desmarque o canal Iniciar fluxo.";
    }
  }
  return "";
}

`;
  enhancer = replaceSection(
    enhancer,
    "function validar(section: HTMLElement, regras: Regra[]) {",
    "async function salvar(agendaId: string, regras: Regra[]) {",
    validationReplacement,
    "validação independente dos canais de pós-atendimento"
  );

  write("src/app/(private)/agendas/AgendaAutomationEnhancer.tsx", enhancer);
}

let runtimeContext = read("src/lib/agendas/automation-runtime-context.ts");
if (!runtimeContext.includes(marker)) {
  runtimeContext = replaceRequired(
    runtimeContext,
    "const APPROVED = [\"approved\", \"APPROVED\", \"aprovado\"];",
    "const APPROVED = [\"approved\", \"APPROVED\", \"aprovado\"]; // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1",
    "marcador do runtime da agenda"
  );
  runtimeContext = runtimeContext.replaceAll(
    "id, empresa_id, contato_id, responsavel_id, integracao_whatsapp_id, status, bot_ativo, aguardando_atendente, last_message_at",
    "id, empresa_id, contato_id, responsavel_id, integracao_whatsapp_id, status, bot_ativo, aguardando_atendente, last_message_at, last_inbound_message_at, window_expires_at, closed_at"
  );
  runtimeContext = replaceRequired(
    runtimeContext,
    '    .eq("empresa_id", job.empresa_id)\n    .eq("id", job.id);',
    '    .eq("empresa_id", job.empresa_id)\n    .eq("id", job.id)\n    .eq("status", "processando");',
    "proteção contra conclusão de execução substituída"
  );
  write("src/lib/agendas/automation-runtime-context.ts", runtimeContext);
}

let runtime = read("src/lib/agendas/automation-runtime.ts");
if (!runtime.includes(marker)) {
  runtime = replaceRequired(
    runtime,
    "const supabase = getSupabaseAdmin();",
    `const supabase = getSupabaseAdmin();

// ${marker}
async function executionStillCurrent(job: Job) {
  const { data, error } = await supabase
    .from("agenda_automacao_execucoes")
    .select("status, regra_id")
    .eq("empresa_id", job.empresa_id)
    .eq("id", job.id)
    .maybeSingle();
  if (error) {
    throw new Error("Erro ao validar a execução atual da agenda: " + error.message);
  }
  return (
    data?.status === "processando" &&
    String(data?.regra_id || "") === String(job.regra_id || "")
  );
}`,
    "validação da execução replanejada"
  );
  runtime = replaceRequired(
    runtime,
    `  if (!isApplicable(context)) {
    await cancelJob(job, "A regra não se aplica mais ao estado atual do agendamento.");
    return "cancelado" as const;
  }

  if (job.canal === "whatsapp") {`,
    `  if (!isApplicable(context)) {
    await cancelJob(job, "A regra não se aplica mais ao estado atual do agendamento.");
    return "cancelado" as const;
  }
  if (!(await executionStillCurrent(job))) {
    return "cancelado" as const;
  }

  if (job.canal === "whatsapp") {`,
    "bloqueio de execução antiga antes do envio"
  );
  write("src/lib/agendas/automation-runtime.ts", runtime);
}

let runtimeActions = read("src/lib/agendas/automation-runtime-actions.ts");
if (!runtimeActions.includes(marker)) {
  runtimeActions = replaceRequired(
    runtimeActions,
    "const supabase = getSupabaseAdmin();",
    "const supabase = getSupabaseAdmin(); // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1",
    "marcador das ações de pós-atendimento"
  );
  runtimeActions = replaceRequired(
    runtimeActions,
    `  if (!context.appointment.contato_id || !context.conversation?.id) {
    throw new AgendaAutomationError(
      "O pós-atendimento exige um contato e uma conversa vinculados ao agendamento.",
      { permanent: true }
    );
  }
  const phone = customerPhone(context);`,
    `  if (!context.appointment.contato_id || !context.conversation?.id) {
    throw new AgendaAutomationError(
      "O pós-atendimento exige um contato e uma conversa vinculados ao agendamento.",
      { permanent: true }
    );
  }

  const nowMs = Date.now();
  const conversationStatus = String(context.conversation.status || "");
  const activeStatuses = new Set(["aberta", "fila", "bot", "em_atendimento"]);
  const windowExpiresAt = Date.parse(String(context.conversation.window_expires_at || ""));
  const lastInboundAt = Date.parse(String(context.conversation.last_inbound_message_at || ""));
  const windowOpen =
    (Number.isFinite(windowExpiresAt) && windowExpiresAt > nowMs) ||
    (Number.isFinite(lastInboundAt) && lastInboundAt + 24 * 60 * 60 * 1000 > nowMs);

  if (!activeStatuses.has(conversationStatus) || !windowOpen) {
    throw new AgendaAutomationError(
      "O fluxo de pós-atendimento só pode iniciar em uma conversa ativa dentro da janela de 24 horas da Meta. Para períodos maiores, configure um disparo por template do WhatsApp.",
      { cancel: true }
    );
  }

  const phone = customerPhone(context);`,
    "validação da janela de 24 horas para iniciar fluxo"
  );
  write("src/lib/agendas/automation-runtime-actions.ts", runtimeActions);
}

let route = read("src/app/api/agendas/[id]/automacoes/route.ts");
route = replaceRequired(
  route,
  '        "Configurações salvas, mapeamentos validados e automações replanejadas.",',
  '        "Configurações salvas. Disparos pendentes anteriores foram cancelados e os novos horários foram replanejados.",',
  "mensagem de confirmação do replanejamento"
);
write("src/app/api/agendas/[id]/automacoes/route.ts", route);

console.log(
  "Replanejamento das automações e disparo por template no pós-atendimento aplicados."
);
