"use client";

import AgendaAutomationEnhancer from "./AgendaAutomationEnhancer";
import AgendaAutomationRuntimeStatus from "./AgendaAutomationRuntimeStatus";
import AgendaEnhancerLegacy from "./AgendaEnhancerLegacy";

export default function AgendaEnhancer() {
  return (
    <>
      <AgendaEnhancerLegacy />
      <AgendaAutomationEnhancer />
      <AgendaAutomationRuntimeStatus />
    </>
  );
}
