"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-automation-stage13-runtime";
const NOTICE_TEXT =
  "As ações ativas serão planejadas no horário configurado e poderão ser acompanhadas e canceladas em ";
const TEMPLATE_HELP_TEXT =
  "Selecione um template aprovado pela Meta. Templates Utility e Marketing podem ser usados; a categoria final, as variáveis e os botões serão validados antes de salvar.";

const VARIABLE_CATEGORY_LABELS = new Set([
  "PERSONALIZADA",
  "PERSONALIZADAS",
  "NOME E NÚMERO",
  "NOME E NUMERO",
  "DADOS DO CALENDÁRIO",
  "DADOS DO CALENDARIO",
  "DATA E CALENDÁRIO",
  "DATA E CALENDARIO",
  "VARIÁVEIS FIXAS DO SISTEMA",
  "VARIAVEIS FIXAS DO SISTEMA",
]);

const VARIABLE_BADGE_LABELS = new Set([
  "PERSONALIZADA",
  "NOME E NÚMERO",
  "NOME E NUMERO",
  "CALENDÁRIO",
  "CALENDARIO",
  "FIXA",
  "SISTEMA",
]);

const VARIABLES_MODAL_SECTION_TITLES = new Set([
  "NOVA VARIAVEL PERSONALIZADA",
  "VARIAVEIS CADASTRADAS",
  "VARIAVEIS FIXAS DO SISTEMA",
]);

