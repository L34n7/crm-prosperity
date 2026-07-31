"use client";

import { useEffect } from "react";
import AgendaTemplateMappingEnhancer from "./AgendaTemplateMappingEnhancer";

const STYLE_ID = "agenda-automation-stage13-runtime";
const NOTICE_TEXT =
  "As ações ativas serão planejadas no horário configurado e poderão ser acompanhadas e canceladas em ";
const TEMPLATE_HELP_TEXT =
  "Selecione um template aprovado pela Meta. Templates Utility e Marketing podem ser usados; a categoria final, as variáveis e os botões serão validados antes de salvar.";

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
.agendaTemplateCrmSourceField [role="combobox"],.agendaTemplateCrmSourceField button[aria-haspopup="listbox"]{width:100%!important;min-height:56px!important;height:auto!important;padding:8px 12px!important;text-align:left!important}
.agendaTemplateCrmSourceField [role="combobox"] strong,.agendaTemplateCrmSourceField [role="combobox"] b,.agendaTemplateCrmSourceField button[aria-haspopup="listbox"] strong,.agendaTemplateCrmSourceField button[aria-haspopup="listbox"] b{font-size:14.5px!important;line-height:1.35!important;font-weight:850!important}
.agendaTemplateCrmSourceField [role="combobox"] small,.agendaTemplateCrmSourceField [role="combobox"] p,.agendaTemplateCrmSourceField button[aria-haspopup="listbox"] small,.agendaTemplateCrmSourceField button[aria-haspopup="listbox"] p{font-size:12.5px!important;line-height:1.45!important;margin-top:3px!important}
.agendaTemplateCrmSourceField [role="combobox"] span,.agendaTemplateCrmSourceField button[aria-haspopup="listbox"] span{line-height:1.4!important}
.agendaTemplateMappingPanel select,.agendaTemplateMappingPanel input[type="text"]{height:43px!important;padding:0 11px!important;font-size:13.5px!important}
.agendaTemplateButtonText{height:43px!important;padding:0 11px!important;font-size:13px!important}
.agendaTemplateMarketingAck{padding:12px 13px!important;gap:11px!important;font-size:12.5px!important;line-height:1.65!important}
.agendaTemplateMarketingAck input{width:17px!important;height:17px!important;margin-top:2px!important;flex:0 0 auto!important}
.agendaTemplateMappingEmpty{font-size:13px!important;line-height:1.6!important;padding:11px!important}
.agendaTemplatePreviewHeader{padding:12px 14px!important}.agendaTemplatePreviewHeader span{font-size:12.5px!important}.agendaTemplatePreviewHeader small{font-size:11.5px!important}
.agendaTemplatePreviewArea{padding:19px!important}.agendaTemplatePreviewBubble{padding:15px 15px 11px!important}.agendaTemplatePreviewBubble pre{font-size:13.5px!important;line-height:1.72!important}.agendaTemplatePreviewMeta{font-size:11px!important;margin-top:11px!important}
.agendaTemplateHelpTitle{display:inline-flex!important;align-items:center;gap:7px;position:relative;overflow:visible}
.agendaTemplateHelp{position:relative;display:inline-flex;align-items:center;justify-content:center}
.agendaTemplateHelpButton{width:19px;height:19px;padding:0;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);font-family:inherit;font-size:11.5px;font-weight:900;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:help}
.agendaTemplateHelpBubble{position:absolute;z-index:40;top:calc(100% + 8px);right:-8px;width:320px;max-width:min(320px,78vw);padding:12px 13px;border:1px solid var(--crm-border-strong);border-radius:11px;background:var(--crm-text-strong);color:var(--crm-text-inverse);box-shadow:0 14px 34px color-mix(in srgb,var(--crm-text-strong) 26%,transparent);font-size:12.5px!important;font-weight:650!important;line-height:1.6!important;text-align:left;white-space:normal;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-4px);transition:.16s ease}
.agendaTemplateHelp:hover .agendaTemplateHelpBubble,.agendaTemplateHelp:focus-within .agendaTemplateHelpBubble{opacity:1;visibility:visible;transform:translateY(0)}
@media(max-width:760px){.agendaAutomationSection.isRuntimeActive{padding:15px}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:18px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:13.5px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:15px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationCardHead strong{font-size:15.5px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationField input,.agendaAutomationSection.isRuntimeActive .agendaAutomationField select{font-size:13.5px!important}.agendaTemplateMappingPanel{padding:14px!important}.agendaTemplatePreviewArea{padding:14px!important}.agendaTemplatePreviewBubble pre{font-size:13px!important}.agendaTemplateCrmSourceField>span{font-size:13.5px!important}.agendaTemplateCrmSourceField [role="combobox"],.agendaTemplateCrmSourceField button[aria-haspopup="listbox"]{min-height:54px!important}}
`;

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
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach(applyFromAddedNode);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return <AgendaTemplateMappingEnhancer />;
}
