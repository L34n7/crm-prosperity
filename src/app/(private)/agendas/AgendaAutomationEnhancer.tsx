"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-automation-stage2";
const PENDING_KEY = "crm:agenda:automacoes-pendentes"; // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1
const CRM_AGENDA_VALIDATION_RESCHEDULE_V1 = true;

type Integracao = { id: string; nome_conexao: string };
type Template = {
  id: string;
  nome: string;
  idioma: string;
  integracao_whatsapp_id: string;
  botoes?: string[];
};
type Fluxo = { id: string; nome: string; status: string };
type Opcoes = { integracoes: Integracao[]; templates: Template[]; fluxos: Fluxo[] };
type Regra = {
  tipo: "confirmacao" | "lembrete" | "aviso_responsavel" | "pos_atendimento";
  canal: "whatsapp" | "email" | "sistema" | "fluxo";
  ativo: boolean;
  antecedencia_minutos: number;
  ordem: number;
  integracao_whatsapp_id?: string | null;
  whatsapp_template_id?: string | null;
  fluxo_id?: string | null;
  configuracao_json?: Record<string, unknown>;
};

const CSS = `
.agendaAutomationSection{grid-column:1/-1;position:relative;margin:8px 0 2px;padding:16px;border:1px solid color-mix(in srgb,var(--crm-primary-border) 70%,var(--crm-border));border-radius:18px;background:linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-primary-soft) 35%,var(--crm-surface)));box-shadow:0 12px 30px color-mix(in srgb,var(--crm-primary-strong) 6%,transparent);overflow:hidden}
.agendaAutomationSection:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--crm-primary-strong),color-mix(in srgb,var(--crm-primary-strong) 35%,var(--crm-ui-private-surface-hex-21a179)))}
.agendaAutomationHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:13px}.agendaAutomationTitle{display:flex;align-items:center;gap:10px}.agendaAutomationIcon{width:38px;height:38px;border:1px solid var(--crm-primary-border);border-radius:12px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:grid;place-items:center;font-size:18px}.agendaAutomationTitle h3{margin:0!important;font-size:15px!important}.agendaAutomationTitle p{margin:3px 0 0;color:var(--crm-text-muted);font-size:10.5px;line-height:1.4}.agendaAutomationStage{padding:5px 9px;border:1px solid var(--crm-warning-border);border-radius:999px;background:var(--crm-warning-bg);color:var(--crm-warning-text);font-size:8.5px;font-weight:900;white-space:nowrap}
.agendaAutomationNotice{margin-bottom:12px;padding:10px 11px;border:1px solid var(--crm-warning-border);border-radius:12px;background:var(--crm-warning-bg);color:var(--crm-warning-text);font-size:10px;line-height:1.45}
.agendaAutomationFlowNotice{padding:10px 11px;border:1px solid var(--crm-warning-border);border-radius:11px;background:var(--crm-warning-bg);color:var(--crm-warning-text);font-size:9.5px;line-height:1.5}.agendaAutomationFlowNotice strong{display:block;margin-bottom:3px;color:var(--crm-warning-text)}
.agendaAutomationGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.agendaAutomationCard{padding:12px;border:1px solid var(--crm-border);border-radius:15px;background:var(--crm-surface);display:grid;gap:10px}.agendaAutomationCard.isActive{border-color:var(--crm-primary-border);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crm-primary-border) 35%,transparent)}.agendaAutomationCardHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.agendaAutomationCardHead strong{font-size:12px;color:var(--crm-text-strong)}.agendaAutomationSwitch{display:flex;align-items:center;gap:7px;font-size:9px;font-weight:900;color:var(--crm-text-muted);cursor:pointer}.agendaAutomationSwitch input{width:17px;height:17px;accent-color:var(--crm-primary-strong)}
.agendaAutomationWhen{display:grid;grid-template-columns:minmax(70px,.7fr) minmax(110px,1fr);gap:7px}.agendaAutomationField{display:grid;gap:5px}.agendaAutomationField>span{font-size:9px;font-weight:850;color:var(--crm-text-muted)}.agendaAutomationField input,.agendaAutomationField select{width:100%;height:35px;padding:0 9px;border:1px solid var(--crm-border-strong);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);font:inherit;font-size:10.5px;outline:none}.agendaAutomationField input:focus,.agendaAutomationField select:focus{border-color:var(--crm-primary-strong);box-shadow:var(--crm-focus-ring)}
.agendaAutomationChannels{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.agendaAutomationCheck{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:800;color:var(--crm-text);cursor:pointer}.agendaAutomationCheck input{width:15px;height:15px;accent-color:var(--crm-primary-strong)}.agendaAutomationWhatsApp{display:grid;grid-template-columns:1fr 1fr;gap:7px}.agendaAutomationCompatibility{grid-column:1/-1;min-height:18px;font-size:8.5px;color:var(--crm-text-muted)}.agendaAutomationCompatibility.ok{color:var(--crm-success-text)}.agendaAutomationCompatibility.warn{color:var(--crm-warning-text)}
.agendaAutomationCard[data-enabled="false"] .agendaAutomationBody{opacity:.58}.agendaAutomationError{display:none;margin-top:10px;padding:9px 10px;border:1px solid var(--crm-danger-border);border-radius:10px;background:var(--crm-danger-bg);color:var(--crm-danger-text);font-size:10px}.agendaAutomationError.show{display:block}.agendaAutomationSaving{display:none;margin-top:9px;color:var(--crm-primary-text);font-size:9px;font-weight:850}.agendaAutomationSaving.show{display:block}
@media(max-width:760px){.agendaAutomationHead{flex-direction:column}.agendaAutomationGrid{grid-template-columns:1fr}.agendaAutomationWhatsApp{grid-template-columns:1fr}.agendaAutomationWhen{grid-template-columns:1fr 1fr}}
`;

