import { Suspense, type ReactNode } from "react";

import AssistenteFluxosClientGuard from "./AssistenteFluxosClientGuard";
import FluxoIaAtivacaoModal from "./FluxoIaAtivacaoModal";

const ESTILOS_TIPOGRAFIA_BOTOES_PREVIA = `
  [class*="whatsappFlowBubbleRow"]:has([class*="whatsappFlowButtons"])
    + [class*="whatsappFlowJourneySelector"]
    [class*="whatsappFlowJourneyOptions"] button {
    min-height: 32px !important;
    padding: 8px 10px !important;
    font-size: 12px !important;
    line-height: 1.25 !important;
    font-weight: 800 !important;
  }
`;

export default function FluxosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AssistenteFluxosClientGuard />
      <Suspense fallback={null}>
        <FluxoIaAtivacaoModal />
      </Suspense>
      <style>{ESTILOS_TIPOGRAFIA_BOTOES_PREVIA}</style>
    </>
  );
}
