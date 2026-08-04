"use client";

import { useEffect } from "react";
import AgendaAutomationEnhancer from "./AgendaAutomationEnhancer";
import AgendaAutomationRuntimeStatus from "./AgendaAutomationRuntimeStatus";
import AgendaEnhancerLegacy from "./AgendaEnhancerLegacy";
import AgendaGoogleAgendaBindingFix from "./AgendaGoogleAgendaBindingFix";

const STYLES = `
.agendaTemplateShell .a2 .head.agendaHeadPremium .agendaRefreshBtn{margin-left:0!important}
.agendaTemplateShell .a2 .head.agendaHeadPremium .agendaNewBtn{margin-left:auto!important}
.agendaTemplateShell .agendaOverviewSourceHidden{display:none!important}
.agendaTemplateShell .agendaOverviewDrawer{width:min(760px,97vw)!important;background:var(--crm-surface)!important}
.agendaTemplateShell .agendaOverviewHeader{min-height:76px;padding:14px 18px;border-bottom:1px solid var(--crm-border);background:var(--header);display:flex;align-items:center;gap:12px}
.agendaTemplateShell .agendaOverviewIcon{width:42px;height:42px;flex:0 0 42px;border:1px solid var(--crm-primary-border);border-radius:13px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:grid;place-items:center}
.agendaTemplateShell .agendaOverviewHeaderCopy{min-width:0;flex:1}.agendaTemplateShell .agendaOverviewHeaderCopy h2{margin:0;color:var(--crm-text-strong);font-size:20px;font-weight:900}.agendaTemplateShell .agendaOverviewHeaderCopy p{margin:4px 0 0;color:var(--crm-text-muted);font-size:12px}
.agendaTemplateShell .agendaOverviewClose{width:40px!important;min-width:40px!important;padding:0!important;font-size:20px!important}
.agendaTemplateShell .agendaOverviewBody{padding:16px 18px 22px;overflow-y:auto;flex:1;background:var(--crm-surface-soft)}
.agendaTemplateShell .agendaOverviewHero{position:relative;margin-bottom:12px;padding:17px;border:1px solid var(--crm-primary-border);border-radius:18px;background:linear-gradient(135deg,var(--crm-primary-soft),var(--crm-surface) 68%);overflow:hidden}.agendaTemplateShell .agendaOverviewHero:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--crm-primary-strong),var(--crm-success-strong))}
.agendaTemplateShell .agendaOverviewHeroTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.agendaTemplateShell .agendaOverviewHero h3{margin:0;color:var(--crm-text-strong);font-size:22px;font-weight:900}.agendaTemplateShell .agendaOverviewHero p{margin:5px 0 0;color:var(--crm-text-muted);font-size:13px}
.agendaTemplateShell .agendaOverviewStatus{min-height:28px;padding:0 10px;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:inline-flex;align-items:center;font-size:11px;font-weight:900;white-space:nowrap}.agendaTemplateShell .agendaOverviewStatus[data-status="confirmado"],.agendaTemplateShell .agendaOverviewStatus[data-status="realizado"]{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text)}.agendaTemplateShell .agendaOverviewStatus[data-status="cancelado"],.agendaTemplateShell .agendaOverviewStatus[data-status="faltou"]{border-color:var(--crm-danger-border);background:var(--crm-danger-bg);color:var(--crm-danger-text)}
.agendaTemplateShell .agendaOverviewMetrics{margin-top:15px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.agendaTemplateShell .agendaOverviewMetric{min-width:0;padding:11px 12px;border:1px solid var(--crm-border);border-radius:13px;background:color-mix(in srgb,var(--crm-surface) 90%,transparent)}.agendaTemplateShell .agendaOverviewMetric span{display:block;margin-bottom:4px;color:var(--crm-text-muted);font-size:10px;font-weight:850;text-transform:uppercase}.agendaTemplateShell .agendaOverviewMetric strong{display:block;color:var(--crm-text-strong);font-size:13px;font-weight:850;line-height:1.45;overflow-wrap:anywhere}
.agendaTemplateShell .agendaOverviewGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.agendaTemplateShell .agendaOverviewSection{min-width:0;padding:14px;border:1px solid var(--crm-border);border-radius:17px;background:var(--crm-surface);box-shadow:var(--crm-shadow-xs)}.agendaTemplateShell .agendaOverviewSection.full{grid-column:1/-1}.agendaTemplateShell .agendaOverviewSection h4{margin:0 0 11px;color:var(--crm-text-strong);font-size:14px;font-weight:900;display:flex;align-items:center;gap:7px}.agendaTemplateShell .agendaOverviewSection h4:before{content:"";width:8px;height:8px;border-radius:999px;background:var(--crm-primary-strong);box-shadow:0 0 0 4px var(--crm-primary-soft)}
.agendaTemplateShell .agendaOverviewRows{display:grid;gap:9px}.agendaTemplateShell .agendaOverviewRow{display:grid;grid-template-columns:minmax(105px,.7fr) minmax(0,1.3fr);gap:12px;align-items:start}.agendaTemplateShell .agendaOverviewRow span{color:var(--crm-text-muted);font-size:11px;font-weight:750}.agendaTemplateShell .agendaOverviewRow strong{min-width:0;color:var(--crm-text-strong);font-size:12px;font-weight:750;line-height:1.5;overflow-wrap:anywhere}.agendaTemplateShell .agendaOverviewText{margin:0;color:var(--crm-text);font-size:12px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
.agendaTemplateShell .agendaOverviewList{display:grid;gap:8px}.agendaTemplateShell .agendaOverviewItem{padding:10px 11px;border:1px solid var(--crm-border);border-radius:12px;background:var(--crm-surface-soft)}.agendaTemplateShell .agendaOverviewItem>b{display:block;margin-bottom:7px;color:var(--crm-text-strong);font-size:12px;font-weight:900}.agendaTemplateShell .agendaOverviewEmpty{padding:8px 0;color:var(--crm-text-muted);font-size:11px}
.agendaTemplateShell .agendaOverviewHistory{position:relative;padding:0 0 12px 18px;border-left:1px solid var(--crm-border-strong)}.agendaTemplateShell .agendaOverviewHistory:last-child{padding-bottom:0}.agendaTemplateShell .agendaOverviewHistory:before{content:"";position:absolute;top:3px;left:-5px;width:9px;height:9px;border-radius:999px;background:var(--crm-success-strong);box-shadow:0 0 0 4px var(--crm-success-bg)}.agendaTemplateShell .agendaOverviewHistory b{display:block;color:var(--crm-text-strong);font-size:12px;text-transform:capitalize}.agendaTemplateShell .agendaOverviewHistory p{margin:3px 0;color:var(--crm-text-muted);font-size:11px;line-height:1.5}.agendaTemplateShell .agendaOverviewHistory small{color:var(--crm-text-soft);font-size:10px}
.agendaTemplateShell .agendaOverviewLink{color:var(--crm-primary-text);font-weight:850;text-decoration:none}.agendaTemplateShell .agendaOverviewLink:hover{text-decoration:underline}
.agendaTemplateShell .agendaOverviewFooter{min-height:70px;padding:13px 17px;border-top:1px solid var(--crm-border);background:var(--header);display:flex;align-items:center;justify-content:space-between;gap:10px}.agendaTemplateShell .agendaOverviewFooterGroup{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.agendaTemplateShell .agendaOverviewFooter .btn{min-width:120px}.agendaTemplateShell .agendaOverviewFooter a.btn,.agendaTemplateShell .agendaOverviewFooter a.btn:hover,.agendaTemplateShell .agendaOverviewFooter a.btn:focus{text-decoration:none!important}
@media(max-width:860px){.agendaTemplateShell .a2 .head.agendaHeadPremium .agendaNewBtn{margin-left:0!important}}
@media(max-width:680px){.agendaTemplateShell .agendaOverviewMetrics,.agendaTemplateShell .agendaOverviewGrid{grid-template-columns:1fr}.agendaTemplateShell .agendaOverviewSection.full{grid-column:auto}.agendaTemplateShell .agendaOverviewFooter{align-items:stretch;flex-direction:column-reverse}.agendaTemplateShell .agendaOverviewFooterGroup,.agendaTemplateShell .agendaOverviewFooter .btn{width:100%}.agendaTemplateShell .agendaOverviewFooter .btn{flex:1}}
`;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function text(element: Element | null | undefined) {
  return element?.textContent?.trim() || "";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function section(drawer: HTMLElement, title: string) {
  const target = normalize(title);
  return Array.from(drawer.querySelectorAll<HTMLElement>(".body > .section")).find((item) => normalize(text(item.querySelector("h3"))).includes(target));
}

function controlValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) {
  if (!control) return "";
  if (control instanceof HTMLSelectElement) return control.selectedOptions[0]?.textContent?.trim() || control.value.trim();
  return control.value.trim();
}

