"use client";

import { useEffect } from "react";

const CONNECT_FLAG = "crm:agenda:conectar-google-apos-criar";
const STYLE_ID = "agenda-premium-stage23";

type Nicho = { codigo: string; nome: string; grupo: string };
type Relacionado = { tipos: string[]; titulo: string; dica: string; botao: string };
type GoogleMeta = {
  conectado?: boolean;
  email?: string | null;
  bidirecional_ativa?: boolean;
  sync_status?: string | null;
  ultimo_erro?: string | null;
  conflitos_recentes?: number;
  ultima_sincronizacao_em?: string | null;
};
type GoogleLink = {
  agendamento_id: string;
  google_html_link?: string | null;
  conflito_status?: string | null;
  conflito_detalhes?: Record<string, unknown> | null;
  agendamento?: {
    id: string;
    titulo: string;
    inicio_at: string;
    fim_at: string;
    status: string;
  } | null;
};

const TODOS = [
  "imovel",
  "veiculo",
  "procedimento",
  "oportunidade",
  "ordem_servico",
  "processo",
  "outro",
];

const POR_NICHO: Record<string, Relacionado> = {
  imobiliaria: {
    tipos: ["imovel"],
    titulo: "Imóvel relacionado",
    dica: "Vincule o imóvel que será apresentado, visitado ou negociado neste agendamento.",
    botao: "Adicionar imóvel",
  },
  medicina: {
    tipos: ["procedimento"],
    titulo: "Procedimento relacionado",
    dica: "Vincule o procedimento ou atendimento clínico relacionado ao compromisso.",
    botao: "Adicionar procedimento",
  },
  odontologia: {
    tipos: ["procedimento"],
    titulo: "Procedimento relacionado",
    dica: "Vincule o procedimento odontológico relacionado ao compromisso.",
    botao: "Adicionar procedimento",
  },
  comercio: {
    tipos: ["oportunidade", "ordem_servico", "outro"],
    titulo: "Registro relacionado",
    dica: "Vincule a oportunidade, ordem de serviço ou outro registro associado.",
    botao: "Adicionar registro",
  },
  outro: {
    tipos: TODOS,
    titulo: "Registros relacionados",
    dica: "Vincule qualquer registro relacionado a este compromisso.",
    botao: "Adicionar",
  },
};

