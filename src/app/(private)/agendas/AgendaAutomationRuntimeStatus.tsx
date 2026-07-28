"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-automation-stage13-runtime";
const NOTICE_TEXT =
  "As ações ativas serão planejadas no horário configurado e poderão ser acompanhadas e canceladas em ";
const TEMPLATE_HELP_TEXT =
  "Crie um template Utility aprovado pela Meta para solicitar a confirmação do agendamento ou enviar lembretes. Para confirmação, inclua os botões Confirmar, Cancelar e Reagendar.";

const CSS = `
.agendaAutomationSection.isRuntimeActive{border-color:color-mix(in srgb,var(--crm-success-border) 78%,var(--crm-border));padding:18px}
.agendaAutomationSection.isRuntimeActive:before{background:linear-gradient(90deg,var(--crm-success-strong),color-mix(in srgb,var(--crm-primary-strong) 65%,var(--crm-success-strong)))}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:17px!important;line-height:1.25!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:12.5px!important;line-height:1.5!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationStage{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:10.5px!important;padding:6px 10px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationNotice{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:12px!important;line-height:1.55!important;padding:11px 13px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationGrid{gap:12px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:14px!important;gap:12px!important;transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive{border-color:var(--crm-success-border)!important;background:linear-gradient(145deg,var(--crm-success-bg),color-mix(in srgb,var(--crm-success-bg) 60%,var(--crm-surface)))!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crm-success-strong) 24%,transparent),0 8px 20px color-mix(in srgb,var(--crm-success-strong) 8%,transparent)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationCardHead strong,.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationSwitch{color:var(--crm-success-text)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationSwitch input,.agendaAutomationSection.isRuntimeActive .agendaAutomationCard.isActive .agendaAutomationCheck input{accent-color:var(--crm-success-strong)!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCardHead strong{font-size:13.5px!important;line-height:1.35!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSwitch{font-size:10.5px!important;gap:8px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField>span{font-size:10.5px!important;line-height:1.3!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField input,
.agendaAutomationSection.isRuntimeActive .agendaAutomationField select{height:39px!important;font-size:12px!important;padding:0 11px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCheck{font-size:11px!important;gap:7px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationChannels{margin-bottom:11px!important;row-gap:8px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationWhatsApp{margin-top:2px!important;row-gap:9px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCompatibility{font-size:11.5px!important;line-height:1.55!important;min-height:24px!important;margin-top:2px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationError{font-size:11.5px!important;line-height:1.45!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSaving{font-size:11px!important}
.agendaTemplateHelpTitle{display:inline-flex!important;align-items:center;gap:6px;position:relative;overflow:visible}
.agendaTemplateHelp{position:relative;display:inline-flex;align-items:center;justify-content:center}
.agendaTemplateHelpButton{width:17px;height:17px;padding:0;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);font-family:inherit;font-size:10px;font-weight:900;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:help;transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}
.agendaTemplateHelpButton:hover,.agendaTemplateHelpButton:focus-visible{border-color:var(--crm-primary-strong);background:var(--crm-primary-strong);color:var(--crm-text-inverse);outline:none;transform:translateY(-1px)}
.agendaTemplateHelpBubble{position:absolute;z-index:40;top:calc(100% + 8px);right:-8px;width:270px;max-width:min(270px,72vw);padding:10px 11px;border:1px solid var(--crm-border-strong);border-radius:11px;background:var(--crm-text-strong);color:var(--crm-text-inverse);box-shadow:0 14px 34px color-mix(in srgb,var(--crm-text-strong) 26%,transparent);font-size:11px!important;font-weight:650!important;line-height:1.5!important;text-align:left;white-space:normal;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-4px);transition:opacity .16s ease,visibility .16s ease,transform .16s ease}
.agendaTemplateHelpBubble:before{content:"";position:absolute;right:11px;bottom:100%;border:6px solid transparent;border-bottom-color:var(--crm-text-strong)}
.agendaTemplateHelp:hover .agendaTemplateHelpBubble,.agendaTemplateHelp:focus-within .agendaTemplateHelpBubble{opacity:1;visibility:visible;transform:translateY(0)}
@media(max-width:760px){.agendaAutomationSection.isRuntimeActive{padding:14px}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:16px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:12px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationCompatibility{font-size:11px!important}.agendaTemplateHelpBubble{right:-4px;width:240px;max-width:68vw}}
`;

function applyTemplateHelp(section: HTMLElement) {
  section
    .querySelectorAll<HTMLElement>(".agendaAutomationField > span")
    .forEach((label, index) => {
      if (label.dataset.templateHelpApplied === "true") return;
      if (label.textContent?.trim() !== "Template Utility") return;

      const help = document.createElement("span");
      help.className = "agendaTemplateHelp";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "agendaTemplateHelpButton";
      button.textContent = "?";
      button.setAttribute("aria-label", "Orientação para criar o Template Utility");

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
  if (!section.classList.contains("isRuntimeActive")) {
    section.classList.add("isRuntimeActive");
  }

  applyTemplateHelp(section);

  const badge = section.querySelector<HTMLElement>(".agendaAutomationStage");
  if (badge && badge.textContent !== "Automação ativa") {
    badge.textContent = "Automação ativa";
  }

  const notice = section.querySelector<HTMLElement>(".agendaAutomationNotice");
  if (!notice || notice.dataset.runtimeStatusApplied === "true") return;

  const title = document.createElement("strong");
  title.textContent = "Execução automática habilitada. ";

  const destination = document.createElement("strong");
  destination.textContent = "Disparos agendados";

  notice.replaceChildren(title, document.createTextNode(NOTICE_TEXT), destination, document.createTextNode("."));
  notice.dataset.runtimeStatusApplied = "true";
}

function applyFromAddedNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;

  if (node.matches(".agendaAutomationSection")) {
    applyRuntimeStatus(node);
  }

  node
    .querySelectorAll<HTMLElement>(".agendaAutomationSection")
    .forEach(applyRuntimeStatus);
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

    document
      .querySelectorAll<HTMLElement>(".agendaAutomationSection")
      .forEach(applyRuntimeStatus);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(applyFromAddedNode);
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
