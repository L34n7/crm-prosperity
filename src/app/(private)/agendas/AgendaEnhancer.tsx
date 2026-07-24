"use client";

import { useEffect } from "react";

const CONNECT_FLAG = "crm:agenda:conectar-google-apos-criar";
const STYLE_ID = "agenda-premium-v5";

type Nicho = { codigo: string; nome: string; grupo: string };
type Relacionado = { tipos: string[]; titulo: string; dica: string; botao: string };

const TODOS = ["imovel", "veiculo", "procedimento", "oportunidade", "ordem_servico", "processo", "outro"];
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
.agendaAgendaSelect{order:1;min-width:220px!important;max-width:300px;flex:0 1 260px}.agendaConfigBtn{order:2}.agendaSyncBtn{order:3;min-width:118px;border-color:var(--crm-primary-border)!important;background:linear-gradient(135deg,var(--crm-primary-soft),var(--crm-surface))!important;color:var(--crm-primary-text)!important}.agendaSyncBtn:hover:not(:disabled){border-color:var(--crm-primary-strong)!important}.agendaSyncIcon{width:21px;height:21px;border-radius:7px;background:var(--crm-primary-strong);color:var(--crm-text-inverse);display:grid;place-items:center;font-size:14px}.agendaRefreshBtn{order:7;margin-left:auto}.agendaNewBtn{order:8}.agendaNewAppointmentBtn{order:9}
.agendaTemplateShell .a2 .agendaGoogleHeaderSummary{order:4;min-width:220px;max-width:310px;height:36px;padding:0 10px 0 8px;border:1px solid var(--crm-border);border-radius:11px;background:linear-gradient(135deg,var(--crm-surface),var(--crm-surface-soft));display:flex;align-items:center;gap:8px;box-shadow:inset 0 1px 0 color-mix(in srgb,white 65%,transparent)}.agendaTemplateShell .a2 .agendaGoogleHeaderSummary.isConnected{border-color:var(--crm-success-border)}.agendaGoogleHeaderText{min-width:0;display:grid!important;gap:0!important}.agendaGoogleHeaderText strong{font-size:10px!important;line-height:1.15;color:var(--crm-text-strong)!important}.agendaGoogleHeaderText small{max-width:235px!important;font-size:9px!important;line-height:1.25;color:var(--crm-text-muted)!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.agendaGoogleMiniMark,.agendaGoogleMark,.agendaGoogleCreateIcon{position:relative;flex:0 0 auto;background:conic-gradient(from -45deg,#4285f4 0 25%,#34a853 25% 50%,#fbbc05 50% 75%,#ea4335 75% 100%)!important;overflow:hidden}.agendaGoogleMiniMark{width:24px;height:24px;border-radius:8px}.agendaGoogleMark{grid-area:brand;width:52px;height:52px;border-radius:16px;box-shadow:0 10px 24px color-mix(in srgb,#4285f4 20%,transparent)}.agendaGoogleMiniMark:before,.agendaGoogleMark:before,.agendaGoogleCreateIcon:before{content:"";position:absolute;inset:22% 18% 16%;border-radius:3px;background:#fff;box-shadow:inset 0 5px 0 #4285f4}.agendaGoogleMiniMark:after,.agendaGoogleMark:after,.agendaGoogleCreateIcon:after{content:"";position:absolute;left:31%;right:31%;top:47%;height:2px;border-radius:99px;background:#34a853;box-shadow:0 5px 0 #fbbc05}
.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard{position:relative;grid-column:1/-1;display:grid!important;grid-template-columns:56px minmax(0,1fr) auto!important;grid-template-areas:"brand title actions" "brand subtitle actions" "brand status actions"!important;align-items:center;gap:3px 14px!important;min-height:104px!important;margin:4px 0 2px!important;padding:16px 17px!important;border:1px solid color-mix(in srgb,var(--crm-primary-border) 78%,var(--crm-border))!important;border-radius:18px!important;background:radial-gradient(circle at 92% 5%,color-mix(in srgb,#4285f4 11%,transparent),transparent 35%),radial-gradient(circle at 4% 95%,color-mix(in srgb,#34a853 9%,transparent),transparent 34%),linear-gradient(135deg,var(--crm-surface),var(--crm-surface-soft))!important;box-shadow:0 14px 34px color-mix(in srgb,var(--crm-primary-strong) 8%,transparent),inset 0 1px 0 color-mix(in srgb,white 75%,transparent)!important;overflow:hidden}.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard:before{content:none!important;display:none!important}.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard:after{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#4285f4 0 25%,#34a853 25% 50%,#fbbc05 50% 75%,#ea4335 75% 100%)}
.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard h3{grid-area:title!important;margin:0!important;font-size:15px!important;color:var(--crm-text-strong)!important}.agendaGoogleSubtitle{grid-area:subtitle;margin:0;color:var(--crm-text-muted);font-size:10px;line-height:1.35}.agendaGoogleState{grid-area:status!important;margin-top:4px;justify-content:flex-start!important;flex-wrap:wrap!important;gap:6px!important}.agendaGoogleState>span:not(.pill):not(.agendaGoogleOfficial){max-width:250px;color:var(--crm-text-muted)!important;font-size:9px!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.agendaGoogleOfficial{min-height:20px;padding:0 7px;border:1px solid color-mix(in srgb,#4285f4 25%,var(--crm-border));border-radius:999px;background:color-mix(in srgb,#4285f4 7%,var(--crm-surface));color:color-mix(in srgb,#4285f4 70%,var(--crm-text-strong));display:inline-flex;align-items:center;font-size:8px;font-weight:900}.agendaGoogleCardActions{grid-area:actions!important;margin:0!important;justify-content:flex-end!important;flex-wrap:nowrap!important;gap:7px!important}.agendaGoogleCardActions .btn{min-height:36px!important;height:36px!important;border-radius:11px!important}.agendaGooglePrimary{border-color:var(--crm-primary-strong)!important;background:var(--crm-primary-strong)!important;color:var(--crm-text-inverse)!important}.agendaGoogleDanger{width:36px;padding:0!important;border-color:var(--crm-danger-border)!important;background:var(--crm-danger-bg)!important;color:var(--crm-danger-text)!important}.agendaGoogleConfigCard[data-connected="false"] .pill{border-color:var(--crm-border-strong)!important;background:var(--crm-surface-muted)!important;color:var(--crm-text-muted)!important}
.agendaGoogleCreateOption{position:relative;grid-column:1/-1;margin:4px 0 2px!important;padding:15px 16px!important;border:1px solid color-mix(in srgb,var(--crm-primary-border) 78%,var(--crm-border))!important;border-radius:18px!important;background:radial-gradient(circle at 92% 5%,color-mix(in srgb,#4285f4 10%,transparent),transparent 35%),linear-gradient(135deg,var(--crm-surface),var(--crm-surface-soft))!important;display:grid;grid-template-columns:52px minmax(0,1fr) auto!important;align-items:center;gap:13px!important;box-shadow:0 12px 28px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent);overflow:hidden}.agendaGoogleCreateOption:after{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#4285f4 0 25%,#34a853 25% 50%,#fbbc05 50% 75%,#ea4335 75% 100%)}.agendaGoogleCreateIcon{width:50px!important;height:50px!important;border:0!important;border-radius:15px!important;color:transparent!important;font-size:0!important}.agendaGoogleCreateText{min-width:0;display:grid;gap:3px}.agendaGoogleCreateText strong{font-size:14px!important;color:var(--crm-text-strong)}.agendaGoogleCreateText span{max-width:390px;font-size:10px!important;line-height:1.4;color:var(--crm-text-muted)}.agendaGoogleCreateToggle{min-height:36px;padding:0 11px;border:1px solid var(--crm-primary-border);border-radius:11px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:flex;align-items:center;gap:8px;font-size:10px;font-weight:900;cursor:pointer}
.agendaNichoBadge{min-height:21px;padding:0 8px;border:1px solid var(--crm-primary-border);border-radius:999px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:inline-flex;align-items:center;font-size:8px;font-weight:900}.agendaNichoSection select[data-niche-locked="true"]{border-color:var(--crm-primary-border)!important;background:var(--crm-primary-soft)!important;color:var(--crm-primary-text)!important;font-weight:800;opacity:1!important;cursor:default}
@media(max-width:1220px){.agendaTemplateShell .a2 .head.agendaHeadPremium{flex-wrap:wrap}.agendaRefreshBtn{margin-left:0}.agendaNewBtn{margin-left:auto}}@media(max-width:860px){.agendaTemplateShell .a2 .head.agendaHeadPremium{flex-direction:row!important;align-items:center!important}.agendaAgendaSelect{flex:1 1 220px;max-width:none}.agendaTemplateShell .a2 .agendaGoogleHeaderSummary{order:5;flex:1 1 100%;max-width:none}.agendaRefreshBtn{order:6}.agendaNewBtn{order:7;margin-left:0}.agendaNewAppointmentBtn{order:8}.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard{grid-template-columns:50px minmax(0,1fr)!important;grid-template-areas:"brand title" "brand subtitle" "brand status" "actions actions"!important}.agendaGoogleCardActions{margin-top:10px!important;justify-content:flex-start!important}.agendaGoogleCreateOption{grid-template-columns:50px 1fr!important}.agendaGoogleCreateToggle{grid-column:1/-1}}
`;

function txt(el: Element | null) {
  return el?.textContent?.trim() || "";
}

function norm(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function setButtonText(button: HTMLButtonElement, value: string) {
  const node = Array.from(button.childNodes).find(
    (item) => item.nodeType === Node.TEXT_NODE && item.textContent?.trim()
  );
  if (node) node.textContent = value;
  else {
    const span = button.querySelector("span");
    if (span) span.textContent = value;
    else button.append(document.createTextNode(value));
  }
}

function setIconTitle(element: HTMLElement, value: string) {
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

export default function AgendaEnhancer() {
  useEffect(() => {
    const shellElement = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shellElement) return;
    const shell: HTMLElement = shellElement;

    let googleCard: HTMLElement | null = null;
    let googleParent: HTMLElement | null = null;
    let niche: Nicho | null = null;
    let frame = 0;
    let disposed = false;

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

    void fetch("/api/agendas/contexto", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok && data?.ok && data?.nicho?.codigo) niche = data.nicho as Nicho;
      })
      .catch(() => undefined)
      .finally(schedule);

    const findGoogle = () => {
      if (googleCard?.isConnected) return googleCard;
      googleCard =
        Array.from(
          shell.querySelectorAll<HTMLElement>(".a2 .aside .side, .a2 .modal .side")
        ).find((card) => txt(card.querySelector("h3")).includes("Google Calendar")) ||
        null;
      if (googleCard && !googleParent) googleParent = googleCard.parentElement;
      return googleCard;
    };

    const googleState = (card: HTMLElement) => {
      const status = txt(card.querySelector(".pill"));
      const email = txt(card.querySelector(".mini span:not(.pill)"));
      const connected =
        norm(status).includes("conectado") && !norm(status).includes("desconectado");
      const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>("button"));
      const primary =
        buttons.find((button) =>
          ["sincronizar", "conectar"].some((name) => norm(txt(button)).includes(name))
        ) || null;
      return { connected, email, buttons, primary };
    };

    const decorateGoogleCard = (card: HTMLElement) => {
      const state = googleState(card);
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
        subtitle.textContent = "Sincronize horários, alterações e compromissos com segurança.";
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

      state.buttons.forEach((button) => {
        const name = norm(txt(button));
        button.classList.remove("agendaGooglePrimary", "agendaGoogleDanger");
        if (name.includes("sincronizar") || name.includes("conectar")) {
          button.classList.add("agendaGooglePrimary");
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

      const state = googleState(card);
      let summary = slot.querySelector<HTMLElement>(".agendaGoogleHeaderSummary");
      if (!summary) {
        summary = document.createElement("div");
        summary.className = "agendaGoogleHeaderSummary";
        summary.innerHTML =
          '<span class="agendaGoogleMiniMark" aria-hidden="true"></span><div class="agendaGoogleHeaderText"><strong>Google Calendar</strong><small></small></div>';
        slot.appendChild(summary);
      }
      summary.classList.toggle("isConnected", state.connected);
      const small = summary.querySelector("small");
      const detail = state.connected
        ? `Conectado${state.email ? ` · ${state.email}` : ""}`
        : "Não conectado";
      if (small && small.textContent !== detail) small.textContent = detail;

      actions.querySelector<HTMLSelectElement>("select.select")?.classList.add(
        "agendaAgendaSelect"
      );
      const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
      const config = buttons.find((button) => norm(txt(button)).includes("configurar"));
      const refresh = buttons.find(
        (button) => !txt(button) && Boolean(button.querySelector("svg.lucide-refresh-cw"))
      );
      const newCalendar = buttons.find((button) => norm(txt(button)) === "nova agenda");
      const newAppointment = buttons.find((button) =>
        norm(txt(button)).includes("novo agendamento")
      );

      if (config) {
        setButtonText(config, "Configuração");
        config.classList.add("agendaConfigBtn");
      }
      refresh?.classList.add("agendaRefreshBtn");
      newCalendar?.classList.add("agendaNewBtn");
      newAppointment?.classList.add("agendaNewAppointmentBtn");

      let sync = actions.querySelector<HTMLButtonElement>(".agendaSyncBtn");
      if (!sync) {
        sync = document.createElement("button");
        sync.type = "button";
        sync.className = "btn agendaSyncBtn";
        sync.innerHTML =
          '<span class="agendaSyncIcon" aria-hidden="true">↻</span><span class="agendaSyncLabel"></span>';
        actions.appendChild(sync);
      }
      const label = sync.querySelector(".agendaSyncLabel");
      if (label) label.textContent = state.connected ? "Sincronizar" : "Conectar";
      sync.disabled = !state.primary || state.primary.disabled;
      sync.onclick = () => state.primary?.click();
    };

    const fixMore = () => {
      shell.querySelectorAll<HTMLElement>(".a2 .day > .pill").forEach((item) => {
        const match = txt(item).match(/\+\s*(\d+)\s+eventos?/i);
        if (match) item.textContent = `Mais ${match[1]}`;
      });
    };

    const restoreGoogle = () => {
      if (googleCard && googleParent && googleCard.parentElement !== googleParent) {
        googleCard.classList.remove("agendaGoogleConfigCard");
        googleParent.appendChild(googleCard);
      }
    };

    const descriptionField = (modal: HTMLElement) =>
      Array.from(modal.querySelectorAll<HTMLElement>(".body > .form > .field")).find(
        (field) => norm(txt(field.querySelector("label"))) === "descricao"
      );

    const insertAfterDescription = (modal: HTMLElement, element: HTMLElement) => {
      const field = descriptionField(modal);
      const form = modal.querySelector<HTMLElement>(".body > .form");
      if (field?.parentElement) field.insertAdjacentElement("afterend", element);
      else if (form) form.appendChild(element);
      else modal.querySelector<HTMLElement>(".body")?.appendChild(element);
    };

    const placeGoogleInModal = (modal: HTMLElement) => {
      const title = txt(modal.querySelector(".dhead h2"));
      const body = modal.querySelector<HTMLElement>(".body");
      if (!body) return;

      if (title.includes("Configurar agenda")) {
        const card = findGoogle();
        if (card) {
          decorateGoogleCard(card);
          const field = descriptionField(modal);
          if (field && card.previousElementSibling !== field) insertAfterDescription(modal, card);
        }
        return;
      }

      if (!title.includes("Nova agenda") || body.querySelector(".agendaGoogleCreateOption")) {
        return;
      }

      const section = document.createElement("section");
      section.className = "agendaGoogleCreateOption";
      section.innerHTML =
        '<div class="agendaGoogleCreateIcon" aria-hidden="true"></div><div class="agendaGoogleCreateText"><strong>Conectar ao Google Calendar</strong><span>Após criar a agenda, abra a autorização segura do Google e mantenha os compromissos sincronizados.</span></div><label class="agendaGoogleCreateToggle"><input type="checkbox"/><span>Conectar após criar</span></label>';
      insertAfterDescription(modal, section);

      const save = Array.from(
        modal.querySelectorAll<HTMLButtonElement>(".foot button")
      ).find((button) => txt(button) === "Salvar");

      if (save && save.dataset.googleCreateBound !== "true") {
        save.dataset.googleCreateBound = "true";
        save.addEventListener("click", () => {
          if (!section.querySelector<HTMLInputElement>("input")?.checked) return;
          const previous =
            shell.querySelector<HTMLSelectElement>(".a2 .head .select")?.value || "";
          waitNewCalendar(previous);
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
        const title = norm(txt(item.querySelector("h3")));
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
      if (title) setIconTitle(title, config.titulo);
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

    function apply() {
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
    }

    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(shell, { subtree: true, childList: true, characterData: true });

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      restoreGoogle();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
