"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-calendar-integration-scope-v1";

type Integration = { id: string; nome_conexao: string };
type Flow = {
  id: string;
  nome: string;
  status: string;
  modo_integracoes?: "todas" | "selecionadas";
  integracao_whatsapp_ids?: string[];
};
type OptionsPayload = {
  integracoes: Integration[];
  todos_fluxos?: Flow[];
  agenda_integracao_whatsapp_ids?: string[];
};

const CSS = `
.agendaCalendarIntegrationScope{position:relative;margin:0 0 14px;padding:15px;border:1px solid color-mix(in srgb,var(--crm-primary-border) 76%,var(--crm-border));border-radius:16px;background:linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-primary-soft) 30%,var(--crm-surface)));box-shadow:0 10px 24px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent)}
.agendaCalendarIntegrationScope:before{content:"";position:absolute;inset:0 0 auto;height:3px;border-radius:16px 16px 0 0;background:linear-gradient(90deg,var(--crm-primary-strong),var(--crm-success-strong))}
.agendaCalendarIntegrationHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.agendaCalendarIntegrationHead h4{margin:0;color:var(--crm-text-strong);font-size:14px;font-weight:900}.agendaCalendarIntegrationHead p{margin:4px 0 0;color:var(--crm-text-muted);font-size:11px;line-height:1.5}
.agendaCalendarIntegrationCount{flex:0 0 auto;min-height:25px;padding:0 9px;border:1px solid var(--crm-success-border);border-radius:999px;background:var(--crm-success-bg);color:var(--crm-success-text);display:inline-flex;align-items:center;font-size:9.5px;font-weight:900}
.agendaCalendarIntegrationList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.agendaCalendarIntegrationOption{min-width:0;padding:10px 11px;border:1px solid var(--crm-border);border-radius:12px;background:var(--crm-surface);display:flex;align-items:flex-start;gap:9px;cursor:pointer}.agendaCalendarIntegrationOption.isSelected{border-color:var(--crm-primary-border);background:var(--crm-primary-soft)}.agendaCalendarIntegrationOption input{width:17px;height:17px;margin:1px 0 0;accent-color:var(--crm-primary-strong);flex:0 0 auto}.agendaCalendarIntegrationOption span{min-width:0;color:var(--crm-text-strong);font-size:10.5px;font-weight:800;line-height:1.4;overflow-wrap:anywhere}
.agendaCalendarIntegrationHint{margin:10px 0 0;color:var(--crm-text-muted);font-size:10px;line-height:1.5}.agendaCalendarIntegrationError{display:none;margin-top:9px;padding:9px 10px;border:1px solid var(--crm-danger-border);border-radius:10px;background:var(--crm-danger-bg);color:var(--crm-danger-text);font-size:10px;line-height:1.45}.agendaCalendarIntegrationError.show{display:block}@media(max-width:760px){.agendaCalendarIntegrationList{grid-template-columns:1fr}}
`;

function normalize(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function option(value: string, label: string) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}
function flowCompatible(flow: Flow, selected: string[]) {
  if (selected.length === 0) return false;
  if (flow.modo_integracoes !== "selecionadas") return true;
  return (flow.integracao_whatsapp_ids || []).some((id) => selected.includes(id));
}

