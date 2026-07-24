"use client";

import { useEffect } from "react";

export const LIMITE_PEDIDO_IA = 20_000;
const CHAVE_SESSAO = "prosperity:assistente-fluxos:sessao";
const SELETOR_CONTADOR = "[data-contador-pedido-ia]";

function endpointAssistente(input: RequestInfo | URL) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return url.includes("/api/automacoes/assistente/gerar");
}

function corpoJson(init?: RequestInit) {
  if (typeof init?.body !== "string") return null;
  try {
    const valor = JSON.parse(init.body);
    return valor && typeof valor === "object" ? valor as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function instalarLimitePrompt() {
  const textarea = Array.from(document.querySelectorAll("textarea")).find((item) =>
    item.closest("label")?.textContent?.includes("Pedido para a IA")
  );
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  textarea.maxLength = LIMITE_PEDIDO_IA;
  const label = textarea.closest("label");
  if (!label || label.querySelector(SELETOR_CONTADOR)) return;

  const contador = document.createElement("small");
  contador.dataset.contadorPedidoIa = "true";
  contador.style.display = "block";
  contador.style.marginTop = "6px";
  contador.style.textAlign = "right";
  contador.style.opacity = "0.72";

  const atualizar = () => {
    contador.textContent = `${textarea.value.length.toLocaleString("pt-BR")} / ${LIMITE_PEDIDO_IA.toLocaleString("pt-BR")} caracteres`;
  };

  textarea.addEventListener("input", atualizar);
  atualizar();
  label.appendChild(contador);
}

export default function AssistenteFluxosClientGuard() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await originalFetch(input, init);
      } catch (error) {
        if (!endpointAssistente(input)) throw error;

        const body = corpoJson(init);
        const sessaoId = String(
          body?.sessao_id ||
          body?.sessaoId ||
          window.localStorage.getItem(CHAVE_SESSAO) ||
          ""
        ).trim();

        if (!sessaoId) throw error;

        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const recuperacao = await originalFetch("/api/automacoes/assistente/gerar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo: "criar_fluxo",
            acao: "retomar",
            sessao_id: sessaoId,
          }),
        });

        if (!recuperacao.ok) throw error;
        return recuperacao;
      }
    };

    instalarLimitePrompt();
    const observer = new MutationObserver(instalarLimitePrompt);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
