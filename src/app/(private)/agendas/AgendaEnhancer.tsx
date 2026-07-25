"use client";

import AgendaAutomationEnhancer from "./AgendaAutomationEnhancer";
import AgendaEnhancerLegacy from "./AgendaEnhancerLegacy";

export default function AgendaEnhancer() {
  return (
    <>
      <AgendaEnhancerLegacy />
      <AgendaAutomationEnhancer />
    </>
  );
}
