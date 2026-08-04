"use client";

import { useEffect } from "react";
import AgendaTemplateMappingEnhancer from "./AgendaTemplateMappingEnhancer";

const STYLE_ID = "agenda-premium-runtime-enhancer-v2";

const CSS = `
.agendaTemplateShell{min-width:0}
body .a2 .repeat.rem{width:100%;min-width:0;max-width:100%;grid-template-columns:minmax(0,1fr) minmax(0,.72fr) minmax(0,1fr) 34px;gap:9px;padding:12px;border-radius:14px;overflow:visible}
body .a2 .repeat.rem>*{min-width:0;max-width:100%}
body .a2 .repeat.rem .field,body .a2 .repeat.rem label,body .a2 .repeat.rem div{min-width:0;max-width:100%}
body .a2 .repeat.rem select,body .a2 .repeat.rem input[type="text"]{width:100%!important;min-width:0!important;max-width:100%!important;text-overflow:ellipsis}
body .a2 .repeat.rem .agendaTemplateMappingPanel{grid-column:1/-1;width:100%;min-width:0;max-width:100%;margin-top:3px}
body .a2 .repeat.rem .agendaTemplateVariableRow{grid-template-columns:58px minmax(0,1.2fr) minmax(0,1fr)}
body .a2 .repeat.rem .agendaTemplatePreview,body .a2 .repeat.rem .agendaTemplatePreviewArea,body .a2 .repeat.rem .agendaTemplatePreviewBubble{min-width:0;max-width:100%}
body .a2 .repeat.rem .agendaTemplatePreview pre{max-width:100%;overflow-wrap:anywhere}

.agendaPremiumIntervalSection{position:relative;margin:10px 0 2px;padding:13px 14px 14px;border:1px solid var(--crm-primary-border);border-radius:16px;background:linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-primary-soft) 34%,var(--crm-surface)));box-shadow:0 10px 24px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent);overflow:hidden}
.agendaPremiumIntervalSection:before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--crm-primary-strong),color-mix(in srgb,var(--crm-primary-strong) 22%,transparent))}
.agendaPremiumIntervalHeader{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-width:0;margin:0 0 10px!important;padding:0!important}
.agendaPremiumIntervalTitle{display:flex!important;align-items:center!important;gap:8px!important;margin:0!important;color:var(--crm-text-strong)!important;font-size:12px!important;font-weight:900!important;line-height:1.35!important;letter-spacing:-.01em!important}
.agendaPremiumIntervalTitle:before{content:"";width:9px;height:9px;flex:0 0 9px;border-radius:3px;background:var(--crm-primary-strong);box-shadow:0 0 0 4px var(--crm-primary-soft)}
.agendaPremiumIntervalAdd{min-height:36px!important;height:36px!important;padding:0 12px!important;border:1px solid var(--crm-primary-border)!important;border-radius:12px!important;background:var(--crm-surface)!important;color:var(--crm-primary-text)!important;font-size:11px!important;font-weight:900!important;white-space:nowrap!important;box-shadow:var(--crm-shadow-xs)!important}
.agendaPremiumIntervalAdd:hover{background:var(--crm-primary-soft)!important;transform:translateY(-1px)}
.agendaPremiumIntervalSection small,.agendaPremiumIntervalSection p,.agendaPremiumIntervalSection span,.agendaPremiumIntervalSection label{font-size:11px!important;line-height:1.5!important}
.agendaPremiumIntervalEmpty{min-height:44px;display:flex!important;align-items:center!important;padding:10px 12px!important;border:1px dashed var(--crm-border-strong)!important;border-radius:12px!important;background:color-mix(in srgb,var(--crm-surface-soft) 76%,transparent)!important;color:var(--crm-text-muted)!important;font-size:11px!important;font-weight:650!important}
.agendaPremiumIntervalRow{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto!important;align-items:end!important;gap:9px!important;margin-top:9px!important;padding:11px!important;border:1px solid var(--crm-border)!important;border-radius:13px!important;background:var(--crm-surface)!important;box-shadow:var(--crm-shadow-xs)!important}
.agendaPremiumIntervalRow label{display:grid!important;gap:5px!important;color:var(--crm-text-muted)!important;font-size:10.5px!important;font-weight:850!important}
.agendaPremiumIntervalRow input,.agendaPremiumIntervalRow select{width:100%!important;min-width:0!important;min-height:40px!important;height:40px!important;padding:0 10px!important;border:1px solid var(--crm-border-strong)!important;border-radius:11px!important;background:var(--crm-surface)!important;color:var(--crm-text-strong)!important;font-size:13px!important;font-weight:750!important;outline:none!important}
.agendaPremiumIntervalRow input:focus,.agendaPremiumIntervalRow select:focus{border-color:var(--crm-primary-strong)!important;box-shadow:var(--crm-focus-ring)!important}
.agendaPremiumIntervalRemove{width:38px!important;min-width:38px!important;height:38px!important;min-height:38px!important;border:1px solid var(--crm-danger-border)!important;border-radius:11px!important;background:var(--crm-danger-bg)!important;color:var(--crm-danger-text)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
.agendaPremiumIntervalRemove:hover{background:var(--crm-danger-bg-strong)!important}

@media(max-width:760px){
 body .a2 .repeat.rem{grid-template-columns:1fr;padding:11px}
 body .a2 .repeat.rem>.remove{justify-self:end}
 body .a2 .repeat.rem .agendaTemplateVariableRow{grid-template-columns:1fr}
 .agendaPremiumIntervalHeader{align-items:stretch!important;flex-direction:column!important}
 .agendaPremiumIntervalAdd{width:100%!important}
 .agendaPremiumIntervalRow{grid-template-columns:1fr!important}
 .agendaPremiumIntervalRemove{width:100%!important}
}
`;

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function directText(element: Element) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .trim();
}