const CSS = `
.agendaAutomationSection.isRuntimeActive{border-color:color-mix(in srgb,var(--crm-success-border) 78%,var(--crm-border));padding:19px}
.agendaAutomationSection.isRuntimeActive:before{background:linear-gradient(90deg,var(--crm-success-strong),color-mix(in srgb,var(--crm-primary-strong) 65%,var(--crm-success-strong)))}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:20px!important;line-height:1.3!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:14px!important;line-height:1.6!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationStage{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:12.5px!important;padding:7px 11px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationNotice{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:14px!important;line-height:1.65!important;padding:13px 15px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationGrid{gap:15px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:18px!important;gap:15px!important;transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive{border-color:var(--crm-success-border)!important;background:linear-gradient(145deg,var(--crm-success-bg),color-mix(in srgb,var(--crm-success-bg) 60%,var(--crm-surface)))!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crm-success-strong) 24%,transparent),0 8px 20px color-mix(in srgb,var(--crm-success-strong) 8%,transparent)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationCardHead strong,.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationSwitch{color:var(--crm-success-text)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCardHead strong{font-size:16.5px!important;line-height:1.45!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSwitch{font-size:13px!important;gap:9px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField>span{font-size:12.5px!important;line-height:1.45!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField input,.agendaAutomationSection.isRuntimeActive .agendaAutomationField select{height:44px!important;font-size:14px!important;padding:0 13px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCheck{font-size:13px!important;gap:8px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationChannels{margin-top:11px!important;margin-bottom:13px!important;row-gap:10px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationWhatsApp{margin-top:4px!important;row-gap:11px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCompatibility{font-size:13.5px!important;line-height:1.65!important;min-height:28px!important;margin-top:4px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationError{font-size:13.5px!important;line-height:1.6!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSaving{font-size:13px!important}
.agendaTemplateMappingPanel{padding:18px!important;gap:15px!important;border-radius:17px!important}
.agendaTemplateMappingHead{gap:13px!important}.agendaTemplateMappingHead strong{font-size:15px!important;line-height:1.45!important}.agendaTemplateMappingHead p{font-size:12.5px!important;line-height:1.6!important;margin-top:5px!important}
.agendaTemplateCategory{font-size:11.5px!important;padding:6px 10px!important}
.agendaTemplateMappingTitle{font-size:14px!important;line-height:1.45!important}
.agendaTemplateVariables,.agendaTemplateButtons{gap:12px!important}
.agendaTemplateVariableRow,.agendaTemplateButtonRow{gap:10px!important}
.agendaTemplateToken{height:43px!important;font-size:12.5px!important}
.agendaTemplateMappingPanel label{gap:6px!important}.agendaTemplateMappingPanel label>span,.agendaTemplateButtonRow>div>span{font-size:12px!important;line-height:1.4!important;margin-bottom:6px!important}
.agendaTemplateCrmSourceField>span{font-size:14px!important;line-height:1.45!important;font-weight:900!important;color:var(--crm-text-strong)!important}
.agendaTemplateCrmSourceField select[data-map="source"]{height:50px!important;font-size:14.5px!important;font-weight:750!important}
.agendaTemplateMappingPanel select,.agendaTemplateMappingPanel input[type="text"]{height:43px!important;padding:0 11px!important;font-size:13.5px!important}
.agendaTemplateButtonText{height:43px!important;padding:0 11px!important;font-size:13px!important}
.agendaTemplateMarketingAck{padding:12px 13px!important;gap:11px!important;font-size:12.5px!important;line-height:1.65!important}
.agendaTemplateMarketingAck input{width:17px!important;height:17px!important;margin-top:2px!important;flex:0 0 auto!important}
.agendaTemplateMappingEmpty{font-size:13px!important;line-height:1.6!important;padding:11px!important}
.agendaTemplatePreviewHeader{padding:12px 14px!important}.agendaTemplatePreviewHeader span{font-size:12.5px!important}.agendaTemplatePreviewHeader small{font-size:11.5px!important}
.agendaTemplatePreviewArea{padding:19px!important}.agendaTemplatePreviewBubble{padding:15px 15px 11px!important}.agendaTemplatePreviewBubble pre{font-size:13.5px!important;line-height:1.72!important}.agendaTemplatePreviewMeta{font-size:11px!important;margin-top:11px!important}
.agendaVariableDropdownPortal{font-size:14px!important}
.agendaVariableDropdownPortal input[placeholder="Buscar variável"]{height:42px!important;padding:0 12px!important;font-size:13.5px!important;line-height:1.4!important}
.agendaVariableDropdownPortal .agendaVariableDropdownCategory{font-size:11.5px!important;line-height:1.4!important;font-weight:900!important;letter-spacing:.045em!important;margin:10px 0 6px!important}
.agendaVariableDropdownPortal .agendaVariableDropdownOption{min-height:64px!important;padding:10px 12px!important;gap:5px!important}
.agendaVariableDropdownPortal .agendaVariableDropdownName{font-size:14.5px!important;line-height:1.4!important;font-weight:900!important;color:var(--crm-text-strong)!important}
.agendaVariableDropdownPortal .agendaVariableDropdownDescription{font-size:12.5px!important;line-height:1.48!important;font-weight:600!important;color:var(--crm-text-muted)!important}
.agendaVariableDropdownPortal .agendaVariableDropdownBadge{font-size:10.5px!important;line-height:1.2!important;font-weight:850!important;padding:4px 7px!important;min-height:20px!important}
.agendaVariablesCreateModal{font-size:13.5px!important;line-height:1.5!important}
.agendaVariablesCreateModal .dhead{padding:20px 22px 17px!important;gap:14px!important}
.agendaVariablesCreateModal .body{padding:20px 22px 24px!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalTitle,.agendaVariablesCreateModal .dhead h1,.agendaVariablesCreateModal .dhead h2{font-size:22px!important;line-height:1.25!important;font-weight:900!important;color:var(--crm-text-strong)!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalSubtitle,.agendaVariablesCreateModal .dhead p{font-size:13.5px!important;line-height:1.55!important;color:var(--crm-text-muted)!important;margin-top:5px!important}
.agendaVariablesCreateModal .section{padding:18px!important;margin-bottom:15px!important;border-radius:14px!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalSectionTitle,.agendaVariablesCreateModal .section h3{font-size:15.5px!important;line-height:1.4!important;font-weight:900!important;margin-bottom:13px!important;color:var(--crm-text-strong)!important}
.agendaVariablesCreateModal .form{gap:13px!important}
.agendaVariablesCreateModal .field{gap:7px!important}
.agendaVariablesCreateModal .field label,.agendaVariablesCreateModal label{font-size:13px!important;line-height:1.4!important;font-weight:850!important;color:var(--crm-text-strong)!important}
.agendaVariablesCreateModal input,.agendaVariablesCreateModal select,.agendaVariablesCreateModal textarea{font-size:14px!important;line-height:1.45!important;border-radius:10px!important;padding:10px 12px!important}
.agendaVariablesCreateModal input,.agendaVariablesCreateModal select{height:44px!important}
.agendaVariablesCreateModal textarea{min-height:86px!important;resize:vertical!important}
.agendaVariablesCreateModal input::placeholder,.agendaVariablesCreateModal textarea::placeholder{font-size:13.5px!important;color:var(--crm-text-muted)!important}
.agendaVariablesCreateModal .btn,.agendaVariablesCreateModal button{min-height:40px!important;padding:0 14px!important;font-size:13px!important;line-height:1.3!important;font-weight:850!important;border-radius:10px!important}
.agendaVariablesCreateModal .item{padding:13px!important;margin-top:10px!important;border-radius:12px!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalVariableName{font-size:14.5px!important;line-height:1.4!important;font-weight:900!important;color:var(--crm-text-strong)!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalDetail,.agendaVariablesCreateModal small,.agendaVariablesCreateModal p{font-size:12.75px!important;line-height:1.55!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalHint{font-size:13px!important;line-height:1.55!important;padding:11px 13px!important}
.agendaVariablesCreateModal .agendaVariablesCreateModalCard{padding:13px 14px!important;min-height:62px!important;border-radius:12px!important}
.agendaVariablesCreateModal .foot{padding:15px 22px!important}
.agendaTemplateHelpTitle{display:inline-flex!important;align-items:center;gap:7px;position:relative;overflow:visible}
.agendaTemplateHelp{position:relative;display:inline-flex;align-items:center;justify-content:center}
.agendaTemplateHelpButton{width:19px;height:19px;padding:0;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);font-family:inherit;font-size:11.5px;font-weight:900;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:help}
.agendaTemplateHelpBubble{position:absolute;z-index:40;top:calc(100% + 8px);right:-8px;width:320px;max-width:min(320px,78vw);padding:12px 13px;border:1px solid var(--crm-border-strong);border-radius:11px;background:var(--crm-text-strong);color:var(--crm-text-inverse);box-shadow:0 14px 34px color-mix(in srgb,var(--crm-text-strong) 26%,transparent);font-size:12.5px!important;font-weight:650!important;line-height:1.6!important;text-align:left;white-space:normal;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-4px);transition:.16s ease}
.agendaTemplateHelp:hover .agendaTemplateHelpBubble,.agendaTemplateHelp:focus-within .agendaTemplateHelpBubble{opacity:1;visibility:visible;transform:translateY(0)}
.agendaAutomationGrid{grid-template-columns:minmax(0,1fr)!important}.agendaAutomationCard{min-width:0!important}
@media(max-width:760px){.agendaAutomationSection.isRuntimeActive{padding:15px}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:18px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:13.5px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:15px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationCardHead strong{font-size:15.5px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationField input,.agendaAutomationSection.isRuntimeActive .agendaAutomationField select{font-size:13.5px!important}.agendaTemplateMappingPanel{padding:14px!important}.agendaTemplatePreviewArea{padding:14px!important}.agendaTemplatePreviewBubble pre{font-size:13px!important}.agendaTemplateCrmSourceField>span{font-size:13.5px!important}.agendaVariableDropdownPortal .agendaVariableDropdownName{font-size:14px!important}.agendaVariableDropdownPortal .agendaVariableDropdownDescription{font-size:12px!important}.agendaVariablesCreateModal .dhead{padding:17px 17px 14px!important}.agendaVariablesCreateModal .body{padding:16px 17px 20px!important}.agendaVariablesCreateModal .agendaVariablesCreateModalTitle,.agendaVariablesCreateModal .dhead h1,.agendaVariablesCreateModal .dhead h2{font-size:20px!important}.agendaVariablesCreateModal .section{padding:15px!important}.agendaVariablesCreateModal .form{grid-template-columns:1fr!important}.agendaVariablesCreateModal input,.agendaVariablesCreateModal select,.agendaVariablesCreateModal textarea{font-size:13.5px!important}}
`;

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function applyTemplateHelp(section: HTMLElement) {
  section
    .querySelectorAll<HTMLElement>(".agendaAutomationField > span")
    .forEach((label, index) => {
      if (label.dataset.templateHelpApplied === "true") return;
      if (!["Template Utility", "Template aprovado"].includes(label.textContent?.trim() || "")) return;
      const help = document.createElement("span");
      help.className = "agendaTemplateHelp";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "agendaTemplateHelpButton";
      button.textContent = "?";
      button.setAttribute("aria-label", "Orientação sobre templates da agenda");
      const bubble = document.createElement("span");
      const tooltipId = `agenda-template-help-${index}-${Date.now()}`;
      bubble.id = tooltipId;
      bubble.className = "agendaTemplateHelpBubble";
      bubble.setAttribute("role", "tooltip");
      bubble.textContent = TEMPLATE_HELP_TEXT;
      button.setAttribute("aria-describedby", tooltipId);
      help.append(button, bubble);
      label.classList.add("agendaTemplateHelpTitle");
      label.appendChild(help);
      label.dataset.templateHelpApplied = "true";
    });
}

