"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AgendaCalendarIntegrationScopeEnhancer.module.css";

type Integration = {
  id: string;
  nome_conexao: string;
};

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

type ScopeView = {
  target: HTMLElement;
  modal: HTMLElement;
  calendarId: string;
  payload: OptionsPayload | null;
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createOption(value: string, label: string) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function flowCompatible(flow: Flow, selected: string[]) {
  if (selected.length === 0) return false;
  if (flow.modo_integracoes !== "selecionadas") return true;
  return (flow.integracao_whatsapp_ids || []).some((id) => selected.includes(id));
}

function applyAutomationFilters(
  modal: HTMLElement,
  payload: OptionsPayload,
  selected: string[],
) {
  const selectedSet = new Set(selected);
  const integrationMap = new Map(
    payload.integracoes.map((integration) => [integration.id, integration]),
  );

  modal
    .querySelectorAll<HTMLSelectElement>(
      '.agendaAutomationSection select[data-role="integration"]',
    )
    .forEach((select) => {
      const currentValue = select.value;
      const expectedValues = ["", ...selected].filter(
        (value) => value === "" || integrationMap.has(value),
      );
      const currentValues = Array.from(select.options).map(
        (option) => option.value,
      );

      if (currentValues.join("|") !== expectedValues.join("|")) {
        select.replaceChildren(createOption("", "Selecione"));
        selected.forEach((id) => {
          const integration = integrationMap.get(id);
          if (integration) {
            select.appendChild(createOption(integration.id, integration.nome_conexao));
          }
        });
      }

      select.value = selectedSet.has(currentValue) ? currentValue : "";
      if (currentValue && !selectedSet.has(currentValue)) {
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

  const flowSelect = modal.querySelector<HTMLSelectElement>(
    '.agendaAutomationSection [data-rule="pos_atendimento"] select[data-role="flow"]',
  );

  if (!flowSelect) return;

  const currentFlow = flowSelect.value;
  const compatibleFlows = (payload.todos_fluxos || []).filter((flow) =>
    flowCompatible(flow, selected),
  );
  const expectedFlowValues = ["", ...compatibleFlows.map((flow) => flow.id)];
  const currentFlowValues = Array.from(flowSelect.options).map(
    (option) => option.value,
  );

  if (currentFlowValues.join("|") !== expectedFlowValues.join("|")) {
    flowSelect.replaceChildren(createOption("", "Selecione um fluxo"));
    compatibleFlows.forEach((flow) => {
      flowSelect.appendChild(createOption(flow.id, flow.nome));
    });
  }

  flowSelect.value = compatibleFlows.some((flow) => flow.id === currentFlow)
    ? currentFlow
    : "";
}

export default function AgendaCalendarIntegrationScopeEnhancer() {
  const [view, setView] = useState<ScopeView | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const selectedRef = useRef<string[]>([]);
  const selectedByCalendarRef = useRef(new Map<string, string[]>());
  const currentModalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    selectedRef.current = selectedIds;

    if (!view?.payload) return;

    selectedByCalendarRef.current.set(
      view.calendarId || "__new__",
      selectedIds,
    );
    applyAutomationFilters(view.modal, view.payload, selectedIds);
  }, [selectedIds, view]);

  useEffect(() => {
    let disposed = false;
    let animationFrame = 0;
    const originalFetch = window.fetch.bind(window);

    const currentCalendarId = () =>
      document.querySelector<HTMLSelectElement>(
        ".agendaTemplateShell .a2 .head select.select",
      )?.value || "";

    const currentModal = () =>
      document.querySelector<HTMLElement>(
        ".agendaTemplateShell .a2 .modalbg .modal",
      );

    const selectedForCalendar = (calendarId: string) => {
      if (selectedRef.current.length > 0) return selectedRef.current;
      return (
        selectedByCalendarRef.current.get(calendarId) ||
        selectedByCalendarRef.current.get("__new__") ||
        []
      );
    };

    const patchJsonRequest = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): RequestInit | undefined => {
      const method = String(
        init?.method || (input instanceof Request ? input.method : "GET"),
      ).toUpperCase();

      if (!["POST", "PATCH", "PUT"].includes(method) || !init?.body) {
        return init;
      }

      const url = String(input instanceof Request ? input.url : input);
      const isCalendarSave =
        /\/api\/agendas(?:\/[0-9a-f-]+)?(?:\?.*)?$/i.test(url) &&
        !url.includes("/automacoes");
      const isAutomationSave =
        /\/api\/agendas\/([0-9a-f-]+)\/automacoes/i.test(url);

      if (!isCalendarSave && !isAutomationSave) return init;

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(String(init.body));
      } catch {
        return init;
      }

      const match = url.match(/\/api\/agendas\/([0-9a-f-]+)/i);
      const calendarId = match?.[1] || currentCalendarId();
      const selected = selectedForCalendar(calendarId);

      if (selected.length === 0) return init;

      selectedByCalendarRef.current.set(calendarId || "__new__", selected);

      return {
        ...init,
        headers: {
          ...(init.headers || {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          integracao_whatsapp_ids: selected,
        }),
      };
    };

    window.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const patchedInit = patchJsonRequest(input, init);
      const response = await originalFetch(input, patchedInit);
      const url = String(input instanceof Request ? input.url : input);
      const method = String(
        patchedInit?.method ||
          (input instanceof Request ? input.method : "GET"),
      ).toUpperCase();

      if (method === "POST" && /\/api\/agendas(?:\?.*)?$/i.test(url)) {
        try {
          const data = await response.clone().json();
          const createdId = String(data?.agenda?.id || "");
          const selected =
            selectedByCalendarRef.current.get("__new__") ||
            selectedRef.current;

          if (createdId && selected.length > 0) {
            selectedByCalendarRef.current.set(createdId, selected);
          }
        } catch {
          // A resposta original permanece intacta para o chamador.
        }
      }

      return response;
    }) as typeof window.fetch;

    const clearView = () => {
      currentModalRef.current = null;
      setView(null);
      setSelectedIds([]);
      selectedRef.current = [];
      setError("");
    };

    const bindModal = async (modal: HTMLElement) => {
      const title = normalize(modal.querySelector(".dhead h2")?.textContent);
      const isCalendarConfig = [
        "configurar agenda",
        "configurar calendario",
        "nova agenda",
        "novo calendario",
        "gerenciar agenda",
        "gerenciar calendario",
      ].some((expected) => title.includes(expected));
      const automationSection = modal.querySelector<HTMLElement>(
        ".agendaAutomationSection",
      );

      if (!isCalendarConfig || !automationSection) {
        clearView();
        return;
      }

      currentModalRef.current = modal;
      const isNew = title.includes("nova ") || title.includes("novo ");
      const calendarId = isNew ? "" : currentCalendarId();
      const host = document.createElement("div");
      host.className = styles.portalHost;
      host.dataset.agendaCalendarIntegrationHost = "true";
      automationSection.insertAdjacentElement("beforebegin", host);

      setView({
        target: host,
        modal,
        calendarId,
        payload: null,
      });
      setError("");

      try {
        const query = calendarId
          ? `?agenda_id=${encodeURIComponent(calendarId)}`
          : "";
        const response = await originalFetch(
          `/api/agendas/automacoes/opcoes${query}`,
          { cache: "no-store" },
        );
        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao carregar integrações.");
        }

        if (disposed || !modal.isConnected || !host.isConnected) return;

        const payload = data as OptionsPayload;
        const saved =
          selectedByCalendarRef.current.get(calendarId || "__new__") ||
          payload.agenda_integracao_whatsapp_ids ||
          payload.integracoes.map((integration) => integration.id);
        const validSelection = saved.filter((id) =>
          payload.integracoes.some((integration) => integration.id === id),
        );
        const initialSelection =
          validSelection.length > 0
            ? validSelection
            : payload.integracoes.map((integration) => integration.id);

        selectedRef.current = initialSelection;
        selectedByCalendarRef.current.set(
          calendarId || "__new__",
          initialSelection,
        );
        setSelectedIds(initialSelection);
        setView({
          target: host,
          modal,
          calendarId,
          payload,
        });
        applyAutomationFilters(modal, payload, initialSelection);
      } catch (loadError) {
        if (disposed || !host.isConnected) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as integrações deste calendário.",
        );
      }
    };

    const apply = () => {
      animationFrame = 0;
      if (disposed) return;

      const modal = currentModal();
      if (!modal) {
        if (currentModalRef.current) clearView();
        return;
      }

      if (currentModalRef.current === modal) return;
      void bindModal(modal);
    };

    const schedule = () => {
      if (!animationFrame && !disposed) {
        animationFrame = window.requestAnimationFrame(apply);
      }
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.fetch = originalFetch;
      currentModalRef.current = null;
    };
  }, []);

  const toggleIntegration = (integrationId: string, checked: boolean) => {
    const nextSelection = checked
      ? Array.from(new Set([...selectedIds, integrationId]))
      : selectedIds.filter((id) => id !== integrationId);

    if (nextSelection.length === 0) {
      setError("Mantenha ao menos uma integração selecionada para este calendário.");
      return;
    }

    setError("");
    setSelectedIds(nextSelection);
  };

  if (!view) return null;

  return createPortal(
    <section className={styles.scope} aria-label="Integrações do calendário">
      <div className={styles.header}>
        <div>
          <h4>Integrações do calendário</h4>
          <p>
            Escolha quais números do WhatsApp poderão executar fluxos,
            confirmações, lembretes e pós-atendimento neste calendário.
          </p>
        </div>
        <span className={styles.count}>
          {selectedIds.length} selecionada{selectedIds.length === 1 ? "" : "s"}
        </span>
      </div>

      {view.payload ? (
        <>
          <div className={styles.list}>
            {view.payload.integracoes.map((integration) => {
              const checked = selectedIds.includes(integration.id);
              return (
                <label
                  className={`${styles.option} ${
                    checked ? styles.optionSelected : ""
                  }`}
                  key={integration.id}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      toggleIntegration(integration.id, event.target.checked)
                    }
                  />
                  <span className={styles.optionText}>
                    {integration.nome_conexao}
                  </span>
                </label>
              );
            })}
          </div>
          <p className={styles.hint}>
            Fluxos exclusivos de integrações não selecionadas serão ocultados.
            Com apenas uma integração, todas as automações deste calendário ficam
            restritas a ela.
          </p>
        </>
      ) : !error ? (
        <div className={styles.loading}>Carregando integrações...</div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </section>,
    view.target,
  );
}