function fieldValue(container: HTMLElement | undefined, label: string) {
  if (!container) return "";
  const wanted = normalize(label);
  const field = Array.from(container.querySelectorAll<HTMLElement>(".field")).find((item) => normalize(text(item.querySelector("label"))) === wanted);
  return controlValue(field?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea") || null);
}

function dateTime(value: string) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(date);
}

function duration(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "Não informada";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function row(label: string, value: string, raw = false) {
  const content = value || "Não informado";
  return `<div class="agendaOverviewRow"><span>${escapeHtml(label)}</span><strong>${raw ? content : escapeHtml(content)}</strong></div>`;
}

function repeatedItems(container: HTMLElement | undefined, empty: string) {
  const items = Array.from(container?.querySelectorAll<HTMLElement>(".repeat") || []);
  if (!items.length) return `<div class="agendaOverviewEmpty">${escapeHtml(empty)}</div>`;
  return `<div class="agendaOverviewList">${items.map((item, index) => {
    const title = text(item.querySelector(".row b")) || `Item ${index + 1}`;
    const rows = Array.from(item.querySelectorAll<HTMLElement>(".field")).map((field) => {
      const label = text(field.querySelector("label"));
      const value = controlValue(field.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea"));
      return label && value ? row(label, value) : "";
    }).join("");
    return `<article class="agendaOverviewItem"><b>${escapeHtml(title)}</b><div class="agendaOverviewRows">${rows}</div></article>`;
  }).join("")}</div>`;
}

type ReopenTarget = { title: string; time: string; client: string; originalTitle: string; originalTime: string; originalClient: string; requestedAt: number };

function timeFromInput(value: string) {
  const match = value.match(/T(\d{2}:\d{2})/);
  if (match?.[1]) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function captureTarget(source: HTMLElement) {
  const main = section(source, "Informações principais");
  const client = section(source, "Cliente");
  return {
    title: fieldValue(main, "Título") || text(source.querySelector(".dhead h2")),
    time: timeFromInput(fieldValue(main, "Início")),
    client: fieldValue(client, "Nome") || text(client?.querySelector(".contact b")),
  };
}

function createOverview(source: HTMLElement, requestReopen: (target: ReopenTarget) => void) {
  const overlay = source.parentElement;
  if (!overlay || source.dataset.agendaOverviewBound === "true") return;
  const title = text(source.querySelector(".dhead h2"));
  if (!title || normalize(title).includes("novo agendamento")) return;

  const main = section(source, "Informações principais");
  const client = section(source, "Cliente");
  const participants = section(source, "Participantes");
  const related = section(source, "Registros relacionados") || section(source, "Registro relacionado") || section(source, "Imóvel relacionado") || section(source, "Procedimento relacionado");
  const reminders = section(source, "Lembretes e confirmação");
  const result = section(source, "Resultado e informações internas");
  const history = section(source, "Histórico");

  const start = fieldValue(main, "Início");
  const end = fieldValue(main, "Fim");
  const status = fieldValue(main, "Status");
  const type = fieldValue(main, "Tipo") || "Sem tipo";
  const responsible = fieldValue(main, "Responsável") || "Sem responsável";
  const priority = fieldValue(main, "Prioridade") || "Normal";
  const location = fieldValue(main, "Local / endereço");
  const meeting = fieldValue(main, "Link da reunião");
  const description = fieldValue(main, "Descrição");
  const clientName = fieldValue(client, "Nome") || text(client?.querySelector(".contact b"));
  const clientPhone = fieldValue(client, "Telefone");
  const clientEmail = fieldValue(client, "E-mail");
  const finalStatus = fieldValue(result, "Status final");
  const resultSummary = fieldValue(result, "Resumo do resultado");
  const internalNotes = fieldValue(result, "Observações internas");
  const statusKey = normalize(status);
  const originalTarget = captureTarget(source);
  const contactLink = client?.querySelector<HTMLAnchorElement>('a[href^="/contatos"]')?.href || "";
  const whatsappLink = client?.querySelector<HTMLAnchorElement>('a[href*="wa.me"]')?.href || "";
  const googleLink = source.querySelector<HTMLAnchorElement>(".agendaGoogleEventOpen")?.href || "";
  const historyHtml = Array.from(history?.querySelectorAll<HTMLElement>(".hist") || []).map((item) => `<article class="agendaOverviewHistory"><b>${escapeHtml(text(item.querySelector("b")).replaceAll("_", " ") || "Alteração")}</b><p>${escapeHtml(text(item.querySelector("p")) || "Alteração registrada.")}</p><small>${escapeHtml(text(item.querySelector("small")))}</small></article>`).join("");

  const overview = document.createElement("aside");
  overview.className = "drawer agendaOverviewDrawer";
  overview.setAttribute("role", "dialog");
  overview.setAttribute("aria-modal", "true");
  overview.setAttribute("aria-label", `Panorama do agendamento ${title}`);
  overview.innerHTML = `
    <header class="agendaOverviewHeader">
      <div class="agendaOverviewIcon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg></div>
      <div class="agendaOverviewHeaderCopy"><h2>Panorama do agendamento</h2><p>Visualize todas as informações antes de realizar alterações.</p></div>
      <button type="button" class="btn agendaOverviewClose" data-action="close" aria-label="Fechar panorama">×</button>
    </header>
    <div class="agendaOverviewBody">
      <section class="agendaOverviewHero">
        <div class="agendaOverviewHeroTop"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(type)}</p></div><span class="agendaOverviewStatus" data-status="${escapeHtml(statusKey)}">${escapeHtml(status || "Sem status")}</span></div>
        <div class="agendaOverviewMetrics">
          <div class="agendaOverviewMetric"><span>Início</span><strong>${escapeHtml(dateTime(start))}</strong></div>
          <div class="agendaOverviewMetric"><span>Duração</span><strong>${escapeHtml(duration(start, end))}</strong></div>
          <div class="agendaOverviewMetric"><span>Cliente</span><strong>${escapeHtml(clientName || "Cliente não informado")}</strong></div>
          <div class="agendaOverviewMetric"><span>Responsável</span><strong>${escapeHtml(responsible)}</strong></div>
        </div>
      </section>
      <div class="agendaOverviewGrid">
        <section class="agendaOverviewSection"><h4>Informações principais</h4><div class="agendaOverviewRows">${row("Término", dateTime(end))}${row("Prioridade", priority)}${row("Local", location || "Não informado")}${meeting ? row("Reunião", `<a class="agendaOverviewLink" href="${escapeHtml(meeting)}" target="_blank" rel="noopener noreferrer">Abrir link da reunião</a>`, true) : row("Reunião", "Não informada")}</div></section>
        <section class="agendaOverviewSection"><h4>Cliente</h4><div class="agendaOverviewRows">${row("Nome", clientName || "Não informado")}${row("Telefone", clientPhone || "Não informado")}${row("E-mail", clientEmail || "Não informado")}</div></section>
        <section class="agendaOverviewSection full"><h4>Descrição</h4><p class="agendaOverviewText">${escapeHtml(description || "Nenhuma descrição foi adicionada.")}</p></section>
        <section class="agendaOverviewSection"><h4>Participantes</h4>${repeatedItems(participants, "Nenhum participante adicional.")}</section>
        <section class="agendaOverviewSection"><h4>Registros relacionados</h4>${repeatedItems(related, "Nenhum registro relacionado.")}</section>
        <section class="agendaOverviewSection full"><h4>Lembretes</h4>${repeatedItems(reminders, "Nenhum lembrete ativo.")}</section>
        <section class="agendaOverviewSection full"><h4>Resultado e informações internas</h4><div class="agendaOverviewRows">${row("Status final", finalStatus || status || "Não informado")}${row("Resultado", resultSummary || "Não informado")}</div><p class="agendaOverviewText" style="margin-top:11px">${escapeHtml(internalNotes || "Nenhuma observação interna.")}</p></section>
        <section class="agendaOverviewSection full"><h4>Histórico</h4>${historyHtml || '<div class="agendaOverviewEmpty">Sem alterações registradas.</div>'}</section>
      </div>
    </div>
    <footer class="agendaOverviewFooter">
      <div class="agendaOverviewFooterGroup">
        ${whatsappLink ? `<a class="btn" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        ${contactLink ? `<a class="btn" href="${escapeHtml(contactLink)}">Abrir contato</a>` : ""}
        ${googleLink ? `<a class="btn" href="${escapeHtml(googleLink)}" target="_blank" rel="noopener noreferrer">Abrir no Google</a>` : ""}
      </div>
      <div class="agendaOverviewFooterGroup"><button type="button" class="btn" data-action="close">Fechar</button><button type="button" class="btn primary" data-action="edit">Editar agendamento</button></div>
    </footer>`;

  let closingFromOverview = false;
  const showOverview = () => {
    source.dataset.agendaOverviewEditMode = "false";
    source.hidden = true;
    source.classList.add("agendaOverviewSourceHidden");
    overview.hidden = false;
    overview.classList.remove("agendaOverviewSourceHidden");
    window.requestAnimationFrame(() => overview.querySelector<HTMLButtonElement>('[data-action="edit"]')?.focus());
  };
  const showEditor = () => {
    source.dataset.agendaOverviewEditMode = "true";
    overview.hidden = true;
    overview.classList.add("agendaOverviewSourceHidden");
    source.hidden = false;
    source.classList.remove("agendaOverviewSourceHidden");
    window.requestAnimationFrame(() => source.querySelector<HTMLInputElement>(".body input")?.focus());
  };
  const closePanorama = () => {
    closingFromOverview = true;
    source.querySelector<HTMLButtonElement>(".dhead > button")?.click();
    closingFromOverview = false;
  };
  const returnToOverview = (event: Event) => {
    if (closingFromOverview || source.dataset.agendaOverviewEditMode !== "true") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showOverview();
  };
  const requestOverviewAfterSave = () => {
    const current = captureTarget(source);
    requestReopen({ ...current, originalTitle: originalTarget.title, originalTime: originalTarget.time, originalClient: originalTarget.client, requestedAt: Date.now() });
  };

  source.dataset.agendaOverviewBound = "true";
  overlay.appendChild(overview);
  showOverview();
  overview.querySelectorAll<HTMLButtonElement>('[data-action="close"]').forEach((button) => button.addEventListener("click", closePanorama));
  overview.querySelector<HTMLButtonElement>('[data-action="edit"]')?.addEventListener("click", showEditor);
  source.querySelector<HTMLButtonElement>(".dhead > button")?.addEventListener("click", returnToOverview, true);
  Array.from(source.querySelectorAll<HTMLButtonElement>(".foot button")).forEach((button) => {
    const action = normalize(text(button));
    if (action === "fechar") button.addEventListener("click", returnToOverview, true);
    if (action === "salvar" || action.includes("cancelar evento")) button.addEventListener("click", requestOverviewAfterSave, true);
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay && source.dataset.agendaOverviewEditMode === "true") returnToOverview(event);
  }, true);
  source.addEventListener("agenda:show-overview", showOverview);
}

function targetMatches(element: HTMLElement, target: ReopenTarget) {
  const content = text(element);
  const normalizedContent = normalize(content);
  return [
    { title: target.title, time: target.time, client: target.client },
    { title: target.originalTitle, time: target.originalTime, client: target.originalClient },
  ].some((option) => {
    if (!option.title || !normalizedContent.includes(normalize(option.title))) return false;
    if (option.time && !content.includes(option.time)) return false;
    if (option.client && !normalizedContent.includes(normalize(option.client))) return false;
    return true;
  });
}

function AgendaOverviewEnhancer() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shell) return;
    let frame = 0;
    let disposed = false;
    let reopenTimer = 0;
    let pendingReopen: ReopenTarget | null = null;

    const tryReopen = () => {
      reopenTimer = 0;
      if (disposed || !pendingReopen) return;
      if (Date.now() - pendingReopen.requestedAt > 12000) { pendingReopen = null; return; }
      if (Date.now() - pendingReopen.requestedAt < 900 || shell.querySelector(".a2 .overlay > .drawer")) {
        reopenTimer = window.setTimeout(tryReopen, 250);
        return;
      }
      const candidate = Array.from(shell.querySelectorAll<HTMLElement>("button.event,.aside .item")).find((element) => targetMatches(element, pendingReopen as ReopenTarget));
      if (candidate) { pendingReopen = null; candidate.click(); return; }
      reopenTimer = window.setTimeout(tryReopen, 300);
    };
    const requestReopen = (target: ReopenTarget) => {
      pendingReopen = target;
      if (reopenTimer) window.clearTimeout(reopenTimer);
      reopenTimer = window.setTimeout(tryReopen, 900);
    };
    const apply = () => {
      frame = 0;
      if (disposed) return;
      shell.querySelectorAll<HTMLElement>(".a2 .overlay > .drawer:not(.agendaOverviewDrawer)").forEach((drawer) => {
        if (drawer.dataset.agendaOverviewEditMode !== "true") createOverview(drawer, requestReopen);
      });
      if (pendingReopen && !reopenTimer) reopenTimer = window.setTimeout(tryReopen, 250);
    };
    const schedule = () => { if (!disposed && !frame) frame = window.requestAnimationFrame(apply); };
    const observer = new MutationObserver(schedule);
    observer.observe(shell, { childList: true, subtree: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const editor = shell.querySelector<HTMLElement>('.drawer[data-agenda-overview-edit-mode="true"]:not(.agendaOverviewSourceHidden)');
      if (editor) {
        event.preventDefault();
        editor.dispatchEvent(new Event("agenda:show-overview"));
        return;
      }
      shell.querySelector<HTMLButtonElement>('.agendaOverviewDrawer:not(.agendaOverviewSourceHidden) [data-action="close"]')?.click();
    };
    document.addEventListener("keydown", onKeyDown);
    apply();
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      if (frame) window.cancelAnimationFrame(frame);
      if (reopenTimer) window.clearTimeout(reopenTimer);
    };
  }, []);
  return null;
}

export default function AgendaEnhancer() {
  return (
    <>
      <style>{STYLES}</style>
      <AgendaEnhancerLegacy />
      <AgendaAutomationEnhancer />
      <AgendaAutomationRuntimeStatus />
      <AgendaGoogleAgendaBindingFix />
      <AgendaOverviewEnhancer />
    </>
  );
}
