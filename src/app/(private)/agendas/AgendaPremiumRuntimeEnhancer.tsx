"use client";

import AgendaPremiumRuntimeEnhancerBase from "./AgendaPremiumRuntimeEnhancerBase";
import AgendaCalendarIntegrationScopeEnhancer from "./AgendaCalendarIntegrationScopeEnhancer";

export default function AgendaPremiumRuntimeEnhancer() {
  return (
    <>
      <AgendaPremiumRuntimeEnhancerBase />
      <AgendaCalendarIntegrationScopeEnhancer />
    </>
  );
}
