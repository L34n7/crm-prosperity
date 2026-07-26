"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-google-agenda-binding-fix";
const CSS = `
.agendaTemplateShell .agendaGoogleHeaderSummary[hidden],
.agendaTemplateShell .agendaGoogleLegacyHidden{display:none!important}
.agendaTemplateShell .a2 .head .actions>select.select+button.btn{display:none!important}
.agendaTemplateShell .agendaGoogleBindingCard{position:relative}
.agendaTemplateShell .agendaGoogleBindingCard[data-loading="true"]{opacity:.78}
.agendaTemplateShell .agendaGoogleBindingCard .agendaGoogleBindingStatus{max-width:320px;color:var(--crm-text-muted);font-size:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.agendaTemplateShell .agendaGoogleBindingCard .agendaGoogleBindingPrimary{min-width:138px}
.agendaTemplateShell .agendaGoogleBindingCard .agendaGoogleBindingDisconnect{min-width:104px!important;width:auto!important;padding:0 11px!important}
@media(max-width:860px){.agendaTemplateShell .agendaGoogleBindingCard .agendaGoogleCardActions{flex-wrap:wrap!important}.agendaTemplateShell .agendaGoogleBindingCard .agendaGoogleBindingPrimary,.agendaTemplateShell .agendaGoogleBindingCard .agendaGoogleBindingDisconnect{flex:1 1 160px}}
`;

type GoogleMeta = {
  conectado?: boolean;
  email?: string | null;
  bidirecional_ativa?: boolean;
  sync_status?: string | null;
  ultimo_erro?: string | null;
};

