"use client";

import { useEffect } from "react";
import AgendaTemplateMappingEnhancer from "./AgendaTemplateMappingEnhancer";

const STYLE_ID = "agenda-automation-stage13-runtime";
const NOTICE_TEXT =
  "As ações ativas serão planejadas no horário configurado e poderão ser acompanhadas e canceladas em ";
const TEMPLATE_HELP_TEXT =
  "Selecione um template aprovado pela Meta. Templates Utility e Marketing podem ser usados; a categoria final, as variáveis e os botões serão validados antes de salvar.";

const CSS = `
.agendaAutomationSection.isRuntimeActive{border-color:color-mix(in srgb,var(--crm-success-border) 78%,var(--crm-border));padding:18px}
.agendaAutomationSection.isRuntimeActive:before{background:linear-gradient(90deg,var(--crm-success-strong),color-mix(in srgb,var(--crm-primary-strong) 65%,var(--crm-success-strong)))}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:18px!important;line-height:1.3!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:13px!important;line-height:1.55!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationStage{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:11.5px!important;padding:6px 10px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationNotice{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:13px!important;line-height:1.6!important;padding:12px 14px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationGrid{gap:14px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:16px!important;gap:14px!important;transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive{border-color:var(--crm-success-border)!important;background:linear-gradient(145deg,var(--crm-success-bg),color-mix(in srgb,var(--crm-success-bg) 60%,var(--crm-surface)))!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crm-success-strong) 24%,transparent),0 8px 20px color-mix(in srgb,var(--crm-success-strong) 8%,transparent)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationCardHead strong,.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationSwitch{color:var(--crm-success-text)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCardHead strong{font-size:15px!important;line-height:1.4!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSwitch{font-size:12px!important;gap:8px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField>span{font-size:11.5px!important;line-height:1.4!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField input,.agendaAutomationSection.isRuntimeActive .agendaAutomationField select{height:42px!important;font-size:13px!important;padding:0 12px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCheck{font-size:12px!important;gap:7px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationChannels{margin-bottom:12px!important;row-gap:9px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationWhatsApp{margin-top:3px!important;row-gap:10px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCompatibility{font-size:12.5px!important;line-height:1.6!important;min-height:26px!important;margin-top:3px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationError{font-size:12.5px!important;line-height:1.55!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSaving{font-size:12px!important}
.agendaTemplateMappingPanel{padding:16px!important;gap:14px!important;border-radius:16px!important}
.agendaTemplateMappingHead{gap:12px!important}.agendaTemplateMappingHead strong{font-size:14px!important;line-height:1.4!important}.agendaTemplateMappingHead p{font-size:11.5px!important;line-height:1.55!important;margin-top:4px!important}
.agendaTemplateCategory{font-size:10.5px!important;padding:5px 9px!important}
.agendaTemplateMappingTitle{font-size:13px!important;line-height:1.4!important}
.agendaTemplateVariables,.agendaTemplateButtons{gap:11px!important}
.agendaTemplateVariableRow,.agendaTemplateButtonRow{gap:9px!important}
.agendaTemplateToken{height:40px!important;font-size:11.5px!important}
.agendaTemplateMappingPanel label{gap:5px!important}.agendaTemplateMappingPanel label>span,.agendaTemplateButtonRow>div>span{font-size:11px!important;line-height:1.35!important;margin-bottom:5px!important}
.agendaTemplateMappingPanel select,.agendaTemplateMappingPanel input[type="text"]{height:40px!important;padding:0 10px!important;font-size:12.5px!important}
.agendaTemplateButtonText{height:40px!important;padding:0 10px!important;font-size:12px!important}
.agendaTemplateMarketingAck{padding:11px 12px!important;gap:10px!important;font-size:11.5px!important;line-height:1.6!important}
.agendaTemplateMarketingAck input{width:16px!important;height:16px!important;margin-top:2px!important;flex:0 0 auto!important}
.agendaTemplateMappingEmpty{font-size:12px!important;line-height:1.55!important;padding:10px!important}
.agendaTemplatePreviewHeader{padding:11px 13px!important}.agendaTemplatePreviewHeader span{font-size:11.5px!important}.agendaTemplatePreviewHeader small{font-size:10.5px!important}
.agendaTemplatePreviewArea{padding:18px!important}.agendaTemplatePreviewBubble{padding:14px 14px 10px!important}.agendaTemplatePreviewBubble pre{font-size:12.5px!important;line-height:1.68!important}.agendaTemplatePreviewMeta{font-size:10px!important;margin-top:10px!important}
.agendaTemplateHelpTitle{display:inline-flex!important;align-items:center;gap:6px;position:relative;overflow:visible}
.agendaTemplateHelp{position:relative;display:inline-flex;align-items:center;justify-content:center}
.agendaTemplateHelpButton{width:18px;height:18px;padding:0;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);font-family:inherit;font-size:11px;font-weight:900;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:help}
.agendaTemplateHelpBubble{position:absolute;z-index:40;top:calc(100% + 8px);right:-8px;width:310px;max-width:min(310px,76vw);padding:11px 12px;border:1px solid var(--crm-border-strong);border-radius:11px;background:var(--crm-text-strong);color:var(--crm-text-inverse);box-shadow:0 14px 34px color-mix(in srgb,var(--crm-text-strong) 26%,transparent);font-size:12px!important;font-weight:650!important;line-height:1.55!important;text-align:left;white-space:normal;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-4px);transition:.16s ease}
.agendaTemplateHelp:hover .agendaTemplateHelpBubble,.agendaTemplateHelp:focus-within .agendaTemplateHelpBubble{opacity:1;visibility:visible;transform:translateY(0)}
@media(max-width:760px){.agendaAutomationSection.isRuntimeActive{padding:14px}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:17px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:12.5px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:14px!important}.agendaTemplateMappingPanel{padding:13px!important}.agendaTemplatePreviewArea{padding:13px!important}}
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

function applyRuntimeStatus(section: HTMLElement) {
  section.classList.add("isRuntimeActive");
  applyTemplateHelp(section);
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