const CSS = `
.agendaTemplateShell .a2 .head.agendaHeadPremium{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:8px 10px!important}
.agendaTemplateShell .a2 .head.agendaHeadPremium>.agendaGoogleSlot,.agendaTemplateShell .a2 .head.agendaHeadPremium>.agendaActionsPremium{display:contents!important}
.agendaAgendaSelect{order:1;min-width:220px!important;max-width:300px;flex:0 1 260px}.agendaConfigBtn{order:2}.agendaHeaderSync{order:3;min-width:116px!important;border-color:var(--crm-primary-border)!important;background:linear-gradient(135deg,var(--crm-primary-soft),var(--crm-surface))!important;color:var(--crm-primary-text)!important}.agendaHeaderSync:hover:not(:disabled){border-color:var(--crm-primary-strong)!important}.agendaHeaderSync svg{transition:transform .25s ease}.agendaHeaderSync.isBusy svg{animation:agendaSyncSpin .8s linear infinite}.agendaRefreshBtn{order:7;margin-left:auto}.agendaNewBtn{order:8}.agendaNewAppointmentBtn{order:9}@keyframes agendaSyncSpin{to{transform:rotate(360deg)}}
.agendaTemplateShell .a2 .agendaGoogleHeaderSummary{order:4;min-width:230px;max-width:340px;height:36px;padding:0 11px 0 8px;border:1px solid var(--crm-border);border-radius:11px;background:var(--crm-surface);display:flex;align-items:center;gap:8px;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--crm-text-inverse) 65%,transparent)}.agendaTemplateShell .a2 .agendaGoogleHeaderSummary.isConnected{border-color:var(--crm-success-border)}.agendaTemplateShell .a2 .agendaGoogleHeaderSummary.isError{border-color:var(--crm-danger-border);background:var(--crm-danger-bg)}.agendaGoogleHeaderText{min-width:0;display:grid!important;gap:1px!important}.agendaGoogleHeaderText strong{font-size:11px!important;line-height:1.2;color:var(--crm-text-strong)!important;background:transparent!important}.agendaGoogleHeaderText small{max-width:260px!important;font-size:9.5px!important;line-height:1.25;color:var(--crm-text-muted)!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.agendaGoogleMiniMark,.agendaGoogleMark,.agendaGoogleCreateIcon{position:relative;flex:0 0 auto;background:conic-gradient(from -45deg,var(--crm-ui-private-surface-hex-4285f4) 0 25%,var(--crm-ui-private-surface-hex-34a853) 25% 50%,var(--crm-ui-private-surface-hex-fbbc05) 50% 75%,var(--crm-ui-private-surface-hex-ea4335) 75% 100%)!important;overflow:hidden}.agendaGoogleMiniMark{width:24px;height:24px;border-radius:8px}.agendaGoogleMark{grid-area:brand;width:44px;height:44px;border-radius:13px;box-shadow:0 7px 18px color-mix(in srgb,var(--crm-ui-private-shadow-hex-4285f4) 18%,transparent)}.agendaGoogleMiniMark:before,.agendaGoogleMark:before,.agendaGoogleCreateIcon:before{content:"";position:absolute;inset:22% 18% 16%;border-radius:3px;background:var(--crm-surface);box-shadow:inset 0 5px 0 var(--crm-ui-private-shadow-hex-4285f4)}.agendaGoogleMiniMark:after,.agendaGoogleMark:after,.agendaGoogleCreateIcon:after{content:"";position:absolute;left:31%;right:31%;top:47%;height:2px;border-radius:99px;background:var(--crm-ui-private-surface-hex-34a853);box-shadow:0 5px 0 var(--crm-ui-private-shadow-hex-fbbc05)}
.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard{position:relative;grid-column:1/-1;display:grid!important;grid-template-columns:46px minmax(0,1fr) auto!important;grid-template-areas:"brand title actions" "brand subtitle actions" "brand status actions"!important;grid-template-rows:auto auto auto!important;align-items:center!important;align-content:center!important;gap:2px 12px!important;width:100%!important;height:auto!important;min-height:84px!important;margin:6px 0 2px!important;padding:12px 13px!important;border:1px solid color-mix(in srgb,var(--crm-primary-border) 72%,var(--crm-border))!important;border-radius:17px!important;background:radial-gradient(circle at 92% 4%,color-mix(in srgb,var(--crm-ui-private-surface-hex-4285f4) 8%,transparent),transparent 35%),linear-gradient(135deg,var(--crm-surface),color-mix(in srgb,var(--crm-surface-soft) 70%,var(--crm-surface)))!important;box-shadow:0 12px 28px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent),inset 0 1px 0 color-mix(in srgb,var(--crm-text-inverse) 72%,transparent)!important;overflow:hidden!important}.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard:before{content:none!important;display:none!important}.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard:after{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--crm-ui-private-surface-hex-4285f4) 0 25%,var(--crm-ui-private-surface-hex-34a853) 25% 50%,var(--crm-ui-private-surface-hex-fbbc05) 50% 75%,var(--crm-ui-private-surface-hex-ea4335) 75% 100%)}
.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard h3{grid-area:title!important;width:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:var(--crm-text-strong)!important;font-size:16px!important;font-weight:900!important;line-height:1.2!important}.agendaGoogleSubtitle{grid-area:subtitle;margin:1px 0 0!important;color:var(--crm-text-muted)!important;font-size:10.5px!important;line-height:1.35!important}.agendaGoogleState{grid-area:status!important;min-height:22px!important;margin-top:4px!important;padding:0!important;justify-content:flex-start!important;align-items:center!important;flex-wrap:wrap!important;gap:6px!important;background:transparent!important}.agendaGoogleState>span:not(.pill):not(.agendaGoogleOfficial):not(.agendaGoogleBiBadge){max-width:320px;color:var(--crm-text-muted)!important;font-size:10px!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.agendaGoogleState .pill{min-height:21px!important;padding:0 8px!important;font-size:9px!important}.agendaGoogleOfficial,.agendaGoogleBiBadge{min-height:21px;padding:0 8px;border-radius:999px;display:inline-flex;align-items:center;font-size:8.5px;font-weight:900}.agendaGoogleOfficial{border:1px solid color-mix(in srgb,var(--crm-ui-private-border-hex-4285f4) 25%,var(--crm-border));background:color-mix(in srgb,var(--crm-ui-private-surface-hex-4285f4) 6%,var(--crm-surface));color:color-mix(in srgb,var(--crm-ui-private-content-hex-4285f4) 72%,var(--crm-text-strong))}.agendaGoogleBiBadge{border:1px solid var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text)}.agendaGoogleCardActions{grid-area:actions!important;margin:0!important;padding:0!important;justify-content:flex-end!important;align-items:center!important;flex-wrap:nowrap!important;gap:7px!important;background:transparent!important}.agendaGoogleCardActions .btn{min-height:38px!important;height:38px!important;border-radius:11px!important;font-size:12px!important}.agendaGoogleSync{min-width:118px!important;border-color:var(--crm-primary-border)!important;background:linear-gradient(135deg,var(--crm-primary-soft),var(--crm-surface))!important;color:var(--crm-primary-text)!important;font-weight:900!important}.agendaGoogleDanger{width:38px!important;padding:0!important;border-color:var(--crm-danger-border)!important;background:var(--crm-danger-bg)!important;color:var(--crm-danger-text)!important}.agendaGoogleConfigCard[data-connected="false"] .pill{border-color:var(--crm-border-strong)!important;background:var(--crm-surface-muted)!important;color:var(--crm-text-muted)!important}
.agendaGoogleCreateOption{position:relative;grid-column:1/-1;margin:4px 0 2px!important;padding:15px 16px!important;border:1px solid color-mix(in srgb,var(--crm-primary-border) 78%,var(--crm-border))!important;border-radius:18px!important;background:linear-gradient(135deg,var(--crm-surface),var(--crm-surface-soft))!important;display:grid;grid-template-columns:52px minmax(0,1fr) auto!important;align-items:center;gap:13px!important;box-shadow:0 12px 28px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent);overflow:hidden}.agendaGoogleCreateOption:after{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--crm-ui-private-surface-hex-4285f4) 0 25%,var(--crm-ui-private-surface-hex-34a853) 25% 50%,var(--crm-ui-private-surface-hex-fbbc05) 50% 75%,var(--crm-ui-private-surface-hex-ea4335) 75% 100%)}.agendaGoogleCreateIcon{width:50px!important;height:50px!important;border:0!important;border-radius:15px!important;color:transparent!important;font-size:0!important}.agendaGoogleCreateText{min-width:0;display:grid;gap:3px}.agendaGoogleCreateText strong{font-size:14px!important;color:var(--crm-text-strong)}.agendaGoogleCreateText span{max-width:410px;font-size:10px!important;line-height:1.4;color:var(--crm-text-muted)}.agendaGoogleCreateToggle{min-height:36px;padding:0 11px;border:1px solid var(--crm-primary-border);border-radius:11px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:flex;align-items:center;gap:8px;font-size:10px;font-weight:900;cursor:pointer}
.agendaNichoBadge{min-height:21px;padding:0 8px;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:inline-flex;align-items:center;font-size:8px;font-weight:900}.agendaNichoSection select[data-niche-locked="true"]{border-color:var(--crm-primary-border)!important;background:var(--crm-primary-soft)!important;color:var(--crm-primary-text)!important;font-weight:800;opacity:1!important;cursor:default}
.agendaGoogleDrawerTools{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap}.agendaGoogleEventOpen{min-height:36px!important;height:36px!important;text-decoration:none!important;border-color:color-mix(in srgb,var(--crm-ui-private-border-hex-4285f4) 35%,var(--crm-border))!important;background:color-mix(in srgb,var(--crm-ui-private-surface-hex-4285f4) 7%,var(--crm-surface))!important;color:color-mix(in srgb,var(--crm-ui-private-content-hex-4285f4) 75%,var(--crm-text-strong))!important}.agendaGoogleConflict{min-height:25px;padding:0 9px;border:1px solid var(--crm-warning-border);border-radius:999px;background:var(--crm-warning-bg);color:var(--crm-warning-text);display:inline-flex;align-items:center;font-size:9px;font-weight:900}.agendaGoogleConflict.isGoogle{border-color:var(--crm-primary-border);background:var(--crm-primary-soft);color:var(--crm-primary-text)}
@media(max-width:1220px){.agendaTemplateShell .a2 .head.agendaHeadPremium{flex-wrap:wrap}.agendaRefreshBtn{margin-left:0}.agendaNewBtn{margin-left:auto}}@media(max-width:860px){.agendaTemplateShell .a2 .head.agendaHeadPremium{flex-direction:row!important;align-items:center!important}.agendaAgendaSelect{flex:1 1 220px;max-width:none}.agendaTemplateShell .a2 .agendaGoogleHeaderSummary{order:5;flex:1 1 100%;max-width:none}.agendaHeaderSync{order:4}.agendaRefreshBtn{order:6}.agendaNewBtn{order:7;margin-left:0}.agendaNewAppointmentBtn{order:8}.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard{grid-template-columns:46px minmax(0,1fr)!important;grid-template-areas:"brand title" "brand subtitle" "brand status" "actions actions"!important;padding:12px!important}.agendaGoogleCardActions{margin-top:8px!important;justify-content:flex-start!important}.agendaGoogleCreateOption{grid-template-columns:50px 1fr!important}.agendaGoogleCreateToggle{grid-column:1/-1}}
`;

