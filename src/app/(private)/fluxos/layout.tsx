import { Suspense, type ReactNode } from "react";

import AssistenteConfirmacaoAnterior from "./AssistenteConfirmacaoAnterior";
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

  [class*="editorPanel"] > [class*="editorHeader"] {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: start !important;
    gap: 16px !important;
    min-width: 0 !important;
    min-height: 0 !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] > div:first-child {
    min-width: 0 !important;
    max-width: none !important;
    flex: initial !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] [class*="editorTitle"] {
    display: -webkit-box !important;
    max-width: 100% !important;
    overflow: hidden !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
    line-clamp: 2 !important;
    font-size: 22px !important;
    line-height: 1.15 !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] [class*="headerActions"] {
    min-width: 0 !important;
    max-width: 100% !important;
    justify-self: end !important;
    flex: initial !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] [class*="headerActionsButtons"] {
    justify-content: flex-end !important;
    flex-wrap: wrap !important;
  }

  .assistantPreviousConfirmationButton {
    order: -1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 40px;
    border: 1px solid var(--crm-border-strong);
    border-radius: 14px;
    background: var(--crm-surface);
    color: var(--crm-text-strong);
    padding: 9px 13px;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.2;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .assistantPreviousConfirmationButton:hover:not(:disabled) {
    border-color: var(--crm-primary-border);
    background: var(--crm-surface-subtle);
  }

  .assistantPreviousConfirmationButton:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  @media (max-width: 1180px) {
    [class*="editorPanel"] > [class*="editorHeader"] {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    [class*="editorPanel"] > [class*="editorHeader"] [class*="headerActions"] {
      width: 100% !important;
      justify-self: stretch !important;
    }
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
      <AssistenteConfirmacaoAnterior />
      <Suspense fallback={null}>
        <FluxoIaAtivacaoModal />
      </Suspense>
      <style>{ESTILOS_BOTOES_PREVIA}</style>
    </>
  );
}
