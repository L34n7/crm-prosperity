"use client";

import AgendaPremiumRuntimeEnhancerBase from "./AgendaPremiumRuntimeEnhancerBase";
import AgendaCalendarIntegrationScopeEnhancer from "./AgendaCalendarIntegrationScopeEnhancer";
import AgendaManagementPresentation from "./AgendaManagementPresentation";
import AgendaSaveFeedback from "./AgendaSaveFeedback";

export default function AgendaPremiumRuntimeEnhancer() {
  return (
    <>
      <AgendaPremiumRuntimeEnhancerBase />
      <AgendaCalendarIntegrationScopeEnhancer />
      <AgendaManagementPresentation />
      <AgendaSaveFeedback />
    </>
  );
}