function text(element: Element | null) {
  return element?.textContent?.trim() || "";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function setText(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function selectedAgendaId(shell: HTMLElement) {
  return shell.querySelector<HTMLSelectElement>(".a2 .head select.select")?.value || "";
}

function legacyRefreshButton(shell: HTMLElement) {
  const select = shell.querySelector<HTMLSelectElement>(".a2 .head .actions > select.select");
  const next = select?.nextElementSibling;
  return next instanceof HTMLButtonElement && !next.classList.contains("agendaHeaderSync")
    ? next
    : null;
}

function insertAfterDescription(modal: HTMLElement, element: HTMLElement) {
  const description = Array.from(
    modal.querySelectorAll<HTMLElement>(".body > .form > .field")
  ).find(
    (field) => normalize(text(field.querySelector("label"))) === "descricao"
  );
  const form = modal.querySelector<HTMLElement>(".body > .form");

  if (description?.parentElement) description.insertAdjacentElement("afterend", element);
  else if (form) form.appendChild(element);
  else modal.querySelector<HTMLElement>(".body")?.appendChild(element);
}

function ensureBindingCard(modal: HTMLElement) {
  let card = modal.querySelector<HTMLElement>(".agendaGoogleBindingCard");
  if (card) return card;

  card = document.createElement("section");
  card.className = "side agendaGoogleConfigCard agendaGoogleBindingCard";
  card.innerHTML = `
    <div class="agendaGoogleMark" aria-hidden="true"></div>
    <h3>Google Calendar</h3>
    <p class="agendaGoogleSubtitle">Vincule somente esta agenda e mantenha criação, alterações e cancelamentos sincronizados.</p>
    <div class="mini agendaGoogleState">
      <span class="pill"></span>
      <span class="agendaGoogleBindingStatus"></span>
      <span class="agendaGoogleOfficial">Integração oficial</span>
      <span class="agendaGoogleBiBadge" hidden>Bidirecional ativa</span>
    </div>
    <div class="mini agendaGoogleCardActions">
      <button type="button" class="btn agendaGoogleSync agendaGoogleBindingPrimary" data-google-agenda-action="primary"></button>
      <button type="button" class="btn agendaGoogleDanger agendaGoogleBindingDisconnect" data-google-agenda-action="disconnect" hidden>Desvincular</button>
    </div>
  `;
  insertAfterDescription(modal, card);
  return card;
}

export default function AgendaGoogleAgendaBindingFix() {
  useEffect(() => {
    const shellElement = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shellElement) return;
    const shell: HTMLElement = shellElement;

    let disposed = false;
    let frame = 0;
    let requestSequence = 0;
    let currentAgendaId = "";
    let loading = false;
    let meta: GoogleMeta = { conectado: false };

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const schedule = () => {
      if (disposed || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    };

    const load = async (force = false) => {
      const agendaId = selectedAgendaId(shell);
      if (!agendaId) {
        requestSequence += 1;
        currentAgendaId = "";
        loading = false;
        meta = { conectado: false };
        schedule();
        return;
      }
      if (!force && agendaId === currentAgendaId) return;

      const changed = agendaId !== currentAgendaId;
      currentAgendaId = agendaId;
      loading = true;
      if (changed) meta = { conectado: false };
      const requestId = ++requestSequence;
      schedule();

      try {
        const response = await fetch(
          `/api/agendas/${encodeURIComponent(agendaId)}/google-calendar`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (
          disposed ||
          requestId !== requestSequence ||
          selectedAgendaId(shell) !== agendaId
        ) return;

        meta = response.ok && data?.ok
          ? (data.integracao as GoogleMeta) || { conectado: false }
          : { conectado: false, ultimo_erro: data?.error || null };
      } catch (error) {
        if (
          disposed ||
          requestId !== requestSequence ||
          selectedAgendaId(shell) !== agendaId
        ) return;
        meta = {
          conectado: false,
          ultimo_erro:
            error instanceof Error
              ? error.message
              : "Não foi possível consultar o vínculo com o Google Calendar.",
        };
      } finally {
        if (
          !disposed &&
          requestId === requestSequence &&
          selectedAgendaId(shell) === agendaId
        ) {
          loading = false;
          schedule();
        }
      }
    };

    const connect = () => {
      const agendaId = selectedAgendaId(shell);
      if (!agendaId) return;
      window.location.href = `/api/agendas/${encodeURIComponent(
        agendaId
      )}/google-calendar?acao=conectar`;
    };

    const synchronize = async (button: HTMLButtonElement | null) => {
      const agendaId = selectedAgendaId(shell);
      if (!agendaId || loading) return;
      button?.classList.add("isBusy");
      if (button) button.disabled = true;
      try {
        const response = await fetch(
          `/api/agendas/${encodeURIComponent(agendaId)}/google-calendar`,
          { method: "POST" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao sincronizar Google Calendar.");
        }
        await load(true);
        legacyRefreshButton(shell)?.click();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Erro ao sincronizar Google Calendar.");
      } finally {
        button?.classList.remove("isBusy");
        if (button) button.disabled = false;
      }
    };

    const disconnect = async (button: HTMLButtonElement | null) => {
      const agendaId = selectedAgendaId(shell);
      if (!agendaId || loading) return;
      if (!window.confirm("Deseja desvincular somente esta agenda do Google Calendar?")) return;
      if (button) button.disabled = true;
      try {
        const response = await fetch(
          `/api/agendas/${encodeURIComponent(agendaId)}/google-calendar`,
          { method: "DELETE" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao desvincular Google Calendar.");
        }
        await load(true);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Erro ao desvincular Google Calendar.");
      } finally {
        if (button) button.disabled = false;
      }
    };

    const alignLegacyCard = () => {
      const connected = meta.conectado === true && !loading;
      Array.from(
        shell.querySelectorAll<HTMLElement>(".a2 .aside .side, .a2 .modal .side")
      )
        .filter(
          (card) =>
            !card.classList.contains("agendaGoogleBindingCard") &&
            text(card.querySelector("h3")).includes("Google Calendar")
        )
        .forEach((card) => {
          card.classList.add("agendaGoogleLegacyHidden");
          card.dataset.connected = String(connected);
          const pill = card.querySelector<HTMLElement>(".pill");
          setText(pill, connected ? "Conectado" : "Desconectado");
          pill?.classList.toggle("on", connected);
        });
    };

    const renderHeader = () => {
      const head = shell.querySelector<HTMLElement>(".a2 .head");
      const slot = head?.firstElementChild as HTMLElement | null;
      const actions = head?.querySelector<HTMLElement>(".actions");
      if (!head || !slot || !actions) return;

      head.classList.add("agendaHeadPremium");
      slot.classList.add("agendaGoogleSlot");
      actions.classList.add("agendaActionsPremium");
      actions.querySelector<HTMLSelectElement>("select.select")?.classList.add("agendaAgendaSelect");

      let summary = slot.querySelector<HTMLElement>(".agendaGoogleHeaderSummary");
      if (!summary) {
        summary = document.createElement("div");
        summary.className = "agendaGoogleHeaderSummary";
        summary.innerHTML =
          '<span class="agendaGoogleMiniMark" aria-hidden="true"></span><div class="agendaGoogleHeaderText"><strong>Google Calendar</strong><small></small></div>';
        slot.appendChild(summary);
      }

      const connected = meta.conectado === true && !loading;
      summary.hidden = !connected;
      summary.classList.toggle("isConnected", connected);
      summary.classList.toggle("isError", meta.sync_status === "erro");
      if (connected) {
        const detail = meta.sync_status === "erro"
          ? `Sincronização requer atenção${meta.email ? ` · ${meta.email}` : ""}`
          : meta.bidirecional_ativa
            ? `Bidirecional ativa${meta.email ? ` · ${meta.email}` : ""}`
            : `Conectado${meta.email ? ` · ${meta.email}` : ""}`;
        setText(summary.querySelector("small"), detail);
        if (meta.ultimo_erro) summary.title = meta.ultimo_erro;
        else summary.removeAttribute("title");
      }

      let syncButton = actions.querySelector<HTMLButtonElement>(".agendaHeaderSync");
      if (!syncButton) {
        syncButton = document.createElement("button");
        syncButton.type = "button";
        syncButton.className = "btn agendaHeaderSync";
        syncButton.innerHTML =
          '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg><span></span>';
        actions.appendChild(syncButton);
      }
      syncButton.dataset.googleAgendaAction = "header";
      syncButton.disabled = !currentAgendaId || loading;
      setText(
        syncButton.querySelector("span"),
        loading ? "Verificando..." : connected ? "Sincronizar" : "Conectar Google"
      );
    };

    const renderModal = () => {
      const modal = shell.querySelector<HTMLElement>(".a2 .modalbg .modal");
      if (!modal || !text(modal.querySelector(".dhead h2")).includes("Configurar agenda")) return;

      modal
        .querySelectorAll<HTMLElement>(".agendaGoogleConfigCard:not(.agendaGoogleBindingCard)")
        .forEach((card) => card.classList.add("agendaGoogleLegacyHidden"));

      const card = ensureBindingCard(modal);
      const connected = meta.conectado === true && !loading;
      card.dataset.connected = String(connected);
      card.dataset.loading = String(loading);

      const pill = card.querySelector<HTMLElement>(".pill");
      pill?.classList.toggle("on", connected);
      setText(pill, loading ? "Verificando" : connected ? "Conectado" : "Não conectado");
      setText(
        card.querySelector(".agendaGoogleBindingStatus"),
        loading
          ? "Consultando o vínculo desta agenda..."
          : connected
            ? meta.email || "Conta Google conectada a esta agenda"
            : meta.ultimo_erro || "Esta agenda ainda não está vinculada ao Google Calendar."
      );

      const bi = card.querySelector<HTMLElement>(".agendaGoogleBiBadge");
      if (bi) bi.hidden = !connected || !meta.bidirecional_ativa;

      const primary = card.querySelector<HTMLButtonElement>(".agendaGoogleBindingPrimary");
      if (primary) {
        primary.disabled = loading || !currentAgendaId;
        setText(
          primary,
          loading ? "Verificando..." : connected ? "Sincronizar agora" : "Conectar esta agenda"
        );
      }

      const remove = card.querySelector<HTMLButtonElement>(".agendaGoogleBindingDisconnect");
      if (remove) {
        remove.hidden = !connected;
        remove.disabled = loading;
      }
    };

    function render() {
      if (disposed) return;
      const selected = selectedAgendaId(shell);
      if (selected !== currentAgendaId && !loading) void load(true);
      alignLegacyCard();
      renderHeader();
      renderModal();
    }

    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.matches(".a2 .head select.select")) {
        void load(true);
      }
    };

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;

      const action = button.dataset.googleAgendaAction;
      if (!action && !button.classList.contains("agendaHeaderSync")) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const connected = meta.conectado === true && !loading;
      if (action === "disconnect") void disconnect(button);
      else if (connected) void synchronize(button);
      else connect();
    };

    const onOauthMessage = (event: MessageEvent) => {
      if (event.data?.type === "google-calendar-oauth") {
        window.setTimeout(() => void load(true), 350);
      }
    };

    shell.addEventListener("change", onChange, true);
    shell.addEventListener("click", onClick, true);
    window.addEventListener("message", onOauthMessage);

    const observer = new MutationObserver(schedule);
    observer.observe(shell, { childList: true, subtree: true });

    void load(true);
    schedule();

    return () => {
      disposed = true;
      requestSequence += 1;
      observer.disconnect();
      shell.removeEventListener("change", onChange, true);
      shell.removeEventListener("click", onClick, true);
      window.removeEventListener("message", onOauthMessage);
      if (frame) window.cancelAnimationFrame(frame);
      if (ownsStyle) style?.remove();
      shell
        .querySelectorAll<HTMLElement>(".agendaGoogleLegacyHidden")
        .forEach((element) => element.classList.remove("agendaGoogleLegacyHidden"));
    };
  }, []);

  return null;
}
