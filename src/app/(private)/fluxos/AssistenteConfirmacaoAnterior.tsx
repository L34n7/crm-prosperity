"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";

const CHAVE_SESSAO_ASSISTENTE_FLUXOS = "prosperity:assistente-fluxos:sessao";

function texto(elemento: Element | null) {
  return String(elemento?.textContent || "").replace(/\s+/g, " ").trim();
}

function encontrarHost() {
  const painel = document.querySelector<HTMLElement>('[class*="assistantPanel"]');
  if (!painel) return null;

  const possuiHistorico = Boolean(
    painel.querySelector('[class*="assistantHistoryTurn"]')
  );
  if (!possuiHistorico) return null;

  const acoesPergunta = painel.querySelector<HTMLElement>(
    '[class*="assistantQuestionActions"]'
  );
  if (acoesPergunta) return acoesPergunta;

  const acoes = Array.from(
    painel.querySelectorAll<HTMLElement>('[class*="assistantActions"]')
  );
  return acoes[acoes.length - 1] || null;
}

function reabrirAssistente() {
  const fechar = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Fechar assistente"]'
  );
  fechar?.click();

  window.setTimeout(() => {
    const botao = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((item) => texto(item).includes("Assistente IA"));
    botao?.click();
  }, 80);
}

export default function AssistenteConfirmacaoAnterior() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [voltando, setVoltando] = useState(false);

  useEffect(() => {
    let frame: number | null = null;

    const sincronizar = () => {
      frame = null;
      const proximoHost = encontrarHost();
      setHost((atual) => (atual === proximoHost ? atual : proximoHost));
    };

    const agendar = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(sincronizar);
    };

    agendar();
    const observer = new MutationObserver(agendar);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  async function voltar() {
    if (voltando) return;

    const sessaoId = window.localStorage.getItem(
      CHAVE_SESSAO_ASSISTENTE_FLUXOS
    );
    if (!sessaoId) {
      window.alert("A sessão do assistente não está mais disponível.");
      return;
    }

    try {
      setVoltando(true);
      const response = await fetch(
        "/api/automacoes/assistente/voltar-confirmacao",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao_id: sessaoId }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error || "Não foi possível voltar para a confirmação anterior."
        );
      }

      reabrirAssistente();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Não foi possível voltar para a confirmação anterior."
      );
    } finally {
      setVoltando(false);
    }
  }

  if (!host || !host.isConnected) return null;

  return createPortal(
    <button
      type="button"
      className="assistantPreviousConfirmationButton"
      onClick={() => void voltar()}
      disabled={voltando}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {voltando ? "Voltando..." : "Voltar para a confirmação anterior"}
    </button>,
    host
  );
}
