"use client";

import { useEffect } from "react";
import AgendaTemplateMappingEnhancer from "./AgendaTemplateMappingEnhancer";

const STYLE_ID = "agenda-premium-runtime-enhancer-v3";
const DECORATION_CLASSES = [
  "agendaPremiumDayCard",
  "agendaPremiumIntervalHeader",
  "agendaPremiumIntervalTitle",
  "agendaPremiumIntervalAdd",
  "agendaPremiumIntervalEmpty",
  "agendaPremiumIntervalRow",
  "agendaPremiumIntervalRemove",
  "agendaReminderCard",
  "agendaReminderWhatsappGrid",
  "agendaReminderWhatsappField",
];

const CSS = `
.agendaTemplateShell{width:100%;min-width:0}

body .a2 .repeat.rem.agendaReminderCard{
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  grid-template-columns:minmax(0,1fr) minmax(0,.72fr) minmax(0,1fr) 34px!important;
  gap:10px!important;
  padding:12px!important;
  border-radius:14px!important;
  overflow:hidden!important;
}
body .a2 .agendaReminderCard,
body .a2 .agendaReminderCard *{box-sizing:border-box}
body .a2 .agendaReminderCard>*{min-width:0!important;max-width:100%!important}
body .a2 .agendaReminderCard .field,
body .a2 .agendaReminderCard label,
body .a2 .agendaReminderCard div{min-width:0;max-width:100%}
body .a2 .agendaReminderCard select,
body .a2 .agendaReminderCard input,
body .a2 .agendaReminderCard textarea{
  display:block;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
}
body .a2 .agendaReminderCard select{text-overflow:ellipsis;overflow:hidden}
body .a2 .agendaReminderWhatsappGrid{
  grid-column:1/-1!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
  align-items:end!important;
  gap:10px!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  padding:9px 0 0!important;
  border-top:1px dashed var(--crm-border)!important;
  overflow:hidden!important;
}
body .a2 .agendaReminderWhatsappField{width:100%!important;min-width:0!important;max-width:100%!important}
body .a2 .agendaReminderWhatsappField select{width:100%!important;min-width:0!important;max-width:100%!important}
body .a2 .agendaReminderCard .agendaTemplateMappingPanel{
  grid-column:1/-1!important;
  width:auto!important;
  min-width:0!important;
  max-width:100%!important;
  margin:3px 0 0!important;
  overflow:hidden!important;
}
body .a2 .agendaReminderCard .agendaTemplateMappingPanel>*{min-width:0!important;max-width:100%!important}
body .a2 .agendaReminderCard .agendaTemplateVariableRow{
  grid-template-columns:58px minmax(0,1.2fr) minmax(0,1fr)!important;
}
body .a2 .agendaReminderCard .agendaTemplateButtonRow{
  grid-template-columns:minmax(0,1fr) minmax(0,.9fr) minmax(0,1.1fr)!important;
}
body .a2 .agendaReminderCard .agendaTemplatePreview,
body .a2 .agendaReminderCard .agendaTemplatePreviewArea,
body .a2 .agendaReminderCard .agendaTemplatePreviewBubble{
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
}
body .a2 .agendaReminderCard .agendaTemplatePreview pre{max-width:100%!important;overflow-wrap:anywhere!important}

body .a2 .availability{display:grid!important;gap:12px!important}
body .a2 .agendaPremiumDayCard{
  display:block!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  padding:10px!important;
  border:1px solid var(--crm-border)!important;
  border-radius:16px!important;
  background:var(--crm-surface)!important;
  box-shadow:var(--crm-shadow-xs)!important;
  overflow:hidden!important;
}
body .a2 .agendaPremiumDayCard>.av,
body .a2 .agendaPremiumDayCard .av{
  display:grid!important;
  grid-template-columns:minmax(120px,1fr) 108px 108px 44px!important;
  align-items:center!important;
  gap:9px!important;
  width:100%!important;
  min-width:0!important;
  padding:3px 2px 10px!important;
  border-bottom:1px solid var(--crm-border)!important;
}
body .a2 .agendaPremiumDayCard .av b{
  color:var(--crm-text-strong)!important;
  font-size:13px!important;
  font-weight:900!important;
}
body .a2 .agendaPremiumDayCard .av input{
  width:100%!important;
  min-width:0!important;
  height:40px!important;
  padding:0 10px!important;
  border-radius:11px!important;
  font-size:13px!important;
  font-weight:750!important;
}
body .a2 .agendaPremiumDayCard .toggle{width:40px!important;min-width:40px!important;justify-self:end!important}
body .a2 .agendaPremiumIntervalHeader{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:12px!important;
  width:100%!important;
  min-width:0!important;
  margin:0!important;
  padding:12px 2px 8px!important;
}
body .a2 .agendaPremiumIntervalTitle{
  display:flex!important;
  align-items:center!important;
  gap:9px!important;
  margin:0!important;
  color:var(--crm-text-strong)!important;
  font-size:12px!important;
  font-weight:900!important;
  line-height:1.4!important;
  letter-spacing:-.01em!important;
}
body .a2 .agendaPremiumIntervalTitle:before{
  content:"";
  width:9px;
  height:9px;
  flex:0 0 9px;
  border-radius:3px;
  background:var(--crm-primary-strong);
  box-shadow:0 0 0 4px var(--crm-primary-soft);
}
body .a2 .agendaPremiumIntervalAdd{
  min-height:36px!important;
  height:36px!important;
  padding:0 13px!important;
  border:1px solid var(--crm-primary-border)!important;
  border-radius:12px!important;
  background:var(--crm-surface)!important;
  color:var(--crm-primary-text)!important;
  font-size:11px!important;
  font-weight:900!important;
  white-space:nowrap!important;
  box-shadow:var(--crm-shadow-xs)!important;
}
body .a2 .agendaPremiumIntervalAdd:hover{background:var(--crm-primary-soft)!important;transform:translateY(-1px)}
body .a2 .agendaPremiumIntervalEmpty{
  width:100%!important;
  min-height:44px!important;
  display:flex!important;
  align-items:center!important;
  margin:0!important;
  padding:10px 12px!important;
  border:1px dashed var(--crm-border-strong)!important;
  border-radius:12px!important;
  background:var(--crm-surface-soft)!important;
  color:var(--crm-text-muted)!important;
  font-size:11px!important;
  font-weight:700!important;
  line-height:1.5!important;
}
body .a2 .agendaPremiumIntervalRow{
  display:grid!important;
  grid-template-columns:minmax(150px,1fr) 112px 112px 40px!important;
  align-items:end!important;
  gap:9px!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  margin:2px 0 0!important;
  padding:11px!important;
  border:1px solid var(--crm-primary-border)!important;
  border-radius:13px!important;
  background:linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-primary-soft) 24%,var(--crm-surface)))!important;
  box-shadow:0 8px 18px color-mix(in srgb,var(--crm-primary-strong) 6%,transparent)!important;
  overflow:hidden!important;
}
body .a2 .agendaPremiumIntervalRow>*{min-width:0!important;max-width:100%!important}
body .a2 .agendaPremiumIntervalRow label{
  display:grid!important;
  gap:5px!important;
  color:var(--crm-text-muted)!important;
  font-size:10.5px!important;
  font-weight:850!important;
}
body .a2 .agendaPremiumIntervalRow input,
body .a2 .agendaPremiumIntervalRow select{
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  min-height:40px!important;
  height:40px!important;
  padding:0 10px!important;
  border:1px solid var(--crm-border-strong)!important;
  border-radius:11px!important;
  background:var(--crm-surface)!important;
  color:var(--crm-text-strong)!important;
  font-size:13px!important;
  font-weight:750!important;
  outline:none!important;
}
body .a2 .agendaPremiumIntervalRow input:focus,
body .a2 .agendaPremiumIntervalRow select:focus{border-color:var(--crm-primary-strong)!important;box-shadow:var(--crm-focus-ring)!important}
body .a2 .agendaPremiumIntervalRemove{
  width:40px!important;
  min-width:40px!important;
  max-width:40px!important;
  height:40px!important;
  min-height:40px!important;
  padding:0!important;
  border:1px solid var(--crm-danger-border)!important;
  border-radius:11px!important;
  background:var(--crm-danger-bg)!important;
  color:var(--crm-danger-text)!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
}
body .a2 .agendaPremiumIntervalRemove:hover{background:var(--crm-danger-bg-strong)!important}

@media(max-width:760px){
  body .a2 .repeat.rem.agendaReminderCard{grid-template-columns:1fr!important;padding:11px!important}
  body .a2 .agendaReminderCard>.remove{justify-self:end!important}
  body .a2 .agendaReminderWhatsappGrid{grid-template-columns:1fr!important}
  body .a2 .agendaReminderCard .agendaTemplateVariableRow,
  body .a2 .agendaReminderCard .agendaTemplateButtonRow{grid-template-columns:1fr!important}
  body .a2 .agendaPremiumDayCard .av{grid-template-columns:1fr 1fr!important}
  body .a2 .agendaPremiumDayCard .av b{grid-column:1/-1!important}
  body .a2 .agendaPremiumDayCard .toggle{grid-column:1/-1!important;justify-self:start!important}
  body .a2 .agendaPremiumIntervalHeader{align-items:stretch!important;flex-direction:column!important}
  body .a2 .agendaPremiumIntervalAdd{width:100%!important}
  body .a2 .agendaPremiumIntervalRow{grid-template-columns:1fr 1fr!important}
  body .a2 .agendaPremiumIntervalRow>*:first-child{grid-column:1/-1!important}
  body .a2 .agendaPremiumIntervalRemove{width:100%!important;max-width:none!important;grid-column:1/-1!important}
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

function ownText(element: Element) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .trim();
}

function findLabel(root: ParentNode, expected: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("label,span,b,strong,p,small")).find((element) => {
    const direct = normalize(ownText(element));
    const complete = normalize(element.textContent);
    return direct === expected || (complete === expected && complete.length < 45);
  });
}

function lowestCommonParent(first: HTMLElement, second: HTMLElement, boundary: HTMLElement) {
  const firstParents = new Set<HTMLElement>();
  let current: HTMLElement | null = first;
  while (current && boundary.contains(current)) {
    firstParents.add(current);
    if (current === boundary) break;
    current = current.parentElement;
  }
  current = second;
  while (current && boundary.contains(current)) {
    if (firstParents.has(current)) return current;
    if (current === boundary) break;
    current = current.parentElement;
  }
  return null;
}

function decorateReminderCards(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".repeat.rem").forEach((card) => {
    card.classList.add("agendaReminderCard");
    const integrationLabel = findLabel(card, "integracao do whatsapp");
    const templateLabel = findLabel(card, "template aprovado");
    if (!integrationLabel || !templateLabel) return;

    const integrationField = integrationLabel.closest<HTMLElement>(".field,label,div") || integrationLabel;
    const templateField = templateLabel.closest<HTMLElement>(".field,label,div") || templateLabel;
    integrationField.classList.add("agendaReminderWhatsappField");
    templateField.classList.add("agendaReminderWhatsappField");

    const common = lowestCommonParent(integrationField, templateField, card);
    if (common && common !== card) common.classList.add("agendaReminderWhatsappGrid");
  });
}

function findAddButton(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    normalize(button.textContent).includes("adicionar intervalo")
  );
}

function findHeader(title: HTMLElement, dayCard: HTMLElement) {
  let current: HTMLElement | null = title.parentElement;
  while (current && current !== dayCard) {
    const hasButton = Boolean(findAddButton(current));
    const hasTimeInputs = current.querySelectorAll('input[type="time"]').length > 0;
    if (hasButton && !hasTimeInputs) return current;
    current = current.parentElement;
  }
  return title.parentElement;
}

function findDayCard(title: HTMLElement) {
  let current: HTMLElement | null = title.parentElement;
  while (current) {
    const intervalTitles = Array.from(current.querySelectorAll<HTMLElement>("b,strong,span,p,small,div")).filter((element) =>
      normalize(ownText(element) || element.textContent).startsWith("intervalos do dia")
    ).length;
    const hasAdd = Boolean(findAddButton(current));
    const hasAvailabilityRow = Boolean(current.querySelector(".av"));
    if (intervalTitles === 1 && hasAdd && hasAvailabilityRow) return current;
    current = current.parentElement;
  }
  return null;
}

function isIntervalRow(element: HTMLElement) {
  const timeInputs = element.querySelectorAll('input[type="time"]');
  if (timeInputs.length !== 2) return false;
  if (element.querySelector(".toggle")) return false;
  if (findAddButton(element)) return false;
  const textInput = element.querySelector('input:not([type="time"]),input[type="text"]');
  const removeButton = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    normalize(button.textContent).includes("remover") ||
    normalize(button.getAttribute("aria-label")).includes("remover") ||
    Boolean(button.querySelector("svg"))
  );
  return Boolean(textInput && removeButton);
}

function findSmallestIntervalRows(dayCard: HTMLElement) {
  return Array.from(dayCard.querySelectorAll<HTMLElement>("div,section,article,li")).filter((element) => {
    if (!isIntervalRow(element)) return false;
    return !Array.from(element.children).some(
      (child) => child instanceof HTMLElement && isIntervalRow(child)
    );
  });
}

function decorateIntervals(root: ParentNode) {
  const titles = Array.from(root.querySelectorAll<HTMLElement>("b,strong,span,p,small,div")).filter((element) => {
    const direct = normalize(ownText(element));
    const complete = normalize(element.textContent);
    const value = direct || (complete.length <= 70 ? complete : "");
    return value.startsWith("intervalos do dia");
  });

  titles.forEach((title) => {
    const dayCard = findDayCard(title);
    if (!dayCard) return;
    dayCard.classList.add("agendaPremiumDayCard");
    title.classList.add("agendaPremiumIntervalTitle");

    const header = findHeader(title, dayCard);
    header?.classList.add("agendaPremiumIntervalHeader");
    findAddButton(header || dayCard)?.classList.add("agendaPremiumIntervalAdd");

    dayCard.querySelectorAll<HTMLElement>("small,p,span,div").forEach((element) => {
      const value = normalize(ownText(element) || element.textContent);
      if (value === "nenhum intervalo configurado para este dia.") {
        element.classList.add("agendaPremiumIntervalEmpty");
      }
    });

    findSmallestIntervalRows(dayCard).forEach((row) => {
      row.classList.add("agendaPremiumIntervalRow");
      const removeButton = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        normalize(button.textContent).includes("remover") ||
        normalize(button.getAttribute("aria-label")).includes("remover") ||
        Boolean(button.querySelector("svg"))
      );
      removeButton?.classList.add("agendaPremiumIntervalRemove");
    });
  });
}

function clearOldDecorations() {
  document.querySelectorAll<HTMLElement>(DECORATION_CLASSES.map((item) => `.${item}`).join(",")).forEach((element) => {
    DECORATION_CLASSES.forEach((item) => element.classList.remove(item));
  });
}

export default function AgendaPremiumRuntimeEnhancer() {
  useEffect(() => {
    document.getElementById("agenda-premium-runtime-enhancer-v2")?.remove();
    let style = document.getElementById(STYLE_ID);
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    clearOldDecorations();
    let frame = 0;
    const apply = () => {
      frame = 0;
      decorateReminderCards(document);
      decorateIntervals(document);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    apply();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (ownsStyle) style?.remove();
    };
  }, []);

  return <AgendaTemplateMappingEnhancer />;
}