function findIntervalContainer(title: HTMLElement) {
  let current: HTMLElement | null = title.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const hasAddButton = Array.from(current.querySelectorAll<HTMLButtonElement>("button")).some(
      (button) => normalize(button.textContent).includes("adicionar intervalo")
    );
    if (hasAddButton) return current;
    current = current.parentElement;
  }
  return null;
}

function decorateIntervals(root: ParentNode) {
  const candidates = root.querySelectorAll<HTMLElement>("div,section,header,strong,b,span,p,small");
  candidates.forEach((candidate) => {
    const direct = normalize(directText(candidate));
    const complete = normalize(candidate.textContent);
    const ownText = direct || (complete.length <= 80 ? complete : "");
    if (!ownText.startsWith("intervalos do dia")) return;

    const section = findIntervalContainer(candidate);
    if (!section) return;
    section.classList.add("agendaPremiumIntervalSection");

    const header = candidate.parentElement;
    if (header && section.contains(header)) header.classList.add("agendaPremiumIntervalHeader");
    candidate.classList.add("agendaPremiumIntervalTitle");

    const addButton = Array.from(section.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => normalize(button.textContent).includes("adicionar intervalo")
    );
    addButton?.classList.add("agendaPremiumIntervalAdd");

    section.querySelectorAll<HTMLElement>("small,p,span,div").forEach((element) => {
      const text = normalize(directText(element) || element.textContent);
      if (text.includes("nenhum intervalo configurado")) {
        element.classList.add("agendaPremiumIntervalEmpty");
      }
    });

    const timeInputs = Array.from(section.querySelectorAll<HTMLInputElement>('input[type="time"]'));
    const rows = new Set<HTMLElement>();
    timeInputs.forEach((input) => {
      let row: HTMLElement | null = input.parentElement;
      for (let depth = 0; row && depth < 4; depth += 1) {
        if (row.querySelectorAll('input[type="time"]').length >= 2) break;
        row = row.parentElement;
      }
      if (row && section.contains(row)) rows.add(row);
    });

    rows.forEach((row) => {
      row.classList.add("agendaPremiumIntervalRow");
      const removeButton = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) =>
          normalize(button.textContent).includes("remover") ||
          normalize(button.getAttribute("aria-label")).includes("remover") ||
          Boolean(button.querySelector("svg"))
      );
      removeButton?.classList.add("agendaPremiumIntervalRemove");
    });
  });
}

export default function AgendaPremiumRuntimeEnhancer() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID);
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const apply = () => decorateIntervals(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) decorateIntervals(node);
        });
      }
      apply();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    apply();

    return () => {
      observer.disconnect();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return <AgendaTemplateMappingEnhancer />;
}