function applyCrmSourceTypography(section: HTMLElement) {
  section
    .querySelectorAll<HTMLElement>(".agendaTemplateVariableRow label")
    .forEach((label) => {
      const title = label.querySelector<HTMLElement>(":scope > span");
      if (title?.textContent?.trim() === "Informação do CRM") {
        label.classList.add("agendaTemplateCrmSourceField");
      }
    });
}

function findVariablePortal(input: HTMLInputElement) {
  let current: HTMLElement | null = input.parentElement;
  let fallback: HTMLElement | null = current;
  for (let level = 0; current && level < 8; level += 1) {
    fallback = current;
    const content = normalizedText(current.textContent || "");
    if (
      content.includes("PERSONALIZADA") ||
      content.includes("NOME E NUMERO") ||
      content.includes("VARIAVEIS FIXAS")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return fallback;
}

function markVariableOption(nameElement: HTMLElement) {
  let row = nameElement.closest<HTMLElement>('button,[role="option"],[data-value]');
  if (!row) {
    let current: HTMLElement | null = nameElement.parentElement;
    for (let level = 0; current && level < 4; level += 1) {
      const text = current.textContent?.trim() || "";
      if (text.includes(nameElement.textContent?.trim() || "") && text.length < 260) row = current;
      if (current.parentElement?.classList.contains("agendaVariableDropdownPortal")) break;
      current = current.parentElement;
    }
  }
  row?.classList.add("agendaVariableDropdownOption");
}

function applyVariableDropdownTypography(root: ParentNode) {
  const inputs: HTMLInputElement[] = [];
  if (root instanceof HTMLInputElement && root.placeholder === "Buscar variável") inputs.push(root);
  root
    .querySelectorAll?.<HTMLInputElement>('input[placeholder="Buscar variável"]')
    .forEach((input) => inputs.push(input));

  for (const input of inputs) {
    const portal = findVariablePortal(input);
    if (!portal) continue;
    portal.classList.add("agendaVariableDropdownPortal");

    portal.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.children.length > 0) return;
      const text = element.textContent?.trim() || "";
      if (!text || text === "Buscar variável") return;
      const normalized = normalizedText(text);

      if (VARIABLE_CATEGORY_LABELS.has(normalized)) {
        element.classList.add("agendaVariableDropdownCategory");
        return;
      }
      if (/^\{\{[^{}]+\}\}$/.test(text)) {
        element.classList.add("agendaVariableDropdownName");
        markVariableOption(element);
        return;
      }
      if (VARIABLE_BADGE_LABELS.has(normalized)) {
        element.classList.add("agendaVariableDropdownBadge");
        return;
      }
      if (text.length >= 16) element.classList.add("agendaVariableDropdownDescription");
    });
  }
}

