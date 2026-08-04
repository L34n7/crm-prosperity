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

body .a2 .repeat.agendaReminderCard{
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

/* CRM_AGENDA_INTERVAL_CARD_PREMIUM_V4 */
body .a2 .agendaPremiumDayCard{
  position:relative!important;
  padding:14px!important;
  border-color:color-mix(in srgb,var(--crm-primary-border) 72%,var(--crm-border))!important;
  border-radius:18px!important;
  background:radial-gradient(circle at 94% 0,color-mix(in srgb,var(--crm-primary-soft) 72%,transparent),transparent 34%),linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-surface-soft) 72%,var(--crm-surface)))!important;
  box-shadow:0 14px 32px color-mix(in srgb,var(--crm-primary-strong) 8%,transparent),inset 0 1px 0 color-mix(in srgb,var(--crm-text-inverse) 72%,transparent)!important;
}
body .a2 .agendaPremiumDayCard:before{
  content:"";
  position:absolute;
  inset:0 16px auto;
  height:3px;
  border-radius:0 0 999px 999px;
  background:linear-gradient(90deg,var(--crm-primary-strong),var(--crm-success-strong));
}
body .a2 .agendaPremiumDayCard .av{padding-top:7px!important}
body .a2 .repeat.agendaReminderCard{
  position:relative!important;
  border-color:color-mix(in srgb,var(--crm-primary-border) 62%,var(--crm-border))!important;
  background:linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-primary-soft) 20%,var(--crm-surface)))!important;
  box-shadow:0 10px 24px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent)!important;
}

