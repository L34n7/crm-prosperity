import Script from "next/script";
import { Suspense, type ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

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
    background: var(--crm-surface) !important;
    box-shadow: 0 2px 4px var(--crm-ui-private-shadow-rgb-15-23-42-0-08) !important;
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
    box-shadow: 0 1px 2px var(--crm-ui-private-shadow-rgb-15-23-42-0-08) !important;
  }
`;

const SCRIPT_ESTIMATIVA_TOKENS = `
(() => {
  const formatador = new Intl.NumberFormat("pt-BR");

  function limitar(valor, minimo, maximo) {
    return Math.max(minimo, Math.min(maximo, valor));
  }

  function normalizar(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase();
  }

  function complexidadeFluxo(texto) {
    const linhas = texto
      .split(/\\r?\\n/)
      .map((linha) => linha.trim())
      .filter(Boolean);
    const marcadores = linhas.filter((linha) =>
      /^(?:[-*•▪◦]|\\d+[.)]|📸|💉|✨|😊|💰|📅|📍|👩|🤍|🗺|⬅|❓)/.test(linha)
    ).length;
    const secoes = linhas.filter((linha) => {
      if (linha.length > 82) return false;
      const semAcentos = normalizar(linha);
      return (
        /^(menu|objetivo|servicos|valores|antes e depois|duvidas frequentes|agendamento|localizacao|falar com especialista|regras importantes)/.test(semAcentos) ||
        (linha === linha.toUpperCase() && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(linha))
      );
    }).length;
    const termosNavegacao =
      normalizar(texto).match(
        /menu|botao|botoes|opcao|opcoes|voltar|faq|duvida|agend|procedimento|captur|transfer|localiza|antes e depois/g
      )?.length || 0;

    return limitar(
      (Math.min(texto.length, 6000) / 6000) * 0.32 +
        (Math.min(linhas.length, 110) / 110) * 0.18 +
        (Math.min(marcadores, 35) / 35) * 0.2 +
        (Math.min(secoes, 14) / 14) * 0.15 +
        (Math.min(termosNavegacao, 30) / 30) * 0.15,
      0.12,
      1
    );
  }

  function estimarCriacaoFluxo(texto) {
    const complexidade = complexidadeFluxo(texto);
    const tokensPedido = Math.ceil(texto.length / 3.5);

    // A criação completa realiza duas etapas cobradas: briefing estruturado e
    // geração do plano. A estimativa também considera o prompt técnico interno,
    // raciocínio, JSON de blocos e conexões e a complexidade da árvore solicitada.
    const entradaBriefing = 4200 + tokensPedido;
    const saidaBriefing = 900 + complexidade * 2200;
    const entradaGeracao =
      11800 + Math.min(4000, tokensPedido * 0.7 + complexidade * 1800);
    const saidaGeracao = 6200 + complexidade * 15500;

    return Math.ceil(
      (entradaBriefing + saidaBriefing + entradaGeracao + saidaGeracao) * 1.02
    );
  }

  function atualizarTexto(elemento, valor) {
    if (elemento && elemento.textContent !== valor) elemento.textContent = valor;
  }

  function aplicarEstimativa() {
    const modais = Array.from(
      document.querySelectorAll('[class*="modalCard"]')
    );
    const modal = modais.find((item) =>
      String(item.querySelector("h3")?.textContent || "").includes("Criar fluxo IA")
    );
    if (!modal) return;

    const textarea = document.querySelector('[class*="assistantPanel"] textarea');
    const pedido = String(textarea?.value || "").trim();
    if (!pedido) return;

    const estimado = estimarCriacaoFluxo(pedido);
    const minimo = Math.ceil(estimado * 0.85);
    const maximo = Math.ceil(estimado * 1.15);
    const caixa = modal.querySelector('[class*="tokenEstimateBox"]');

    atualizarTexto(
      caixa?.querySelector("strong"),
      formatador.format(minimo) + " ~ " + formatador.format(maximo) + " tokens"
    );
    atualizarTexto(
      caixa?.querySelector("small"),
      "Inclui o briefing estruturado, o prompt técnico completo e a geração dos blocos e conexões."
    );

    const detalhe = modal.querySelector('[class*="tokenEstimateItem"]');
    atualizarTexto(
      detalhe?.querySelector("span"),
      "Briefing estruturado + geração completa do fluxo"
    );
    atualizarTexto(
      detalhe?.querySelector("strong"),
      "~" + formatador.format(estimado) + " tokens"
    );
  }

  let frame = 0;
  function agendarAtualizacao() {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      aplicarEstimativa();
    });
  }

  const observador = new MutationObserver(agendarAtualizacao);
  observador.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  document.addEventListener("input", agendarAtualizacao, true);
  agendarAtualizacao();
})();
`;

export default async function FluxosLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("fluxos.visualizar");

  return (
    <>
      {children}
      <AssistenteFluxosClientGuard />
      <AssistenteConfirmacaoAnterior />
      <Suspense fallback={null}>
        <FluxoIaAtivacaoModal />
      </Suspense>
      <style>{ESTILOS_BOTOES_PREVIA}</style>
      <Script
        id="calibrar-estimativa-tokens-fluxos"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: SCRIPT_ESTIMATIVA_TOKENS }}
      />
    </>
  );
}
