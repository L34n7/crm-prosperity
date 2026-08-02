import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_CALENDAR_EMAIL_REMINDER_BUTTONS_PRIORITY_V1";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
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

let runtimeActions = read("src/lib/agendas/automation-runtime-actions.ts");
if (!runtimeActions.includes(marker)) {
  runtimeActions = replaceRequired(
    runtimeActions,
    `    location: context.appointment.local,\n    agendaId: context.agenda.id,`,
    `    location: context.appointment.local,\n    startAt: context.appointment.inicio_at,\n    endAt: context.appointment.fim_at,\n    agendaId: context.agenda.id, // ${marker}`,
    "datas do convite de calendário nos e-mails"
  );
}
write("src/lib/agendas/automation-runtime-actions.ts", runtimeActions);

let runtimeTypes = read("src/lib/agendas/automation-runtime-types.ts");
runtimeTypes = replaceRequired(
  runtimeTypes,
  `  if (context.job.tipo !== "confirmacao") return [];`,
  `  if (!["confirmacao", "lembrete"].includes(context.job.tipo)) return []; // ${marker}`,
  "botões de resposta rápida no lembrete"
);
write("src/lib/agendas/automation-runtime-types.ts", runtimeTypes);

let enhancer = read("src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx");
enhancer = replaceRequired(
  enhancer,
  `      card.dataset.rule === "confirmacao"`,
  `      ["confirmacao", "lembrete"].includes(String(card.dataset.rule || "")) // ${marker}`,
  "painel de botões no lembrete"
);
write("src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx", enhancer);

let route = read("src/app/api/agendas/[id]/automacoes/route.ts");
const buttonValidationStart = `function validateButtonMapping(payload: unknown, configuration: Record<string, unknown>) {`;
const buttonValidationEnd = `\n\nexport async function GET(`;
const buttonValidationReplacement = `function validateButtonMapping(
  payload: unknown,
  configuration: Record<string, unknown>,
  requireAllActions: boolean
) {
  const buttons = extractTemplateQuickReplyButtons(payload);
  const mappings = normalizeButtonMappings(configuration.template_botoes);
  const available = new Set(buttons.map((item) => item.indice));
  for (const mapping of mappings) {
    if (!available.has(mapping.indice)) {
      return \`O mapeamento do botão \${mapping.indice + 1} não corresponde ao template atual.\`;
    }
    if (mapping.acao !== "ignorar" && !mapping.fluxo_id) {
      return \`Selecione o fluxo que será iniciado ao \${mapping.acao}.\`;
    }
  }
  if (!requireAllActions) return "";

  const actions = new Set(
    mappings.filter((item) => item.acao !== "ignorar").map((item) => item.acao)
  );
  for (const action of ["confirmar", "cancelar", "reagendar"] as const) {
    if (!actions.has(action)) {
      return \`Associe um botão do template à ação “\${action}”.\`;
    }
  }
  return "";
} // ${marker}`;
if (!route.includes(marker)) {
  route = replaceSection(
    route,
    buttonValidationStart,
    buttonValidationEnd,
    buttonValidationReplacement,
    "validação flexível dos botões"
  );
  route = replaceRequired(
    route,
    `      if (rule.tipo === "confirmacao") {\n        const buttonError = validateButtonMapping(template?.payload, rule.configuracao_json);`,
    `      if (["confirmacao", "lembrete"].includes(rule.tipo)) {\n        const buttonError = validateButtonMapping(\n          template?.payload,\n          rule.configuracao_json,\n          rule.tipo === "confirmacao"\n        );`,
    "validação de botões para confirmação e lembrete"
  );
}
write("src/app/api/agendas/[id]/automacoes/route.ts", route);

let responseRuntime = read("src/lib/agendas/agenda-response-runtime.ts");
if (!responseRuntime.includes(marker)) {
  responseRuntime = replaceRequired(
    responseRuntime,
    `  if (humanService || conversation.aguardando_atendente === true) {\n    throw new ResponseFlowError(\n      "A conversa está em atendimento humano; o fluxo será tentado novamente."\n    );\n  }`,
    `  if (humanService || conversation.aguardando_atendente === true) {\n    throw new ResponseFlowError(\n      "A ação foi registrada, mas a conversa está em atendimento humano.",\n      { cancel: true }\n    );\n  }`,
    "preservação do atendimento humano"
  );

  const activeStart = `  const { data: activeExecution } = await supabase\n    .from("automacao_execucoes")`;
  const activeEnd = `\n\n  const { data: initialNode, error: nodeError } = await supabase`;
  const activeReplacement = `  // ${marker}
  const { data: activeExecutions, error: activeExecutionsError } = await supabase
    .from("automacao_execucoes")
    .select("id, fluxo_id, status, metadata_json")
    .eq("empresa_id", job.empresa_id)
    .eq("conversa_id", conversation.id)
    .in("status", ["rodando", "aguardando"]);
  if (activeExecutionsError) {
    throw new Error(
      \`Erro ao verificar automações ativas: \${activeExecutionsError.message}\`
    );
  }

  const interruptedExecutionIds = (activeExecutions || []).map((item) => item.id);
  if (interruptedExecutionIds.length > 0) {
    const interruptedAt = new Date().toISOString();
    for (const activeExecution of activeExecutions || []) {
      const { error: interruptionError } = await supabase
        .from("automacao_execucoes")
        .update({
          status: "cancelado",
          metadata_json: {
            ...(activeExecution.metadata_json || {}),
            interrupcao_agenda: {
              motivo: "interrompido_por_acao_calendario",
              acao: job.acao,
              agenda_agendamento_id: appointment.id,
              agenda_automacao_resposta_id: job.id,
              fluxo_substituto_id: flow.id,
              interrompido_em: interruptedAt,
            },
          },
        })
        .eq("empresa_id", job.empresa_id)
        .eq("id", activeExecution.id)
        .in("status", ["rodando", "aguardando"]);
      if (interruptionError) {
        throw new Error(
          \`Erro ao interromper automação anterior: \${interruptionError.message}\`
        );
      }
    }

    const { error: schedulesError } = await supabase
      .from("automacao_agendamentos")
      .update({ status: "cancelado" })
      .eq("empresa_id", job.empresa_id)
      .in("execucao_id", interruptedExecutionIds)
      .eq("status", "pendente");
    if (schedulesError) {
      throw new Error(
        \`Erro ao cancelar tarefas da automação anterior: \${schedulesError.message}\`
      );
    }
  }`;
  responseRuntime = replaceSection(
    responseRuntime,
    activeStart,
    activeEnd,
    activeReplacement,
    "prioridade do clique do calendário"
  );
}
write("src/lib/agendas/agenda-response-runtime.ts", responseRuntime);