function normalizar(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function texto(element: Element | null) {
  return element?.textContent?.trim() || "";
}

function minutos(valor: number, unidade: string) {
  if (unidade === "dias") return valor * 1440;
  if (unidade === "horas") return valor * 60;
  return valor;
}

function decomporMinutos(total: number) {
  if (total > 0 && total % 1440 === 0) return { valor: total / 1440, unidade: "dias" };
  if (total > 0 && total % 60 === 0) return { valor: total / 60, unidade: "horas" };
  return { valor: total || 0, unidade: "minutos" };
}

function option(value: string, label: string) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function templateCompativel(template?: Template) {
  const botoes = (template?.botoes || []).map(normalizar);
  return ["confirmar", "cancelar", "reagendar"].every((acao) =>
    botoes.some((botao) => botao === acao || botao.includes(acao))
  );
}

function cardHtml(params: {
  key: string;
  title: string;
  timing: string;
  channels: string;
  extras?: string;
}) {
  return `<article class="agendaAutomationCard" data-rule="${params.key}" data-enabled="false"><div class="agendaAutomationCardHead"><strong>${params.title}</strong><label class="agendaAutomationSwitch"><span>Desativado</span><input type="checkbox" data-role="enabled"/></label></div><div class="agendaAutomationBody"><div class="agendaAutomationWhen"><label class="agendaAutomationField"><span>Quantidade</span><input type="number" min="0" max="365" value="${params.key === "pos_atendimento" ? 30 : params.key === "aviso_responsavel" ? 30 : params.key === "lembrete" ? 2 : 1}" data-role="amount"/></label><label class="agendaAutomationField"><span>${params.timing}</span><select data-role="unit"><option value="minutos">minutos</option><option value="horas" ${params.key === "lembrete" || params.key === "aviso_responsavel" || params.key === "pos_atendimento" ? "selected" : ""}>horas</option><option value="dias" ${params.key === "confirmacao" ? "selected" : ""}>dias</option></select></label></div><div class="agendaAutomationChannels">${params.channels}</div>${params.extras || ""}</div></article>`;
}

function criarSecao() {
  const section = document.createElement("section");
  section.className = "agendaAutomationSection";
  section.innerHTML = `<div class="agendaAutomationHead"><div class="agendaAutomationTitle"><span class="agendaAutomationIcon">⚡</span><div><h3>Automação da agenda</h3><p>Defina os padrões de confirmação, lembretes, avisos e pós-atendimento desta agenda.</p></div></div><span class="agendaAutomationStage">Configuração segura</span></div><div class="agendaAutomationNotice"><strong>Ao salvar uma alteração, os disparos pendentes anteriores serão cancelados.</strong> O sistema criará novos agendamentos com os horários atualizados. Execuções já concluídas permanecerão somente no histórico.</div><div class="agendaAutomationGrid">${cardHtml({ key: "confirmacao", title: "Confirmação do agendamento", timing: "Antes do início", channels: '<label class="agendaAutomationCheck"><input type="checkbox" data-channel="whatsapp" checked/>WhatsApp</label><label class="agendaAutomationCheck"><input type="checkbox" data-channel="email"/>E-mail</label>', extras: '<div class="agendaAutomationWhatsApp"><label class="agendaAutomationField"><span>Integração do WhatsApp</span><select data-role="integration"><option value="">Selecione</option></select></label><label class="agendaAutomationField"><span>Template Utility</span><select data-role="template"><option value="">Selecione</option></select></label><div class="agendaAutomationCompatibility" data-role="compatibility">Selecione um template com botões Confirmar, Cancelar e Reagendar.</div></div>' })}${cardHtml({ key: "lembrete", title: "Lembrete do agendamento", timing: "Antes do início", channels: '<label class="agendaAutomationCheck"><input type="checkbox" data-channel="whatsapp" checked/>WhatsApp</label><label class="agendaAutomationCheck"><input type="checkbox" data-channel="email"/>E-mail</label>', extras: '<div class="agendaAutomationWhatsApp"><label class="agendaAutomationField"><span>Integração do WhatsApp</span><select data-role="integration"><option value="">Selecione</option></select></label><label class="agendaAutomationField"><span>Template Utility</span><select data-role="template"><option value="">Selecione</option></select></label><div class="agendaAutomationCompatibility" data-role="compatibility">Selecione o template que será usado no lembrete.</div></div>' })}${cardHtml({ key: "aviso_responsavel", title: "Aviso ao responsável", timing: "Antes do início", channels: '<label class="agendaAutomationCheck"><input type="checkbox" data-channel="sistema" checked/>Notificação no sistema</label><label class="agendaAutomationCheck"><input type="checkbox" data-channel="email"/>E-mail</label>' })}${cardHtml({ key: "pos_atendimento", title: "Pós-atendimento", timing: "Depois do término", channels: '<label class="agendaAutomationCheck"><input type="radio" name="agenda-pos-atendimento-canal" data-channel="fluxo" checked/>Iniciar fluxo</label><label class="agendaAutomationCheck"><input type="radio" name="agenda-pos-atendimento-canal" data-channel="whatsapp"/>Disparo pelo WhatsApp</label>', extras: '<label class="agendaAutomationField"><span>Fluxo que será iniciado</span><select data-role="flow"><option value="">Selecione um fluxo</option></select></label><div class="agendaAutomationFlowNotice"><strong>Importante sobre o fluxo automático</strong>O fluxo só poderá iniciar se existir uma conversa ativa e a janela de atendimento de 24 horas da Meta ainda estiver aberta. Para executar o pós-atendimento horas ou dias depois, use o disparo por template do WhatsApp.</div><div class="agendaAutomationWhatsApp"><label class="agendaAutomationField"><span>Integração do WhatsApp</span><select data-role="integration"><option value="">Selecione</option></select></label><label class="agendaAutomationField"><span>Template do pós-atendimento</span><select data-role="template"><option value="">Selecione</option></select></label><div class="agendaAutomationCompatibility" data-role="compatibility">Selecione o template aprovado que será enviado após o atendimento.</div></div>' })}</div><div class="agendaAutomationError" data-role="error"></div><div class="agendaAutomationSaving" data-role="saving">Salvando configurações de automação…</div>`;
  return section;
}

function preencherOpcoes(section: HTMLElement, opcoes: Opcoes) {
  section.querySelectorAll<HTMLSelectElement>('select[data-role="integration"]').forEach((select) => {
    const atual = select.value;
    select.replaceChildren(option("", "Selecione"));
    opcoes.integracoes.forEach((item) => select.appendChild(option(item.id, item.nome_conexao || "WhatsApp")));
    select.value = atual;
  });
  const flow = section.querySelector<HTMLSelectElement>('[data-rule="pos_atendimento"] select[data-role="flow"]');
  if (flow) {
    const atual = flow.value;
    flow.replaceChildren(option("", "Selecione um fluxo"));
    opcoes.fluxos.forEach((item) => flow.appendChild(option(item.id, `${item.nome}${item.status !== "ativo" ? ` · ${item.status}` : ""}`)));
    flow.value = atual;
  }
}

function atualizarTemplates(card: HTMLElement, opcoes: Opcoes, selected = "") {
  const integration = card.querySelector<HTMLSelectElement>('select[data-role="integration"]');
  const template = card.querySelector<HTMLSelectElement>('select[data-role="template"]');
  if (!integration || !template) return;
  const atual = selected || template.value;
  template.replaceChildren(option("", "Selecione"));
  opcoes.templates
    .filter((item) => !integration.value || item.integracao_whatsapp_id === integration.value)
    .forEach((item) => template.appendChild(option(item.id, `${item.nome} · ${item.idioma}`)));
  template.value = atual;
  atualizarCompatibilidade(card, opcoes);
}

function atualizarCompatibilidade(card: HTMLElement, opcoes: Opcoes) {
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

function aplicarCanalPosAtendimento(section: HTMLElement) {
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

function aplicarRegras(section: HTMLElement, regras: Regra[], opcoes: Opcoes) {
  const tipos: Regra["tipo"][] = ["confirmacao", "lembrete", "aviso_responsavel", "pos_atendimento"];
  tipos.forEach((tipo) => {
    const card = section.querySelector<HTMLElement>(`[data-rule="${tipo}"]`);
    if (!card) return;
    const encontradas = regras.filter((item) => item.tipo === tipo);
    const principal = encontradas[0];
    if (!principal) return;
    const active = encontradas.some((item) => item.ativo);
    const enabled = card.querySelector<HTMLInputElement>('[data-role="enabled"]');
    if (enabled) enabled.checked = active;
    const decomposed = decomporMinutos(principal.antecedencia_minutos);
    const amount = card.querySelector<HTMLInputElement>('[data-role="amount"]');
    const unit = card.querySelector<HTMLSelectElement>('[data-role="unit"]');
    if (amount) amount.value = String(decomposed.valor);
    if (unit) unit.value = decomposed.unidade;
    card.querySelectorAll<HTMLInputElement>('[data-channel]').forEach((input) => {
      input.checked = encontradas.some((item) => item.canal === input.dataset.channel);
    });
    const whatsapp = encontradas.find((item) => item.canal === "whatsapp");
    const integration = card.querySelector<HTMLSelectElement>('[data-role="integration"]');
    if (integration) integration.value = whatsapp?.integracao_whatsapp_id || "";
    atualizarTemplates(card, opcoes, whatsapp?.whatsapp_template_id || "");
    const flow = card.querySelector<HTMLSelectElement>('[data-role="flow"]');
    if (flow) flow.value = encontradas.find((item) => item.canal === "fluxo")?.fluxo_id || "";
  });
  aplicarEstadoVisual(section);
}

function serializar(section: HTMLElement) {
  const regras: Regra[] = [];
  section.querySelectorAll<HTMLElement>(".agendaAutomationCard").forEach((card) => {
    const tipo = card.dataset.rule as Regra["tipo"];
    const ativo = card.querySelector<HTMLInputElement>('[data-role="enabled"]')?.checked === true;
    const amount = Number(card.querySelector<HTMLInputElement>('[data-role="amount"]')?.value || 0);
    const unit = card.querySelector<HTMLSelectElement>('[data-role="unit"]')?.value || "minutos";
    const antecedencia = Math.max(0, Math.round(minutos(Number.isFinite(amount) ? amount : 0, unit)));
    const integration = card.querySelector<HTMLSelectElement>('[data-role="integration"]')?.value || null;
    const template = card.querySelector<HTMLSelectElement>('[data-role="template"]')?.value || null;
    const flow = card.querySelector<HTMLSelectElement>('[data-role="flow"]')?.value || null;
    card.querySelectorAll<HTMLInputElement>('[data-channel]').forEach((input, ordem) => {
      if (!input.checked) return;
      regras.push({
        tipo,
        canal: input.dataset.channel as Regra["canal"],
        ativo,
        antecedencia_minutos: antecedencia,
        ordem,
        integracao_whatsapp_id: input.dataset.channel === "whatsapp" ? integration : null,
        whatsapp_template_id: input.dataset.channel === "whatsapp" ? template : null,
        fluxo_id: input.dataset.channel === "fluxo" ? flow : null,
        configuracao_json: { etapa: 2, execucao_habilitada: false },
      });
    });
  });
  return regras;
}

function validar(section: HTMLElement, regras: Regra[]) {
  const nomes = {
    confirmacao: "Confirmação do agendamento",
    lembrete: "Lembrete do agendamento",
    aviso_responsavel: "Aviso ao responsável",
    pos_atendimento: "Pós-atendimento",
  } as const;

  for (const tipo of ["confirmacao", "lembrete", "aviso_responsavel", "pos_atendimento"] as const) {
    const card = section.querySelector<HTMLElement>(`[data-rule="${tipo}"]`);
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

async function salvar(agendaId: string, regras: Regra[]) {
  const response = await fetch(`/api/agendas/${encodeURIComponent(agendaId)}/automacoes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regras }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || "Não foi possível salvar as automações.");
}

export default function AgendaAutomationEnhancer() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shell) return;
    let disposed = false;
    let options: Opcoes | null = null;
    let optionsPromise: Promise<Opcoes> | null = null;
    let frame = 0;

    let style = document.getElementById(STYLE_ID);
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const agendaSelecionada = () => shell.querySelector<HTMLSelectElement>(".a2 .head select.select")?.value || "";
    const carregarOpcoes = () => {
      if (options) return Promise.resolve(options);
      if (!optionsPromise) {
        optionsPromise = fetch("/api/agendas/automacoes/opcoes", { cache: "no-store" })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar opções.");
            options = { integracoes: data.integracoes || [], templates: data.templates || [], fluxos: data.fluxos || [] };
            return options;
          })
          .finally(() => { optionsPromise = null; });
      }
      return optionsPromise;
    };

    const mostrarErro = (section: HTMLElement, message: string) => {
      const error = section.querySelector<HTMLElement>('[data-role="error"]');
      if (!error) return;
      error.textContent = message;
      error.classList.toggle("show", Boolean(message));
    };

    const aguardarNovaAgenda = (previousId: string, regras: Regra[]) => {
      const started = Date.now();
      const timer = window.setInterval(async () => {
        const id = agendaSelecionada();
        if (id && id !== previousId) {
          window.clearInterval(timer);
          window.sessionStorage.removeItem(PENDING_KEY);
          try { await salvar(id, regras); }
          catch (error) { console.error("[AGENDA_AUTOMACOES] Agenda criada, mas regras não foram salvas:", error); }
        } else if (Date.now() - started > 20_000) {
          window.clearInterval(timer);
        }
      }, 250);
    };

    const bind = async (modal: HTMLElement) => {
      const title = texto(modal.querySelector(".dhead h2"));
      const normalizedTitle = normalizar(title);
      const isEdit =
        normalizedTitle.includes("configurar agenda") ||
        normalizedTitle.includes("configurar calendario");
      const isNew =
        normalizedTitle.includes("nova agenda") ||
        normalizedTitle.includes("novo calendario");
      if (!isEdit && !isNew) return;
      const body = modal.querySelector<HTMLElement>(".body");
      const form = modal.querySelector<HTMLElement>(".body > .form");
      if (!body || !form) return;
      const agendaId = isEdit ? agendaSelecionada() : "";
      let section = modal.querySelector<HTMLElement>(".agendaAutomationSection");
      if (section && section.dataset.agendaId === agendaId && section.dataset.mode === (isEdit ? "edit" : "new")) return;
      section?.remove();
      section = criarSecao();
      section.dataset.agendaId = agendaId;
      section.dataset.mode = isEdit ? "edit" : "new";
      const availability = modal.querySelector<HTMLElement>(".availability");
      if (availability) availability.insertAdjacentElement("afterend", section);
      else body.appendChild(section);

      try {
        const loadedOptions = await carregarOpcoes();
        if (disposed || !section.isConnected) return;
        preencherOpcoes(section, loadedOptions);
        section.querySelectorAll<HTMLElement>(".agendaAutomationCard").forEach((card) => {
          card.querySelector<HTMLInputElement>('[data-role="enabled"]')?.addEventListener("change", () => aplicarEstadoVisual(section!));
          card.querySelectorAll<HTMLInputElement>('[data-channel]').forEach((input) => {
            input.addEventListener("change", () => aplicarEstadoVisual(section!));
          });
          const integration = card.querySelector<HTMLSelectElement>('[data-role="integration"]');
          const template = card.querySelector<HTMLSelectElement>('[data-role="template"]');
          integration?.addEventListener("change", () => atualizarTemplates(card, loadedOptions));
          template?.addEventListener("change", () => atualizarCompatibilidade(card, loadedOptions));
          if (integration) atualizarTemplates(card, loadedOptions);
        });

        if (isEdit && agendaId) {
          const response = await fetch(`/api/agendas/${encodeURIComponent(agendaId)}/automacoes`, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar regras.");
          aplicarRegras(section, data.regras || [], loadedOptions);
        } else {
          aplicarEstadoVisual(section);
        }
      } catch (error) {
        mostrarErro(section, error instanceof Error ? error.message : "Erro ao preparar automações.");
      }

      const saveButton = Array.from(modal.querySelectorAll<HTMLButtonElement>(".foot button")).find((button) => normalizar(texto(button)) === "salvar");
      if (!saveButton || saveButton.dataset.automationStage2Bound === "true") return;
      saveButton.dataset.automationStage2Bound = "true";
      saveButton.addEventListener("click", async (event) => {
        if (saveButton.dataset.automationBypass === "true") {
          delete saveButton.dataset.automationBypass;
          return;
        }
        const currentSection = modal.querySelector<HTMLElement>(".agendaAutomationSection");
        if (!currentSection) return;
        const regras = serializar(currentSection);
        const validation = validar(currentSection, regras);
        mostrarErro(currentSection, validation);
        if (validation) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }

        if (isNew) {
          window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(regras));
          aguardarNovaAgenda(agendaSelecionada(), regras);
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        const saving = currentSection.querySelector<HTMLElement>('[data-role="saving"]');
        saving?.classList.add("show");
        saveButton.disabled = true;
        try {
          await salvar(agendaId, regras);
          saveButton.dataset.automationBypass = "true";
          saveButton.disabled = false;
          saveButton.click();
        } catch (error) {
          saveButton.disabled = false;
          mostrarErro(currentSection, error instanceof Error ? error.message : "Erro ao salvar automações.");
        } finally {
          saving?.classList.remove("show");
        }
      }, true);
    };

    const apply = () => {
      frame = 0;
      if (disposed) return;
      const modal = shell.querySelector<HTMLElement>(".a2 .modalbg .modal");
      if (modal) void bind(modal);
    };
    const schedule = () => {
      if (!frame && !disposed) frame = window.requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(shell, { childList: true, subtree: true, characterData: true });
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
