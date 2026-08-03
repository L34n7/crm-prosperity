import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_AGENDA_VALIDATION_RESCHEDULE_V1";

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
    'const PENDING_KEY = "crm:agenda:automacoes-pendentes"; // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1',
    'const PENDING_KEY = "crm:agenda:automacoes-pendentes"; // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1\nconst CRM_AGENDA_VALIDATION_RESCHEDULE_V1 = true;',
    "marcador da correção das automações da agenda"
  );

  enhancer = replaceRequired(
    enhancer,
    '<label class="agendaAutomationCheck"><input type="checkbox" data-channel="fluxo" checked/>Iniciar fluxo</label><label class="agendaAutomationCheck"><input type="checkbox" data-channel="whatsapp"/>Disparo pelo WhatsApp</label>',
    '<label class="agendaAutomationCheck"><input type="radio" name="agenda-pos-atendimento-canal" data-channel="fluxo" checked/>Iniciar fluxo</label><label class="agendaAutomationCheck"><input type="radio" name="agenda-pos-atendimento-canal" data-channel="whatsapp"/>Disparo pelo WhatsApp</label>',
    "escolha exclusiva do canal de pós-atendimento"
  );

  const visualReplacement = `function aplicarCanalPosAtendimento(section: HTMLElement) {
  const card = section.querySelector<HTMLElement>('[data-rule="pos_atendimento"]');
  if (!card) return;

  const fluxo = card.querySelector<HTMLInputElement>('input[data-channel="fluxo"]');
  const whatsapp = card.querySelector<HTMLInputElement>('input[data-channel="whatsapp"]');
  if (fluxo && whatsapp && !fluxo.checked && !whatsapp.checked) {
    fluxo.checked = true;
  }

  const usaFluxo = fluxo?.checked === true;
  const usaWhatsapp = whatsapp?.checked === true;
  const flowSelect = card.querySelector<HTMLSelectElement>('select[data-role="flow"]');
  const flowField = flowSelect?.closest(".agendaAutomationField") as HTMLElement | null;
  const flowNotice = card.querySelector<HTMLElement>(".agendaAutomationFlowNotice");
  const whatsappFields = card.querySelector<HTMLElement>(".agendaAutomationWhatsApp");

  if (flowField) flowField.style.display = usaFluxo ? "" : "none";
  if (flowNotice) flowNotice.style.display = usaFluxo ? "" : "none";
  if (whatsappFields) whatsappFields.style.display = usaWhatsapp ? "grid" : "none";
}

function aplicarEstadoVisual(section: HTMLElement) {
  section.querySelectorAll<HTMLElement>(".agendaAutomationCard").forEach((card) => {
    const active = card.querySelector<HTMLInputElement>('[data-role="enabled"]')?.checked === true;
    card.dataset.enabled = String(active);
    card.classList.toggle("isActive", active);
    const label = card.querySelector<HTMLElement>(".agendaAutomationSwitch span");
    if (label) label.textContent = active ? "Ativado" : "Desativado";
  });
  aplicarCanalPosAtendimento(section);
}

`;
  enhancer = replaceSection(
    enhancer,
    "function aplicarEstadoVisual(section: HTMLElement) {",
    "function aplicarRegras(section: HTMLElement, regras: Regra[], opcoes: Opcoes) {",
    visualReplacement,
    "estado visual exclusivo do pós-atendimento"
  );

  const validationReplacement = `function validar(section: HTMLElement, regras: Regra[]) {
  const nomes = {
    confirmacao: "Confirmação do agendamento",
    lembrete: "Lembrete do agendamento",
    aviso_responsavel: "Aviso ao responsável",
    pos_atendimento: "Pós-atendimento",
  } as const;

  for (const tipo of ["confirmacao", "lembrete", "aviso_responsavel", "pos_atendimento"] as const) {
    const card = section.querySelector<HTMLElement>(\`[data-rule="\${tipo}"]\`);
    const ativo = card?.querySelector<HTMLInputElement>('[data-role="enabled"]')?.checked === true;
    if (!ativo) continue;

    const relacionadas = regras.filter((item) => item.tipo === tipo);
    if (!relacionadas.length) {
      return nomes[tipo] + ": selecione um canal de execução.";
    }

    if (tipo === "pos_atendimento") {
      if (relacionadas.length !== 1) {
        return "Pós-atendimento: escolha somente uma opção — Iniciar fluxo ou Disparo pelo WhatsApp.";
      }
      const canal = relacionadas[0];
      if (canal.canal === "fluxo" && !canal.fluxo_id) {
        return "Pós-atendimento: selecione o fluxo que será iniciado.";
      }
      if (
        canal.canal === "whatsapp" &&
        (!canal.integracao_whatsapp_id || !canal.whatsapp_template_id)
      ) {
        return "Pós-atendimento: selecione a integração e o template do disparo pelo WhatsApp.";
      }
      continue;
    }

    const whatsapp = relacionadas.find((item) => item.canal === "whatsapp");
    if (whatsapp && (!whatsapp.integracao_whatsapp_id || !whatsapp.whatsapp_template_id)) {
      return nomes[tipo] + ": selecione a integração e o template do WhatsApp.";
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
    "validação dos canais de pós-atendimento"
  );

  enhancer = replaceRequired(
    enhancer,
    `          card.querySelector<HTMLInputElement>('[data-role="enabled"]')?.addEventListener("change", () => aplicarEstadoVisual(section!));
          const integration = card.querySelector<HTMLSelectElement>('[data-role="integration"]');`,
    `          card.querySelector<HTMLInputElement>('[data-role="enabled"]')?.addEventListener("change", () => aplicarEstadoVisual(section!));
          card.querySelectorAll<HTMLInputElement>('[data-channel]').forEach((input) => {
            input.addEventListener("change", () => aplicarEstadoVisual(section!));
          });
          const integration = card.querySelector<HTMLSelectElement>('[data-role="integration"]');`,
    "atualização visual ao trocar o canal de pós-atendimento"
  );

  write("src/app/(private)/agendas/AgendaAutomationEnhancer.tsx", enhancer);
}

let route = read("src/app/api/agendas/[id]/automacoes/route.ts");
if (!route.includes(marker)) {
  const buttonValidation = `function validateButtonMapping(
  payload: unknown,
  configuration: Record<string, unknown>,
  requireAllActions: boolean
) {
  const buttons = extractTemplateQuickReplyButtons(payload);
  const mappings = normalizeButtonMappings(configuration.template_botoes);
  const available = new Set(buttons.map((item) => item.indice));
  const contextLabel = requireAllActions
    ? "Confirmação do agendamento"
    : "Lembrete do agendamento";
  const actionLabels: Record<string, string> = {
    confirmar: "Confirmar agendamento",
    cancelar: "Iniciar cancelamento",
    reagendar: "Iniciar reagendamento",
  };

  for (const mapping of mappings) {
    const button = buttons.find((item) => item.indice === mapping.indice);
    const buttonLabel = String(
      button?.texto || mapping.texto_snapshot || \`Botão \${mapping.indice + 1}\`
    ).trim();

    if (!available.has(mapping.indice)) {
      return \`\${contextLabel}: o mapeamento do botão “\${buttonLabel}” não corresponde ao template atual.\`;
    }
    if (mapping.acao !== "ignorar" && !mapping.fluxo_id) {
      return \`\${contextLabel} — botão “\${buttonLabel}”: a ação “\${
        actionLabels[mapping.acao] || mapping.acao
      }” exige a seleção de um fluxo. Se não deseja mapear esse botão, escolha “Sem ação” no campo Ação no CRM.\`;
    }
  }

  if (!requireAllActions) return "";

  const actions = new Set(
    mappings.filter((item) => item.acao !== "ignorar").map((item) => item.acao)
  );
  for (const action of ["confirmar", "cancelar", "reagendar"] as const) {
    if (!actions.has(action)) {
      return \`\${contextLabel}: associe um botão do template à ação “\${
        actionLabels[action]
      }”.\`;
    }
  }
  return "";
} // ${marker}`;

  route = replaceSection(
    route,
    "function validateButtonMapping(",
    "export async function GET(",
    buttonValidation + "\n\n",
    "mensagem contextual do mapeamento dos botões"
  );

  const postValidationAnchor = `    const integrationIds = Array.from(`;
  route = replaceRequired(
    route,
    postValidationAnchor,
    `    const activePostAttendanceRules = rules.filter(
      (item) => item.tipo === "pos_atendimento" && item.ativo
    );
    if (
      activePostAttendanceRules.length > 1 ||
      activePostAttendanceRules.some(
        (item) => !["fluxo", "whatsapp"].includes(item.canal)
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Pós-atendimento: escolha somente uma opção — Iniciar fluxo ou Disparo pelo WhatsApp.",
        },
        { status: 400 }
      );
    }

${postValidationAnchor}`,
    "validação exclusiva do pós-atendimento na API"
  );

  write("src/app/api/agendas/[id]/automacoes/route.ts", route);
}

console.log(
  "Erros de mapeamento identificáveis, canal exclusivo do pós-atendimento e proteção do reagendamento aplicados."
);
