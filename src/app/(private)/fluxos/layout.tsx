import { Suspense, type ReactNode } from "react";

import AssistenteFluxosClientGuard from "./AssistenteFluxosClientGuard";
import FluxoIaAtivacaoModal from "./FluxoIaAtivacaoModal";

const ESTILOS_BOTOES_PREVIA = `
  [class*="flowItemTitle"] {
    display: block !important;
    min-width: 0 !important;
    max-width: 100% !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  [class*="whatsappFlowBubbleRow"]:has([class*="whatsappFlowButtons"])
    + [class*="whatsappFlowJourneySelector"]
    [class*="whatsappFlowJourneyOptions"] button {
    min-height: 32px !important;
    padding: 8px 10px !important;
    font-size: 12px !important;
    line-height: 1.25 !important;
    font-weight: 800 !important;
  }

  [class*="whatsappFlowBubbleRow"]:has([class*="whatsappFlowButtons"])
    + [class*="whatsappFlowJourneySelector"] {
    align-self: flex-start !important;
    box-sizing: border-box !important;
    width: calc(100% - 20px) !important;
    max-width: calc(100% - 20px) !important;
    margin: -8px 0 8px 10px !important;
    padding: 0 10px 10px !important;
    border: 0 !important;
    border-radius: 0 0 12px 12px !important;
    background: #ffffff !important;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.08) !important;
  }

  [class*="whatsappFlowBubbleRow"]:has([class*="whatsappFlowButtons"])
    + [class*="whatsappFlowJourneySelector"] > span {
    display: none !important;
  }

  [class*="whatsappFlowBubbleRow"]:has([class*="whatsappFlowButtons"]) {
    align-self: flex-start !important;
    box-sizing: border-box !important;
    width: calc(100% - 20px) !important;
    max-width: calc(100% - 20px) !important;
    margin-left: 10px !important;
  }

  [class*="whatsappFlowBubbleRow"]:has([class*="whatsappFlowButtons"])
    [class*="whatsappFlowBubble"] {
    width: 100% !important;
    max-width: none !important;
    border-radius: 0 12px 0 0 !important;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08) !important;
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
      <style>{ESTILOS_BOTOES_PREVIA}</style>
    </>
  );
}
