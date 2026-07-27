"use client";

import AgendaAutomationEnhancer from "./AgendaAutomationEnhancer";
import AgendaAutomationRuntimeStatus from "./AgendaAutomationRuntimeStatus";
import AgendaEnhancerLegacy from "./AgendaEnhancerLegacy";
import AgendaGoogleAgendaBindingFix from "./AgendaGoogleAgendaBindingFix";

const HEADER_ACTION_ALIGNMENT_STYLES = `
  .agendaTemplateShell .a2 .head.agendaHeadPremium .agendaRefreshBtn {
    margin-left: 0 !important;
  }

  .agendaTemplateShell .a2 .head.agendaHeadPremium .agendaNewBtn {
    margin-left: auto !important;
  }

  @media (max-width: 860px) {
    .agendaTemplateShell .a2 .head.agendaHeadPremium .agendaNewBtn {
      margin-left: 0 !important;
    }
  }
`;

export default function AgendaEnhancer() {
  return (
    <>
      <style>{HEADER_ACTION_ALIGNMENT_STYLES}</style>
      <AgendaEnhancerLegacy />
      <AgendaAutomationEnhancer />
      <AgendaAutomationRuntimeStatus />
      <AgendaGoogleAgendaBindingFix />
    </>
  );
}