let appointmentEmail = read("src/lib/email/send-appointment-created-email.ts");
if (!appointmentEmail.includes(marker)) {
  appointmentEmail = replaceRequired(
    appointmentEmail,
    `import { supabaseAdmin } from "@/lib/supabase/admin";`,
    `import { supabaseAdmin } from "@/lib/supabase/admin";\nimport {\n  buildCalendarInvite,\n  calendarInviteContentType,\n} from "@/lib/email/calendar-invite"; // ${marker}`,
    "helper de calendário no e-mail de agendamento"
  );
  appointmentEmail = replaceSection(
    appointmentEmail,
    `function dataIcsValida(`,
    `async function buscarNomeEmpresa(`,
    ``,
    "implementação antiga do convite de calendário"
  );
  const inviteStart = `  const conviteCalendario = montarConviteCalendario({`;
  const inviteEnd = `\n  const conviteContentType =`;
  const inviteReplacement = `  const conviteCalendario = buildCalendarInvite({
    appointmentId: agendamentoId,
    companyName: empresaNome,
    attendeeEmail: destinatario,
    attendeeName: contatoNome || "Cliente",
    title: \`Agendamento com \${empresaNome}\`,
    description: [
      \`\${textoConfirmacao} com \${empresaNome}.\`,
      dataLabel ? \`Data: \${dataLabel}.\` : "",
      horaLabel ? \`Horário: \${horaLabel}.\` : "",
    ]
      .filter(Boolean)
      .join(" "),
    startAt: inicioAt,
    endAt: fimAt,
    sequence: ehCancelamento ? 2 : ehRemarcacao ? 1 : 0,
    method: ehCancelamento ? "CANCEL" : "REQUEST",
    status: ehCancelamento ? "CANCELLED" : "CONFIRMED",
  });`;
  appointmentEmail = replaceSection(
    appointmentEmail,
    inviteStart,
    inviteEnd,
    inviteReplacement,
    "convite compartilhado do agendamento"
  );
  const contentTypeStart = `  const conviteContentType =`;
  const contentTypeEnd = `\n\n  try {`;
  appointmentEmail = replaceSection(
    appointmentEmail,
    contentTypeStart,
    contentTypeEnd,
    `  const conviteContentType = calendarInviteContentType(\n    ehCancelamento ? "CANCEL" : "REQUEST"\n  );`,
    "tipo de conteúdo do convite"
  );

  appointmentEmail = replaceRequired(
    appointmentEmail,
    `  const empresaCabecalho = textoCabecalhoSeguro(empresaNome || "CRM Prosperity");`,
    `  const empresaCabecalho = textoCabecalhoSeguro(empresaNome || "CRM Prosperity");\n  const appUrl = (\n    process.env.NEXT_PUBLIC_SITE_URL ||\n    process.env.NEXT_PUBLIC_APP_URL ||\n    "https://crmprosperity.com"\n  ).replace(/\\\/$/, "");\n  const logoUrl = \`\${appUrl}/logo.png\`;`,
    "logo do header do e-mail de agendamento"
  );

  const oldHeader = `                    <td style="background:#0f509a;padding:26px 30px;color:#ffffff;">\n                      <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">\n                        \${empresaSeguro}\n                      </div>\n                      <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">\n                        \${tituloEmail}\n                      </h1>\n                      <p style="margin:8px 0 0;font-size:18px;line-height:1.35;font-weight:700;opacity:0.95;">\n                        \${subtituloEmail}\n                      </p>\n                    </td>`;
  const newHeader = `                    <td style="background:linear-gradient(135deg,#0f509a,#0f172a);padding:28px 32px;color:#ffffff;">\n                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>\n                        <td style="padding:0;vertical-align:middle;">\n                          <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">\${empresaSeguro}</div>\n                          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">\${tituloEmail}</h1>\n                          <p style="margin:8px 0 0;font-size:15px;line-height:1.45;font-weight:700;opacity:0.95;">\${subtituloEmail}</p>\n                        </td>\n                        <td width="86" align="right" style="width:86px;padding:0 0 0 18px;vertical-align:middle;">\n                          <img src="\${logoUrl}" alt="CRM Prosperity" width="72" style="display:block;width:72px;height:auto;border:0;outline:none;text-decoration:none;" />\n                        </td>\n                      </tr></table>\n                    </td>`;
  appointmentEmail = replaceRequired(
    appointmentEmail,
    oldHeader,
    newHeader,
    "header padrão do e-mail de agendamento"
  );
}
write("src/lib/email/send-appointment-created-email.ts", appointmentEmail);

console.log(
  "E-mails, convites de calendário, botões de lembrete e prioridade das ações do calendário aplicados."
);
