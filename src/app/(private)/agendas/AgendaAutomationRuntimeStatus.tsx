"use client";

import { useEffect } from "react";

const STYLE_ID = "agenda-automation-stage13-runtime";
const CSS = `
.agendaAutomationSection.isRuntimeActive{border-color:color-mix(in srgb,var(--crm-success-border) 78%,var(--crm-border));padding:18px}
.agendaAutomationSection.isRuntimeActive:before{background:linear-gradient(90deg,var(--crm-success-strong),color-mix(in srgb,var(--crm-primary-strong) 65%,var(--crm-success-strong)))}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:17px!important;line-height:1.25!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:12.5px!important;line-height:1.5!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationStage{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:10.5px!important;padding:6px 10px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationNotice{border-color:var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text);font-size:12px!important;line-height:1.55!important;padding:11px 13px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationGrid{gap:12px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCard{padding:14px!important;gap:12px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCardHead strong{font-size:13.5px!important;line-height:1.35!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSwitch{font-size:10.5px!important;gap:8px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField>span{font-size:10.5px!important;line-height:1.3!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationField input,
.agendaAutomationSection.isRuntimeActive .agendaAutomationField select{height:39px!important;font-size:12px!important;padding:0 11px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCheck{font-size:11px!important;gap:7px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationCompatibility{font-size:10px!important;line-height:1.45!important;min-height:22px!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationError{font-size:11.5px!important;line-height:1.45!important}
.agendaAutomationSection.isRuntimeActive .agendaAutomationSaving{font-size:11px!important}
@media(max-width:760px){.agendaAutomationSection.isRuntimeActive{padding:14px}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle h3{font-size:16px!important}.agendaAutomationSection.isRuntimeActive .agendaAutomationTitle p{font-size:12px!important}}
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
    } else {
      style.textContent = CSS;
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
              "<strong>Execução automática habilitada.</strong> As ações ativas serão planejadas no horário configurado e poderão ser acompanhadas e canceladas em <strong>Disparos agendados</strong>.";
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