function findVariablesModal(title: HTMLElement) {
  let current: HTMLElement | null = title;
  let candidate: HTMLElement | null = null;
  for (let level = 0; current && level < 10; level += 1) {
    const content = normalizedText(current.textContent || "");
    if (
      content.includes("NOVA VARIAVEL PERSONALIZADA") &&
      content.includes("VARIAVEIS CADASTRADAS")
    ) {
      candidate = current;
      if (
        current.matches('[role="dialog"],.modal') ||
        current.parentElement?.classList.contains("modalbg")
      ) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return candidate;
}

function applyVariablesModalTypography(root: ParentNode) {
  const titles: HTMLElement[] = [];
  if (root instanceof HTMLElement && normalizedText(root.textContent || "") === "CRIAR VARIAVEIS") {
    titles.push(root);
  }
  root.querySelectorAll?.<HTMLElement>("h1,h2,h3,strong").forEach((element) => {
    if (normalizedText(element.textContent || "") === "CRIAR VARIAVEIS") titles.push(element);
  });

  for (const title of titles) {
    const modal = findVariablesModal(title);
    if (!modal) continue;
    modal.classList.add("agendaVariablesCreateModal");
    title.classList.add("agendaVariablesCreateModalTitle");

    modal.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.children.length > 0) return;
      const text = element.textContent?.trim() || "";
      if (!text) return;
      const normalized = normalizedText(text);

      if (VARIABLES_MODAL_SECTION_TITLES.has(normalized)) {
        element.classList.add("agendaVariablesCreateModalSectionTitle");
        return;
      }
      if (normalized.startsWith("CADASTRE VALORES GLOBAIS")) {
        element.classList.add("agendaVariablesCreateModalSubtitle");
        return;
      }
      if (/^\{\{[^{}]+\}\}$/.test(text)) {
        element.classList.add("agendaVariablesCreateModalVariableName");
        const card = element.closest<HTMLElement>(".item,li,article");
        card?.classList.add("agendaVariablesCreateModalCard");
        return;
      }
      if (normalized.startsWith("A VARIAVEL SERA USADA ASSIM")) {
        element.classList.add("agendaVariablesCreateModalHint");
        return;
      }
      if (
        normalized.startsWith("VALOR ATUAL") ||
        normalized.startsWith("NOME SALVO") ||
        normalized.startsWith("NUMERO OU TELEFONE") ||
        normalized.startsWith("EMAIL SALVO") ||
        text.length >= 18
      ) {
        element.classList.add("agendaVariablesCreateModalDetail");
      }
    });
  }
}

