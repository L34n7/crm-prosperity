"use client";

import { useEffect } from "react";

export const LIMITE_PEDIDO_IA = 20_000;
const CHAVE_SESSAO = "prosperity:assistente-fluxos:sessao";
const SELETOR_CONTADOR = "[data-contador-pedido-ia]";
const CODIGO_GERACAO_PENDENTE = "GERACAO_IA_EM_PROCESSAMENTO";
const INTERVALO_CONSULTA_MS = 5_000;
const TEMPO_MAXIMO_CONSULTA_MS = 9 * 60_000;

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
    return valor && typeof valor === "object"
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function lerJsonResposta(response: Response) {
  return response
    .clone()
    .json()
    .catch(() => null as Record<string, unknown> | null);
}

function aguardar(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function acompanharGeracaoAssincrona(
  responseInicial: Response,
  originalFetch: typeof window.fetch
) {
  let response = responseInicial;
  let corpo = await lerJsonResposta(response);
  const inicio = Date.now();

  while (
    response.status === 202 &&
    corpo?.code === CODIGO_GERACAO_PENDENTE
  ) {
    const sessaoId = String(corpo.sessao_id || corpo.proposta_id || "").trim();
    if (!sessaoId) return response;

    window.localStorage.setItem(CHAVE_SESSAO, sessaoId);

    if (Date.now() - inicio >= TEMPO_MAXIMO_CONSULTA_MS) {
      return response;
    }

    await aguardar(INTERVALO_CONSULTA_MS);
    response = await originalFetch("/api/automacoes/assistente/gerar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modo: "criar_fluxo",
        acao: "atualizar",
        sessao_id: sessaoId,
      }),
    });
    corpo = await lerJsonResposta(response);
  }

  const sessaoFinal = String(corpo?.sessao_id || "").trim();
  if (sessaoFinal) window.localStorage.setItem(CHAVE_SESSAO, sessaoFinal);
  return response;
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
        const response = await originalFetch(input, init);
        return endpointAssistente(input)
          ? acompanharGeracaoAssincrona(response, originalFetch)
          : response;
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

        await aguardar(900);
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
        return acompanharGeracaoAssincrona(recuperacao, originalFetch);
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
