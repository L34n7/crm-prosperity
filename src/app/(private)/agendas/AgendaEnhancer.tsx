"use client";

import AgendaAutomationEnhancer from "./AgendaAutomationEnhancer";
import AgendaAutomationRuntimeStatus from "./AgendaAutomationRuntimeStatus";
import AgendaEnhancerLegacy from "./AgendaEnhancerLegacy";
import AgendaGoogleAgendaBindingFix from "./AgendaGoogleAgendaBindingFix";

export default function AgendaEnhancer() {
  return (
    <>
      <AgendaEnhancerLegacy />
      <AgendaAutomationEnhancer />
      <AgendaAutomationRuntimeStatus />
      <AgendaGoogleAgendaBindingFix />
    </>
  );
}