function text(element: Element | null) {
  return element?.textContent?.trim() || "";
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function setButtonText(button: HTMLButtonElement, value: string) {
  const node = Array.from(button.childNodes).find(
    (item) => item.nodeType === Node.TEXT_NODE && item.textContent?.trim()
  );
  if (node) node.textContent = value;
  else {
    const span = button.querySelector("span:not(.agendaSyncIcon)");
    if (span) span.textContent = value;
    else button.append(document.createTextNode(value));
  }
}

function setTitle(element: HTMLElement, value: string) {
  const node = Array.from(element.childNodes).find(
    (item) => item.nodeType === Node.TEXT_NODE && item.textContent?.trim()
  );
  if (node) node.textContent = value;
  else element.append(document.createTextNode(value));
}

function waitNewCalendar(previousId: string) {
  const started = Date.now();
  window.sessionStorage.setItem(CONNECT_FLAG, previousId);
  const timer = window.setInterval(() => {
    const select = document.querySelector<HTMLSelectElement>(
      ".agendaTemplateShell .a2 .head .select"
    );
    const id = select?.value || "";
    if (id && id !== previousId) {
      window.clearInterval(timer);
      window.sessionStorage.removeItem(CONNECT_FLAG);
      window.location.href = `/api/agendas/${encodeURIComponent(id)}/google-calendar?acao=conectar`;
    } else if (Date.now() - started > 20_000) {
      window.clearInterval(timer);
      window.sessionStorage.removeItem(CONNECT_FLAG);
    }
  }, 250);
}

function localInputTimestamp(value: string) {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AgendaEnhancer() {
  useEffect(() => {
    const shellElement = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shellElement) return;
    const shell: HTMLElement = shellElement;

    let googleCard: HTMLElement | null = null;
    let googleHome: HTMLElement | null = null;
    let niche: Nicho | null = null;
    let googleMeta: GoogleMeta = {};
    let links: GoogleLink[] = [];
    let currentAgendaId = "";
    let frame = 0;
    let disposed = false;
    let loadingMeta = false;
    let deepLinkHandled = false;

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const schedule = () => {
      if (frame || disposed) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    const selectedAgendaId = () =>
      shell.querySelector<HTMLSelectElement>(".a2 .head select.select")?.value || "";

    const loadContext = async () => {
      try {
        const response = await fetch("/api/agendas/contexto", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.ok && data?.nicho?.codigo) niche = data.nicho as Nicho;
      } catch {
        // A ausência do nicho não bloqueia a agenda.
      } finally {
        schedule();
      }
    };

    const loadGoogleData = async (force = false) => {
      const agendaId = selectedAgendaId();
      if (!agendaId || loadingMeta || (!force && agendaId === currentAgendaId && links.length)) {
        return;
      }

      currentAgendaId = agendaId;
      loadingMeta = true;
      try {
        const [statusResponse, linksResponse] = await Promise.all([
          fetch(`/api/agendas/${encodeURIComponent(agendaId)}/google-calendar`, {
            cache: "no-store",
          }),
          fetch(`/api/agendas/${encodeURIComponent(agendaId)}/google-calendar/vinculos`, {
            cache: "no-store",
          }),
        ]);
        const statusData = await statusResponse.json().catch(() => ({}));
        const linksData = await linksResponse.json().catch(() => ({}));
        googleMeta = statusResponse.ok && statusData?.ok ? statusData.integracao || {} : {};
        links = linksResponse.ok && linksData?.ok ? linksData.vinculos || [] : [];
      } catch {
        googleMeta = {};
        links = [];
      } finally {
        loadingMeta = false;
        schedule();
        void openDeepLinkedAppointment();
      }
    };

    const rememberHome = (card: HTMLElement) => {
      const parent = card.parentElement;
      if (parent && !card.closest(".modal")) googleHome = parent;
    };

    const findGoogle = () => {
      if (googleCard?.isConnected) {
        rememberHome(googleCard);
        return googleCard;
      }
      googleCard = null;
      if (googleHome && !googleHome.isConnected) googleHome = null;
      googleCard =
        Array.from(
          shell.querySelectorAll<HTMLElement>(".a2 .aside .side, .a2 .modal .side")
        ).find((card) => text(card.querySelector("h3")).includes("Google Calendar")) ||
        null;
      if (googleCard) rememberHome(googleCard);
      return googleCard;
    };

    const stateFromCard = (card: HTMLElement) => {
      const status = text(card.querySelector(".pill"));
      const email = text(card.querySelector(".mini span:not(.pill)"));
      const connected =
        normalized(status).includes("conectado") &&
        !normalized(status).includes("desconectado");
      const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>("button"));
      const primary =
        buttons.find((button) =>
          ["sincronizar", "conectar"].some((name) =>
            normalized(text(button)).includes(name)
          )
        ) || null;
      return { connected, email, buttons, primary };
    };

    const decorateGoogleCard = (card: HTMLElement) => {
      const state = stateFromCard(card);
      card.classList.add("agendaGoogleConfigCard");
      card.dataset.connected = String(state.connected);

      if (!card.querySelector(".agendaGoogleMark")) {
        const mark = document.createElement("div");
        mark.className = "agendaGoogleMark";
        mark.setAttribute("aria-hidden", "true");
        card.prepend(mark);
      }

      const title = card.querySelector<HTMLElement>("h3");
      if (title && !card.querySelector(".agendaGoogleSubtitle")) {
        const subtitle = document.createElement("p");
        subtitle.className = "agendaGoogleSubtitle";
        subtitle.textContent =
          "Sincronização segura de criação, alterações e cancelamentos nos dois sentidos.";
        title.insertAdjacentElement("afterend", subtitle);
      }

      const rows = Array.from(card.querySelectorAll<HTMLElement>(".mini"));
      const stateRow = rows[0];
      const actions = rows[rows.length - 1];
      stateRow?.classList.add("agendaGoogleState");
      actions?.classList.add("agendaGoogleCardActions");

      if (stateRow && !stateRow.querySelector(".agendaGoogleOfficial")) {
        const official = document.createElement("span");
        official.className = "agendaGoogleOfficial";
        official.textContent = "Integração oficial";
        stateRow.appendChild(official);
      }

      let bi = stateRow?.querySelector<HTMLElement>(".agendaGoogleBiBadge");
      if (googleMeta.bidirecional_ativa && stateRow && !bi) {
        bi = document.createElement("span");
        bi.className = "agendaGoogleBiBadge";
        stateRow.appendChild(bi);
      }
      if (bi) {
        bi.textContent = "Bidirecional ativa";
        bi.hidden = !googleMeta.bidirecional_ativa;
      }

      state.buttons.forEach((button) => {
        const name = normalized(text(button));
        button.classList.remove("agendaGoogleSync", "agendaGoogleDanger");
        if (name.includes("sincronizar") || name.includes("conectar")) {
          button.classList.add("agendaGoogleSync");
          if (button.dataset.stage23Bound !== "true") {
            button.dataset.stage23Bound = "true";
            button.addEventListener("click", () => {
              window.setTimeout(() => void loadGoogleData(true), 1200);
            });
          }
        } else {
          button.classList.add("agendaGoogleDanger");
          button.title = "Desvincular Google Calendar";
        }
      });
      return state;
    };

    const arrangeHeader = (card: HTMLElement) => {
      const head = shell.querySelector<HTMLElement>(".a2 .head");
      const slot = head?.firstElementChild as HTMLElement | null;
      const actions = head?.querySelector<HTMLElement>(".actions");
      if (!head || !slot || !actions) return;

      head.classList.add("agendaHeadPremium");
      slot.classList.add("agendaGoogleSlot");
      actions.classList.add("agendaActionsPremium");
      slot.querySelector("h1")?.remove();
      slot.querySelector("p")?.remove();

      const state = stateFromCard(card);
      let summary = slot.querySelector<HTMLElement>(".agendaGoogleHeaderSummary");
      if (!summary) {
        summary = document.createElement("div");
        summary.className = "agendaGoogleHeaderSummary";
        summary.innerHTML =
          '<span class="agendaGoogleMiniMark" aria-hidden="true"></span><div class="agendaGoogleHeaderText"><strong>Google Calendar</strong><small></small></div>';
        slot.appendChild(summary);
      }

      summary.classList.toggle("isConnected", state.connected);
      summary.classList.toggle("isError", googleMeta.sync_status === "erro");
      const small = summary.querySelector("small");
      const email = googleMeta.email || state.email;
      const detail = !state.connected
        ? "Não conectado"
        : googleMeta.sync_status === "erro"
          ? `Sincronização requer atenção${email ? ` · ${email}` : ""}`
          : googleMeta.bidirecional_ativa
            ? `Bidirecional ativa${email ? ` · ${email}` : ""}`
            : `Conectado${email ? ` · ${email}` : ""}`;
      if (small && small.textContent !== detail) small.textContent = detail;
      if (googleMeta.ultimo_erro) summary.title = googleMeta.ultimo_erro;
      else summary.removeAttribute("title");

      actions
        .querySelector<HTMLSelectElement>("select.select")
        ?.classList.add("agendaAgendaSelect");
      const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
      const config = buttons.find((button) => normalized(text(button)).includes("configurar"));
      const refresh = buttons.find(
        (button) => !text(button) && Boolean(button.querySelector("svg.lucide-refresh-cw"))
      );
      const newCalendar = buttons.find((button) => {
        const label = normalized(text(button));
        return label === "nova agenda" || label === "novo calendario";
      });
      const newAppointment = buttons.find((button) =>
        normalized(text(button)).includes("novo agendamento")
      );

      if (config) {
        setButtonText(config, "Configuração");
        config.classList.add("agendaConfigBtn");
      }
      refresh?.classList.add("agendaRefreshBtn");
      newCalendar?.classList.add("agendaNewBtn");
      newAppointment?.classList.add("agendaNewAppointmentBtn");

      let sync = actions.querySelector<HTMLButtonElement>(".agendaHeaderSync");
      if (!sync) {
        sync = document.createElement("button");
        sync.type = "button";
        sync.className = "btn agendaHeaderSync";
        sync.innerHTML =
          '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg><span></span>';
        actions.appendChild(sync);
      }
      const label = sync.querySelector("span");
      if (label) label.textContent = state.connected ? "Sincronizar" : "Conectar";
      sync.disabled = !state.primary || state.primary.disabled;
      sync.onclick = async () => {
        if (!state.primary) return;
        sync?.classList.add("isBusy");
        state.primary.click();
        window.setTimeout(async () => {
          await loadGoogleData(true);
          sync?.classList.remove("isBusy");
        }, state.connected ? 1200 : 2500);
      };
    };

    const fixMore = () => {
      shell.querySelectorAll<HTMLElement>(".a2 .day > .pill").forEach((item) => {
        const match = text(item).match(/\+\s*(\d+)\s+eventos?/i);
        if (match) item.textContent = `Mais ${match[1]}`;
      });
    };

    const restoreGoogle = () => {
      if (!googleCard?.isConnected) {
        googleCard = null;
        return;
      }
      if (!googleHome?.isConnected) {
        googleHome = shell.querySelector<HTMLElement>(".a2 .aside");
      }
      if (googleHome && googleCard.parentElement !== googleHome) {
        googleCard.classList.remove("agendaGoogleConfigCard");
        googleHome.appendChild(googleCard);
      }
    };

    const descriptionField = (modal: HTMLElement) =>
      Array.from(modal.querySelectorAll<HTMLElement>(".body > .form > .field")).find(
        (field) => normalized(text(field.querySelector("label"))) === "descricao"
      );

    const insertAfterDescription = (modal: HTMLElement, element: HTMLElement) => {
      const field = descriptionField(modal);
      const form = modal.querySelector<HTMLElement>(".body > .form");
      if (field?.parentElement) field.insertAdjacentElement("afterend", element);
      else if (form) form.appendChild(element);
      else modal.querySelector<HTMLElement>(".body")?.appendChild(element);
    };

    const placeGoogleInModal = (modal: HTMLElement) => {
      const title = text(modal.querySelector(".dhead h2"));
      const body = modal.querySelector<HTMLElement>(".body");
      if (!body) return;

      if (title.includes("Configurar agenda")) {
        const card = findGoogle();
        if (!card) return;
        decorateGoogleCard(card);
        const field = descriptionField(modal);
        if (field && card.previousElementSibling !== field) insertAfterDescription(modal, card);
        return;
      }

      if (!title.includes("Nova agenda") || body.querySelector(".agendaGoogleCreateOption")) {
        return;
      }

      const section = document.createElement("section");
      section.className = "agendaGoogleCreateOption";
      section.innerHTML =
        '<div class="agendaGoogleCreateIcon" aria-hidden="true"></div><div class="agendaGoogleCreateText"><strong>Conectar ao Google Calendar</strong><span>Após criar a agenda, abra a autorização segura do Google e ative a sincronização bidirecional automática.</span></div><label class="agendaGoogleCreateToggle"><input type="checkbox"/><span>Conectar após criar</span></label>';
      insertAfterDescription(modal, section);

      const save = Array.from(
        modal.querySelectorAll<HTMLButtonElement>(".foot button")
      ).find((button) => text(button) === "Salvar");
      if (save && save.dataset.googleCreateBound !== "true") {
        save.dataset.googleCreateBound = "true";
        save.addEventListener("click", () => {
          if (!section.querySelector<HTMLInputElement>("input")?.checked) return;
          waitNewCalendar(selectedAgendaId());
        });
      }
    };

    const filterRelated = () => {
      if (!niche?.codigo) return;
      const drawer = shell.querySelector<HTMLElement>(".a2 .overlay .drawer");
      if (!drawer) return;
      const section = Array.from(
        drawer.querySelectorAll<HTMLElement>(".body > .section")
      ).find((item) => {
        const title = normalized(text(item.querySelector("h3")));
        return [
          "registros relacionados",
          "registro relacionado",
          "imovel relacionado",
          "procedimento relacionado",
        ].some((value) => title.includes(value));
      });
      if (!section) return;

      const config = POR_NICHO[niche.codigo] || POR_NICHO.outro;
      section.classList.add("agendaNichoSection");
      const header = section.querySelector<HTMLElement>(".row");
      const title = header?.querySelector<HTMLElement>("h3");
      const add = header?.querySelector<HTMLButtonElement>("button");
      if (title) setTitle(title, config.titulo);
      if (add) setButtonText(add, config.botao);

      if (header && !header.querySelector(".agendaNichoBadge")) {
        const badge = document.createElement("span");
        badge.className = "agendaNichoBadge";
        badge.textContent = niche.nome;
        title?.insertAdjacentElement("afterend", badge);
      }
      const hint = Array.from(section.children).find(
        (child) => child.tagName.toLowerCase() === "small"
      ) as HTMLElement | undefined;
      if (hint && hint.textContent !== config.dica) hint.textContent = config.dica;

      Array.from(section.querySelectorAll<HTMLSelectElement>("select"))
        .filter((select) =>
          Array.from(select.options).some((option) => option.value === "imovel")
        )
        .forEach((select) => {
          Array.from(select.options).forEach((option) => {
            if (!config.tipos.includes(option.value)) option.remove();
          });
          if (!config.tipos.includes(select.value)) {
            select.value = config.tipos[0];
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          const locked = config.tipos.length === 1;
          select.disabled = locked;
          select.dataset.nicheLocked = String(locked);
        });
    };

    const fieldInput = (drawer: HTMLElement, labelName: string) =>
      Array.from(drawer.querySelectorAll<HTMLElement>(".field")).find(
        (field) => normalized(text(field.querySelector("label"))) === labelName
      )?.querySelector<HTMLInputElement>("input");

    const drawerLink = (drawer: HTMLElement) => {
      const titleInput = fieldInput(drawer, "titulo*") || fieldInput(drawer, "titulo");
      const startInput = fieldInput(drawer, "inicio*") || fieldInput(drawer, "inicio");
      const title = normalized(titleInput?.value || "");
      const start = localInputTimestamp(startInput?.value || "");
      const link = links.find((item) => {
        if (!item.agendamento) return false;
        return (
          normalized(item.agendamento.titulo) === title &&
          Math.abs(new Date(item.agendamento.inicio_at).getTime() - start) < 60_000
        );
      });

      let tools = drawer.querySelector<HTMLElement>(".agendaGoogleDrawerTools");
      if (!link) {
        tools?.remove();
        return;
      }
      if (!tools) {
        tools = document.createElement("div");
        tools.className = "agendaGoogleDrawerTools";
        const footerLeft = drawer.querySelector<HTMLElement>(".foot > div:first-child");
        (footerLeft || drawer.querySelector<HTMLElement>(".foot"))?.appendChild(tools);
      }

      let anchor = tools.querySelector<HTMLAnchorElement>(".agendaGoogleEventOpen");
      if (link.google_html_link) {
        if (!anchor) {
          anchor = document.createElement("a");
          anchor.className = "btn agendaGoogleEventOpen";
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.innerHTML =
            '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg><span>Abrir no Google</span>';
          tools.prepend(anchor);
        }
        anchor.href = link.google_html_link;
      } else {
        anchor?.remove();
      }

      let conflict = tools.querySelector<HTMLElement>(".agendaGoogleConflict");
      const status = link.conflito_status || "sem_conflito";
      if (status !== "sem_conflito") {
        if (!conflict) {
          conflict = document.createElement("span");
          conflict.className = "agendaGoogleConflict";
          tools.appendChild(conflict);
        }
        conflict.classList.toggle("isGoogle", status === "resolvido_google");
        conflict.textContent =
          status === "resolvido_google"
            ? "Conflito resolvido pelo Google"
            : "Conflito resolvido pelo CRM";
      } else {
        conflict?.remove();
      }
    };

    async function openDeepLinkedAppointment() {
      if (deepLinkHandled || !links.length) return;
      const targetId = new URLSearchParams(window.location.search).get("agendamento");
      if (!targetId) {
        deepLinkHandled = true;
        return;
      }
      const target = links.find((item) => item.agendamento_id === targetId)?.agendamento;
      if (!target) return;
      deepLinkHandled = true;

      const targetDate = new Date(target.inicio_at);
      const now = new Date();
      const monthDiff =
        (targetDate.getFullYear() - now.getFullYear()) * 12 +
        targetDate.getMonth() -
        now.getMonth();
      const navButtons = shell.querySelectorAll<HTMLButtonElement>(".toolbar .nav > button");
      const direction = monthDiff >= 0 ? navButtons[navButtons.length - 1] : navButtons[0];
      for (let index = 0; index < Math.abs(monthDiff); index += 1) {
        direction?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 700));

      const day = String(targetDate.getDate());
      const dayCell = Array.from(shell.querySelectorAll<HTMLElement>(".day:not(.muted)")).find(
        (cell) => text(cell.querySelector(".num")) === day
      );
      dayCell?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 100));

      const expectedTitle = normalized(target.titulo);
      const expectedTime = formatTime(target.inicio_at);
      const candidate = Array.from(
        shell.querySelectorAll<HTMLElement>(".aside .item, button.event")
      ).find((item) => {
        const value = normalized(text(item));
        return value.includes(expectedTitle) && text(item).includes(expectedTime);
      });
      candidate?.click();

      const url = new URL(window.location.href);
      url.searchParams.delete("agendamento");
      window.history.replaceState({}, "", url.toString());
    }

    function apply() {
      const agendaId = selectedAgendaId();
      if (agendaId && agendaId !== currentAgendaId) void loadGoogleData(true);
      const card = findGoogle();
      if (card) {
        decorateGoogleCard(card);
        arrangeHeader(card);
      }
      fixMore();
      filterRelated();

      const modal = shell.querySelector<HTMLElement>(".a2 .modalbg .modal");
      if (modal) placeGoogleInModal(modal);
      else restoreGoogle();

      const drawer = shell.querySelector<HTMLElement>(".a2 .overlay .drawer");
      if (drawer) drawerLink(drawer);
    }

    void loadContext();
    void loadGoogleData(true);
    apply();

    const observer = new MutationObserver(schedule);
    observer.observe(shell, { subtree: true, childList: true, characterData: true });
    const select = shell.querySelector<HTMLSelectElement>(".a2 .head select.select");
    const onAgendaChange = () => void loadGoogleData(true);
    select?.addEventListener("change", onAgendaChange);
    const onOauthMessage = (event: MessageEvent) => {
      if (event.data?.type === "google-calendar-oauth") {
        window.setTimeout(() => void loadGoogleData(true), 400);
      }
    };
    window.addEventListener("message", onOauthMessage);
    const refreshTimer = window.setInterval(() => void loadGoogleData(true), 60_000);

    return () => {
      disposed = true;
      observer.disconnect();
      select?.removeEventListener("change", onAgendaChange);
      window.removeEventListener("message", onOauthMessage);
      window.clearInterval(refreshTimer);
      if (frame) window.cancelAnimationFrame(frame);
      restoreGoogle();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
