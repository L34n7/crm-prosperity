"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-automation-stage13-runtime";
const CSS = `
.agendaAutomationSection.isRuntimeActive{border-color:color-mix(in srgb,var(--crm-success-border) 78%,var(--crm-border))}
.agendaAutomationSection.isRuntimeActive:before{background:linear-gradient(90deg,var(--crm-success-strong),color-mix(in srgb,var(--crm-primary-strong) 65%,var(--crm-success-strong)))}
.agendaAutomationSection.isRuntimeActive .agendaAutomationStage{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text)}
.agendaAutomationSection.isRuntimeActive .agendaAutomationNotice{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text)}
`;

export default function AgendaAutomationRuntimeStatus() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const apply = () => {
      document
        .querySelectorAll<HTMLElement>(".agendaAutomationSection")
        .forEach((section) => {
          section.classList.add("isRuntimeActive");
          const badge = section.querySelector<HTMLElement>(
            ".agendaAutomationStage"
          );
          if (badge) badge.textContent = "Automação ativa";

          const notice = section.querySelector<HTMLElement>(
            ".agendaAutomationNotice"
          );
          if (notice) {
            notice.innerHTML =
              "<strong>Execução automática habilitada.</strong> Confirmações, lembretes, avisos e fluxos ativos serão planejados com idempotência e processados no horário configurado.";
          }
        });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