export default function AgendaCalendarIntegrationScopeEnhancer() {
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const selectedByCalendar = new Map<string, string[]>();
    const payloadByModal = new WeakMap<HTMLElement, OptionsPayload>();
    const originalFetch = window.fetch.bind(window);

    let style = document.getElementById(STYLE_ID);
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const currentCalendarId = () => document.querySelector<HTMLSelectElement>(".agendaTemplateShell .a2 .head select.select")?.value || "";
    const currentModal = () => document.querySelector<HTMLElement>(".agendaTemplateShell .a2 .modalbg .modal");
    const currentScope = () => currentModal()?.querySelector<HTMLElement>(".agendaCalendarIntegrationScope") || null;
    const selectedFromScope = (scope: HTMLElement | null) => scope
      ? Array.from(scope.querySelectorAll<HTMLInputElement>('input[data-calendar-integration]:checked')).map((input) => input.value)
      : [];
    const rememberSelection = (calendarId: string, selected: string[]) => selectedByCalendar.set(calendarId || "__new__", selected);

    const patchJsonRequest = (input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined => {
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (!["POST", "PATCH", "PUT"].includes(method) || !init?.body) return init;
      const url = String(input instanceof Request ? input.url : input);
      const isCalendarSave = /\/api\/agendas(?:\/[0-9a-f-]+)?(?:\?.*)?$/i.test(url) && !url.includes("/automacoes");
      const isAutomationSave = /\/api\/agendas\/([0-9a-f-]+)\/automacoes/i.test(url);
      if (!isCalendarSave && !isAutomationSave) return init;
      let body: Record<string, unknown>;
      try { body = JSON.parse(String(init.body)); } catch { return init; }
      const scope = currentScope();
      let selected = selectedFromScope(scope);
      const match = url.match(/\/api\/agendas\/([0-9a-f-]+)/i);
      const calendarId = match?.[1] || currentCalendarId();
      if (selected.length === 0) selected = selectedByCalendar.get(calendarId) || selectedByCalendar.get("__new__") || [];
      if (selected.length === 0) return init;
      rememberSelection(calendarId, selected);
      return {
        ...init,
        headers: { ...(init.headers || {}), "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, integracao_whatsapp_ids: selected }),
      };
    };

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const patchedInit = patchJsonRequest(input, init);
      const response = await originalFetch(input, patchedInit);
      const url = String(input instanceof Request ? input.url : input);
      const method = String(patchedInit?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && /\/api\/agendas(?:\?.*)?$/i.test(url)) {
        try {
          const data = await response.clone().json();
          const createdId = String(data?.agenda?.id || "");
          const selected = selectedByCalendar.get("__new__") || [];
          if (createdId && selected.length > 0) rememberSelection(createdId, selected);
        } catch { /* mantém a resposta original intacta */ }
      }
      return response;
    }) as typeof window.fetch;

    const applyFilters = (modal: HTMLElement) => {
      const scope = modal.querySelector<HTMLElement>(".agendaCalendarIntegrationScope");
      const payload = payloadByModal.get(modal);
      if (!scope || !payload) return;
      const selected = selectedFromScope(scope);
      const selectedSet = new Set(selected);
      const integrationMap = new Map(payload.integracoes.map((item) => [item.id, item]));

      modal.querySelectorAll<HTMLSelectElement>('.agendaAutomationSection select[data-role="integration"]').forEach((select) => {
        const current = select.value;
        const wanted = ["", ...selected].filter((value) => value === "" || integrationMap.has(value));
        const currentValues = Array.from(select.options).map((item) => item.value);
        if (currentValues.join("|") !== wanted.join("|")) {
          select.replaceChildren(option("", "Selecione"));
          selected.forEach((id) => {
            const item = integrationMap.get(id);
            if (item) select.appendChild(option(item.id, item.nome_conexao));
          });
        }
        select.value = selectedSet.has(current) ? current : "";
        if (current && !selectedSet.has(current)) select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const flowSelect = modal.querySelector<HTMLSelectElement>('.agendaAutomationSection [data-rule="pos_atendimento"] select[data-role="flow"]');
      if (flowSelect) {
        const current = flowSelect.value;
        const compatible = (payload.todos_fluxos || []).filter((flow) => flowCompatible(flow, selected));
        const wanted = ["", ...compatible.map((flow) => flow.id)];
        const currentValues = Array.from(flowSelect.options).map((item) => item.value);
        if (currentValues.join("|") !== wanted.join("|")) {
          flowSelect.replaceChildren(option("", "Selecione um fluxo"));
          compatible.forEach((flow) => flowSelect.appendChild(option(flow.id, flow.nome)));
        }
        flowSelect.value = compatible.some((flow) => flow.id === current) ? current : "";
      }

      const count = scope.querySelector<HTMLElement>(".agendaCalendarIntegrationCount");
      if (count) count.textContent = `${selected.length} selecionada${selected.length === 1 ? "" : "s"}`;
      scope.querySelectorAll<HTMLElement>(".agendaCalendarIntegrationOption").forEach((label) => {
        const input = label.querySelector<HTMLInputElement>("input");
        label.classList.toggle("isSelected", input?.checked === true);
      });
      rememberSelection(scope.dataset.calendarId || currentCalendarId(), selected);
    };

    const renderScope = (modal: HTMLElement, payload: OptionsPayload, calendarId: string) => {
      const automationSection = modal.querySelector<HTMLElement>(".agendaAutomationSection");
      if (!automationSection) return;
      payloadByModal.set(modal, payload);
      let scope = modal.querySelector<HTMLElement>(".agendaCalendarIntegrationScope");
      if (!scope) {
        scope = document.createElement("section");
        scope.className = "agendaCalendarIntegrationScope";
        automationSection.insertAdjacentElement("beforebegin", scope);
      }
      scope.dataset.calendarId = calendarId || "__new__";
      const saved = selectedByCalendar.get(calendarId || "__new__") || payload.agenda_integracao_whatsapp_ids || payload.integracoes.map((item) => item.id);
      const selected = saved.filter((id) => payload.integracoes.some((item) => item.id === id));
      const initial = selected.length > 0 ? selected : payload.integracoes.map((item) => item.id);
      rememberSelection(calendarId, initial);
      scope.innerHTML = `<div class="agendaCalendarIntegrationHead"><div><h4>Integrações do calendário</h4><p>Escolha quais números do WhatsApp poderão executar fluxos, confirmações, lembretes e pós-atendimento neste calendário.</p></div><span class="agendaCalendarIntegrationCount"></span></div><div class="agendaCalendarIntegrationList"></div><p class="agendaCalendarIntegrationHint">Fluxos exclusivos de integrações não selecionadas serão ocultados. Com apenas uma integração, todas as automações deste calendário ficam restritas a ela.</p><div class="agendaCalendarIntegrationError"></div>`;
      const list = scope.querySelector<HTMLElement>(".agendaCalendarIntegrationList");
      payload.integracoes.forEach((integration) => {
        const label = document.createElement("label");
        label.className = "agendaCalendarIntegrationOption";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = integration.id;
        input.checked = initial.includes(integration.id);
        input.dataset.calendarIntegration = "true";
        const text = document.createElement("span");
        text.textContent = integration.nome_conexao;
        label.append(input, text);
        list?.appendChild(label);
        input.addEventListener("change", () => {
          const checked = selectedFromScope(scope!);
          const error = scope!.querySelector<HTMLElement>(".agendaCalendarIntegrationError");
          if (checked.length === 0) {
            input.checked = true;
            if (error) {
              error.textContent = "Mantenha ao menos uma integração selecionada para este calendário.";
              error.classList.add("show");
            }
          } else error?.classList.remove("show");
          applyFilters(modal);
        });
      });
      applyFilters(modal);
    };

    const bind = async (modal: HTMLElement) => {
      if (modal.dataset.calendarIntegrationBound === "true") {
        applyFilters(modal);
        return;
      }
      const title = normalize(modal.querySelector(".dhead h2")?.textContent);
      const isCalendarConfig = title.includes("configurar agenda") || title.includes("configurar calendario") || title.includes("nova agenda") || title.includes("novo calendario");
      if (!isCalendarConfig || !modal.querySelector(".agendaAutomationSection")) return;
      modal.dataset.calendarIntegrationBound = "true";
      const isNew = title.includes("nova ") || title.includes("novo ");
      const calendarId = isNew ? "" : currentCalendarId();
      try {
        const query = calendarId ? `?agenda_id=${encodeURIComponent(calendarId)}` : "";
        const response = await originalFetch(`/api/agendas/automacoes/opcoes${query}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar integrações.");
        if (!disposed && modal.isConnected) renderScope(modal, data as OptionsPayload, calendarId);
      } catch (error) {
        delete modal.dataset.calendarIntegrationBound;
        console.error("[AGENDA_INTEGRACOES] Falha ao preparar seletor:", error);
      }
    };

    const apply = () => {
      frame = 0;
      if (disposed) return;
      const modal = currentModal();
      if (modal) void bind(modal);
    };
    const schedule = () => { if (!frame && !disposed) frame = window.requestAnimationFrame(apply); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.fetch = originalFetch;
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