function applyRuntimeStatus(section: HTMLElement) {
  section.classList.add("isRuntimeActive");
  applyTemplateHelp(section);
  applyCrmSourceTypography(section);
  const badge = section.querySelector<HTMLElement>(".agendaAutomationStage");
  if (badge && badge.textContent !== "Automação ativa") badge.textContent = "Automação ativa";
  const notice = section.querySelector<HTMLElement>(".agendaAutomationNotice");
  if (!notice || notice.dataset.runtimeStatusApplied === "true") return;
  const title = document.createElement("strong");
  title.textContent = "Execução automática habilitada. ";
  const destination = document.createElement("strong");
  destination.textContent = "Disparos agendados";
  notice.replaceChildren(
    title,
    document.createTextNode(NOTICE_TEXT),
    destination,
    document.createTextNode(".")
  );
  notice.dataset.runtimeStatusApplied = "true";
}

function applyFromAddedNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  const ownerSection = node.closest<HTMLElement>(".agendaAutomationSection");
  if (ownerSection) applyRuntimeStatus(ownerSection);
  if (node.matches(".agendaAutomationSection")) applyRuntimeStatus(node);
  node.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach(applyRuntimeStatus);
  applyVariableDropdownTypography(node);
  applyVariablesModalTypography(node);
}


const CRM_CALENDAR_TERMINOLOGY_V1 = true;
const CALENDAR_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bNova agenda\b/g, "Novo calendário"],
  [/\bnova agenda\b/g, "novo calendário"],
  [/\bConfigurar agenda\b/g, "Configurar calendário"],
  [/\bconfigurar agenda\b/g, "configurar calendário"],
  [/\bCriar agenda\b/g, "Criar calendário"],
  [/\bcriar agenda\b/g, "criar calendário"],
  [/\bEditar agenda\b/g, "Editar calendário"],
  [/\beditar agenda\b/g, "editar calendário"],
  [/\bAgenda arquivada\b/g, "Calendário arquivado"],
  [/\bagenda arquivada\b/g, "calendário arquivado"],
  [/\bAgenda selecionada\b/g, "Calendário selecionado"],
  [/\bagenda selecionada\b/g, "calendário selecionado"],
  [/\bAgenda ativa\b/g, "Calendário ativo"],
  [/\bagenda ativa\b/g, "calendário ativo"],
  [/\bAgenda fixa\b/g, "Calendário fixo"],
  [/\bagenda fixa\b/g, "calendário fixo"],
  [/\bAgenda vinculada\b/g, "Calendário vinculado"],
  [/\bagenda vinculada\b/g, "calendário vinculado"],
  [/\bEsta agenda\b/g, "Este calendário"],
  [/\besta agenda\b/g, "este calendário"],
  [/\bUma agenda\b/g, "Um calendário"],
  [/\buma agenda\b/g, "um calendário"],
  [/\bDa agenda\b/g, "Do calendário"],
  [/\bda agenda\b/g, "do calendário"],
  [/\bNa agenda\b/g, "No calendário"],
  [/\bna agenda\b/g, "no calendário"],
  [/\bÀ agenda\b/g, "Ao calendário"],
  [/\bà agenda\b/g, "ao calendário"],
  [/\bPela agenda\b/g, "Pelo calendário"],
  [/\bpela agenda\b/g, "pelo calendário"],
  [/\bA agenda\b/g, "O calendário"],
  [/\ba agenda\b/g, "o calendário"],
  [/\bAgendas\b/g, "Calendários"],
  [/\bagendas\b/g, "calendários"],
  [/\bAgenda\b/g, "Calendário"],
  [/\bagenda\b/g, "calendário"],
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

export default function AgendaAutomationRuntimeStatus() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    if (style.textContent !== CSS) style.textContent = CSS;
    document.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach(applyRuntimeStatus);
    applyCalendarTerminology(document.body);
    applyVariableDropdownTypography(document);
    applyVariablesModalTypography(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          applyFromAddedNode(node);
          applyCalendarTerminology(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