@media(max-width:760px){
  body .a2 .repeat.agendaReminderCard{grid-template-columns:1fr!important;padding:11px!important}
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

/* CRM_AGENDA_EXPANDABLE_DAY_TIMELINE_V7 */
body .a2 .availability{gap:10px!important}
body .a2 .availability>.avDay.agendaPremiumDayCard{
  display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:0!important;
  width:100%!important;min-width:0!important;padding:0!important;border-radius:15px!important;
  overflow:hidden!important;background:var(--crm-surface)!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard.agendaDayExpanded{
  border-color:color-mix(in srgb,var(--crm-primary-strong) 42%,var(--crm-border))!important;
  box-shadow:0 12px 28px color-mix(in srgb,var(--crm-primary-strong) 9%,transparent)!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.av{
  display:grid!important;
  grid-template-columns:32px minmax(100px,1fr) 62px 80px 12px 80px 78px 44px!important;
  align-items:center!important;gap:7px!important;width:100%!important;min-width:0!important;
  padding:12px 13px!important;border-bottom:0!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard.agendaDayExpanded>.av{
  border-bottom:1px solid var(--crm-border)!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.av b{
  min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;
  white-space:nowrap!important;font-size:12px!important;font-weight:900!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.av input{
  width:100%!important;min-width:0!important;height:36px!important;padding:0 8px!important;
  border-radius:10px!important;text-align:center!important;background:var(--crm-surface)!important;
}
body .a2 .agendaDayExpand{
  width:30px!important;min-width:30px!important;height:30px!important;padding:0!important;
  border:1px solid var(--crm-primary-border)!important;border-radius:10px!important;
  background:var(--crm-primary-soft)!important;color:var(--crm-primary-text)!important;
  display:grid!important;place-items:center!important;cursor:pointer!important;
}
body .a2 .agendaDayExpand span{
  display:block!important;font-size:22px!important;line-height:1!important;
  transform:rotate(0deg)!important;transition:transform .18s ease!important;
}
body .a2 .agendaDayExpanded .agendaDayExpand span{transform:rotate(90deg)!important}
body .a2 .agendaDayExpand:disabled{opacity:.42!important;cursor:not-allowed!important}
body .a2 .agendaDayStatus{
  min-height:26px!important;display:inline-flex!important;align-items:center!important;
  justify-content:center!important;padding:0 9px!important;border:1px solid var(--crm-success-border)!important;
  border-radius:999px!important;background:var(--crm-success-bg)!important;color:var(--crm-success-text)!important;
  font-size:10px!important;font-weight:900!important;white-space:nowrap!important;
}
body .a2 .agendaDayStatus.isInactive{
  border-color:var(--crm-border)!important;background:var(--crm-surface-soft)!important;color:var(--crm-text-muted)!important;
}
body .a2 .agendaDayTimeSeparator{color:var(--crm-text-muted)!important;font-size:13px!important;font-weight:900!important;text-align:center!important}
body .a2 .agendaDayIntervalCount{color:var(--crm-text-muted)!important;font-size:10px!important;font-weight:850!important;text-align:center!important;white-space:nowrap!important}
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks{
  display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:9px!important;
  width:100%!important;min-width:0!important;margin:0!important;padding:13px!important;
  border-top:1px solid var(--crm-border)!important;background:linear-gradient(180deg,var(--crm-surface-soft),var(--crm-surface))!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks[hidden],
body .a2 .availability>.avDay.agendaPremiumDayCard>.agendaDayTimeline[hidden]{display:none!important}
body .a2 .agendaDayTimeline{
  display:grid!important;gap:9px!important;padding:13px 14px 15px!important;
  background:linear-gradient(180deg,color-mix(in srgb,var(--crm-primary-soft) 28%,var(--crm-surface)),var(--crm-surface))!important;
}
body .a2 .agendaDayTimelineHeader{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important}
body .a2 .agendaDayTimelineHeader strong{color:var(--crm-text-strong)!important;font-size:11px!important;font-weight:900!important}
body .a2 .agendaDayTimelineLegend{display:flex!important;align-items:center!important;gap:12px!important}
body .a2 .agendaDayTimelineLegend span{display:inline-flex!important;align-items:center!important;gap:5px!important;color:var(--crm-text-muted)!important;font-size:9px!important;font-weight:800!important}
body .a2 .agendaDayTimelineLegend span:before{content:""!important;width:8px!important;height:8px!important;border-radius:3px!important}
body .a2 .agendaDayTimelineLegend .isAvailable:before{background:var(--crm-success-strong)!important}
body .a2 .agendaDayTimelineLegend .isInterval:before{background:var(--crm-warning-border)!important}
body .a2 .agendaDayTimelineTrack{
  position:relative!important;height:30px!important;border:1px solid var(--crm-border-strong)!important;
  border-radius:10px!important;background:var(--crm-surface)!important;overflow:hidden!important;
  box-shadow:inset 0 1px 3px color-mix(in srgb,var(--crm-text-strong) 8%,transparent)!important;
}
body .a2 .agendaDayTimelineAvailable{position:absolute!important;inset:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--crm-success-strong) 72%,var(--crm-surface)),color-mix(in srgb,var(--crm-primary-strong) 68%,var(--crm-surface)))!important;opacity:.3!important}
body .a2 .agendaDayTimelineInterval{
  position:absolute!important;top:4px!important;bottom:4px!important;left:var(--agenda-timeline-left)!important;
  width:max(3px,var(--agenda-timeline-width))!important;min-width:3px!important;
  border:1px solid color-mix(in srgb,var(--crm-warning-border) 82%,var(--crm-danger-border))!important;
  border-radius:7px!important;background:linear-gradient(135deg,var(--crm-warning-bg),color-mix(in srgb,var(--crm-danger-bg) 30%,var(--crm-warning-bg)))!important;
  color:var(--crm-warning-text)!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;z-index:2!important;
}
body .a2 .agendaDayTimelineInterval span{max-width:100%!important;padding:0 5px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:8px!important;font-weight:900!important}
body .a2 .agendaDayTimelineScale{display:flex!important;justify-content:space-between!important;color:var(--crm-text-muted)!important;font-size:8.5px!important;font-weight:750!important}
body .a2 .agendaDayTimelineInvalid{padding:9px 10px!important;border:1px dashed var(--crm-border-strong)!important;border-radius:9px!important;color:var(--crm-text-muted)!important;font-size:9px!important}
body .a2 .agendaPremiumIntervalHeader{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;width:100%!important;padding:2px 1px 4px!important}
body .a2 .agendaPremiumIntervalRow{display:grid!important;grid-template-columns:minmax(130px,1fr) 100px 100px 40px!important;align-items:end!important;gap:9px!important;width:100%!important;min-width:0!important;margin:0!important}
body .a2 .agendaPremiumIntervalEmpty{width:100%!important}
@media(max-width:720px){
  body .a2 .availability>.avDay.agendaPremiumDayCard>.av{grid-template-columns:32px minmax(0,1fr) 62px 42px!important}
  body .a2 .agendaDayExpand{grid-column:1!important;grid-row:1!important}
  body .a2 .availability>.avDay.agendaPremiumDayCard>.av>b{grid-column:2!important;grid-row:1!important}
  body .a2 .agendaDayStatus{grid-column:3!important;grid-row:1!important}
  body .a2 .availability>.avDay.agendaPremiumDayCard>.av>.toggle{grid-column:4!important;grid-row:1!important}
  body .a2 .availability>.avDay.agendaPremiumDayCard>.av>input[type="time"]:first-of-type{grid-column:2!important;grid-row:2!important}
  body .a2 .agendaDayTimeSeparator{display:none!important}
  body .a2 .availability>.avDay.agendaPremiumDayCard>.av>input[type="time"]:nth-of-type(2){grid-column:3/5!important;grid-row:2!important}
  body .a2 .agendaDayIntervalCount{grid-column:2/5!important;grid-row:3!important;text-align:left!important}
  body .a2 .agendaDayTimelineHeader{align-items:flex-start!important;flex-direction:column!important;gap:7px!important}
  body .a2 .agendaPremiumIntervalRow{grid-template-columns:1fr 1fr!important}
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
  root.querySelectorAll<HTMLElement>(".repeat").forEach((card) => {
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

const expandedAvailabilityDays = new Set<string>();
const initializedAvailabilityDays = new Set<string>();

function dayKey(dayCard: HTMLElement) {
  const title = dayCard.querySelector<HTMLElement>(".av b");
  return normalize(title?.textContent || "dia");
}

function timeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return String(Math.floor(normalized / 60)).padStart(2, "0") + ":" +
    String(normalized % 60).padStart(2, "0");
}

function renderDayTimeline(
  dayCard: HTMLElement,
  timeline: HTMLElement,
  intervalRows: HTMLElement[]
) {
  const dayRow = dayCard.querySelector<HTMLElement>(".av");
  const dayTimes = Array.from(
    dayRow?.querySelectorAll<HTMLInputElement>('input[type="time"]') || []
  );
  const startValue = dayTimes[0]?.value || "09:00";
  const endValue = dayTimes[1]?.value || "18:00";
  const startMinutes = timeToMinutes(startValue);
  const parsedEnd = timeToMinutes(endValue);
  timeline.replaceChildren();

  const header = document.createElement("div");
  header.className = "agendaDayTimelineHeader";
  const title = document.createElement("strong");
  title.textContent = "Linha do dia";
  const legend = document.createElement("div");
  legend.className = "agendaDayTimelineLegend";
  const availableLegend = document.createElement("span");
  availableLegend.className = "isAvailable";
  availableLegend.textContent = "Disponível";
  const intervalLegend = document.createElement("span");
  intervalLegend.className = "isInterval";
  intervalLegend.textContent = "Intervalo";
  legend.append(availableLegend, intervalLegend);
  header.append(title, legend);
  timeline.appendChild(header);

  if (startMinutes === null || parsedEnd === null) {
    const invalid = document.createElement("div");
    invalid.className = "agendaDayTimelineInvalid";
    invalid.textContent = "Informe horários válidos para visualizar a linha do dia.";
    timeline.appendChild(invalid);
    return;
  }

  const endMinutes = parsedEnd > startMinutes ? parsedEnd : parsedEnd + 1440;
  const duration = Math.max(1, endMinutes - startMinutes);
  const track = document.createElement("div");
  track.className = "agendaDayTimelineTrack";
  track.setAttribute("aria-label", "Disponibilidade de " + startValue + " até " + endValue);
  const available = document.createElement("div");
  available.className = "agendaDayTimelineAvailable";
  track.appendChild(available);

  intervalRows.forEach((row) => {
    const times = Array.from(
      row.querySelectorAll<HTMLInputElement>('input[type="time"]')
    );
    const intervalStartValue = times[0]?.value || "";
    const intervalEndValue = times[1]?.value || "";
    let intervalStart = timeToMinutes(intervalStartValue);
    let intervalEnd = timeToMinutes(intervalEndValue);
    if (intervalStart === null || intervalEnd === null) return;
    if (intervalStart < startMinutes) intervalStart += 1440;
    if (intervalEnd <= intervalStart) intervalEnd += 1440;

    const clippedStart = Math.max(startMinutes, intervalStart);
    const clippedEnd = Math.min(endMinutes, intervalEnd);
    if (clippedEnd <= clippedStart) return;

    const name =
      row.querySelector<HTMLInputElement>('input:not([type="time"])')?.value.trim() ||
      "Intervalo";
    const segment = document.createElement("div");
    segment.className = "agendaDayTimelineInterval";
    segment.style.setProperty(
      "--agenda-timeline-left",
      (((clippedStart - startMinutes) / duration) * 100).toFixed(3) + "%"
    );
    segment.style.setProperty(
      "--agenda-timeline-width",
      (((clippedEnd - clippedStart) / duration) * 100).toFixed(3) + "%"
    );
    segment.title = name + " · " + intervalStartValue + " – " + intervalEndValue;
    const label = document.createElement("span");
    label.textContent = name;
    segment.appendChild(label);
    track.appendChild(segment);
  });

  timeline.appendChild(track);
  const scale = document.createElement("div");
  scale.className = "agendaDayTimelineScale";
  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const label = document.createElement("span");
    label.textContent = minutesToTime(startMinutes + duration * ratio);
    scale.appendChild(label);
  });
  timeline.appendChild(scale);
}

function decorateAvailabilityDay(dayCard: HTMLElement) {
  const dayRow = dayCard.querySelector<HTMLElement>(".av");
  const title = dayRow?.querySelector<HTMLElement>("b");
  const toggle = dayRow?.querySelector<HTMLButtonElement>(".toggle");
  if (!dayRow || !title || !toggle) return;

  const breaks = dayCard.querySelector<HTMLElement>(".avBreaks");
  const intervalRows = breaks
    ? Array.from(breaks.querySelectorAll<HTMLElement>(".avBreak"))
    : [];
  const active = toggle.classList.contains("y");
  const key = dayKey(dayCard);
  dayCard.classList.add("agendaPremiumDayCard");

  let expand = dayRow.querySelector<HTMLButtonElement>(".agendaDayExpand");
  if (!expand) {
    expand = document.createElement("button");
    expand.type = "button";
    expand.className = "agendaDayExpand";
    expand.innerHTML = '<span aria-hidden="true">›</span>';
    expand.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentKey = dayKey(dayCard);
      if (expandedAvailabilityDays.has(currentKey)) {
        expandedAvailabilityDays.delete(currentKey);
      } else {
        expandedAvailabilityDays.add(currentKey);
      }
      decorateAvailabilityDay(dayCard);
    });
    dayRow.insertBefore(expand, title);
  }

  let status = dayRow.querySelector<HTMLElement>(".agendaDayStatus");
  if (!status) {
    status = document.createElement("span");
    status.className = "agendaDayStatus";
    title.insertAdjacentElement("afterend", status);
  }
  status.textContent = active ? "Ativo" : "Inativo";
  status.classList.toggle("isInactive", !active);

  const dayTimes = Array.from(
    dayRow.querySelectorAll<HTMLInputElement>('input[type="time"]')
  );
  if (!dayRow.querySelector(".agendaDayTimeSeparator") && dayTimes[1]) {
    const separator = document.createElement("span");
    separator.className = "agendaDayTimeSeparator";
    separator.textContent = "–";
    dayRow.insertBefore(separator, dayTimes[1]);
  }

  let count = dayRow.querySelector<HTMLElement>(".agendaDayIntervalCount");
  if (!count) {
    count = document.createElement("span");
    count.className = "agendaDayIntervalCount";
    dayRow.insertBefore(count, toggle);
  }
  count.textContent = String(intervalRows.length) +
    (intervalRows.length === 1 ? " intervalo" : " intervalos");

  if (!initializedAvailabilityDays.has(key)) {
    if (intervalRows.length > 0) expandedAvailabilityDays.add(key);
    initializedAvailabilityDays.add(key);
  }

  const expanded = active && Boolean(breaks) && expandedAvailabilityDays.has(key);
  dayCard.classList.toggle("agendaDayExpanded", expanded);
  expand.disabled = !active || !breaks;
  expand.setAttribute("aria-expanded", String(expanded));
  expand.setAttribute(
    "aria-label",
    expanded ? "Recolher opções do dia" : "Expandir opções do dia"
  );

  let timeline = dayCard.querySelector<HTMLElement>(".agendaDayTimeline");
  if (active && breaks) {
    if (!timeline) {
      timeline = document.createElement("section");
      timeline.className = "agendaDayTimeline";
      dayRow.insertAdjacentElement("afterend", timeline);
    }
    renderDayTimeline(dayCard, timeline, intervalRows);
    timeline.hidden = !expanded;
    breaks.hidden = !expanded;

    const header = breaks.querySelector<HTMLElement>(".avBreakHead");
    header?.classList.add("agendaPremiumIntervalHeader");
    header?.querySelector<HTMLElement>("span")?.classList.add("agendaPremiumIntervalTitle");
    header?.querySelector<HTMLButtonElement>(".avAddBreak")?.classList.add("agendaPremiumIntervalAdd");
    breaks.querySelectorAll<HTMLElement>(".avBreakEmpty").forEach((empty) =>
      empty.classList.add("agendaPremiumIntervalEmpty")
    );
    intervalRows.forEach((row) => {
      row.classList.add("agendaPremiumIntervalRow");
      row.querySelector<HTMLButtonElement>(
        'button[aria-label="Remover intervalo"],button.remove'
      )?.classList.add("agendaPremiumIntervalRemove");
    });
  } else {
    timeline?.remove();
  }

  if (dayCard.dataset.agendaTimelineBound !== "true") {
    dayCard.dataset.agendaTimelineBound = "true";
    const refresh = () => window.requestAnimationFrame(() => {
      if (dayCard.isConnected) decorateAvailabilityDay(dayCard);
    });
    dayCard.addEventListener("input", refresh);
    dayCard.addEventListener("change", refresh);
  }
}

function decorateIntervals(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".availability>.avDay")
    .forEach(decorateAvailabilityDay);
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
