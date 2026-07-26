"use client";

import { useEffect } from "react";

export const LIMITE_PEDIDO_IA = 20_000;
const CHAVE_SESSAO = "prosperity:assistente-fluxos:sessao";
const SELETOR_CONTADOR = "[data-contador-pedido-ia]";
const SELETOR_AJUDA_GATILHOS = "[data-ajuda-gatilhos-lote]";
const CODIGO_GERACAO_PENDENTE = "GERACAO_IA_EM_PROCESSAMENTO";
const ENDPOINT_SESSAO_ATIVA = "/api/automacoes/assistente/sessao-ativa";
const INTERVALO_CONSULTA_MS = 15_000;
const TEMPO_MAXIMO_CONSULTA_MS = 9 * 60_000;
const TENTATIVAS_REDE = 4;

function urlRequisicao(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function endpointAssistente(input: RequestInfo | URL) {
  return urlRequisicao(input).includes("/api/automacoes/assistente/gerar");
}

function endpointGatilhos(input: RequestInfo | URL) {
  const url = urlRequisicao(input).split("?")[0];
  return /\/api\/automacoes\/[^/]+\/gatilhos\/?$/.test(url);
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

function palavrasChaveDoValor(valor: unknown) {
  return Array.from(
    new Set(
      String(valor || "")
        .split(/[,;\n]+/)
        .map((item) => item.trim().toLocaleLowerCase("pt-BR"))
        .filter(Boolean)
    )
  );
}

function prepararLotePalavrasChave(
  input: RequestInfo | URL,
  init?: RequestInit
): { input: RequestInfo | URL; init?: RequestInit } {
  if (
    !endpointGatilhos(input) ||
    String(init?.method || "GET").toUpperCase() !== "POST"
  ) {
    return { input, init };
  }

  const body = corpoJson(init);
  const condicao = String(body?.condicao || "contem");
  const palavras = palavrasChaveDoValor(body?.valor);

  if (condicao === "regex" || palavras.length < 2) {
    return { input, init };
  }

  const url = urlRequisicao(input);
  const [caminho, query = ""] = url.split("?");
  const urlLote = `${caminho.replace(/\/$/, "")}/lote${query ? `?${query}` : ""}`;

  return {
    input: urlLote,
    init: {
      ...init,
      body: JSON.stringify({
        ...body,
        valores: palavras,
      }),
    },
  };
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

async function fetchComRetry(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  tentativas = TENTATIVAS_REDE
) {
  let ultimoErro: unknown = null;

  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    try {
      return await originalFetch(input, init);
    } catch (error) {
      ultimoErro = error;
      if (tentativa >= tentativas - 1) break;
      await aguardar(Math.min(5_000, 700 * 2 ** tentativa));
    }
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error("Falha temporária de conexão.");
}

function respostaPendenteLocal(sessaoId: string) {
  return new Response(
    JSON.stringify({
      ok: true,
      code: CODIGO_GERACAO_PENDENTE,
      proposta_id: sessaoId,
      sessao_id: sessaoId,
      modo: "criar_fluxo",
      fase: "coletando",
      mensagem:
        "A conexão oscilou, mas a geração continua salva. O sistema retomará a mesma criação automaticamente.",
      pergunta: {
        id: "geracao_assincrona:status",
        etapa_ref: "geracao_assincrona",
        campo: "clarificacao",
        tipo: "texto",
        mensagem: "A geração principal continua em andamento.",
        ajuda:
          "Nenhuma nova geração será iniciada. O mesmo processo salvo será consultado novamente.",
        obrigatoria: false,
        bloqueada: true,
        valor_sugerido: null,
        opcoes: [],
      },
      progresso: { respondidas: 0, total: 1 },
      historico: [],
      resumo: "Geração salva e aguardando reconexão",
      materializado: false,
      plano: { etapas: [] },
      avisos: [],
    }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function buscarSessaoAtivaRemota(originalFetch: typeof window.fetch) {
  const response = await fetchComRetry(
    originalFetch,
    ENDPOINT_SESSAO_ATIVA,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
    3
  );

  if (!response.ok) return "";
  const corpo = await lerJsonResposta(response);
  return String(corpo?.sessao_id || "").trim();
}

async function acompanharGeracaoAssincrona(
  responseInicial: Response,
  originalFetch: typeof window.fetch
) {
  let response = responseInicial;
  let ultimaRespostaValida = responseInicial;
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

    try {
      response = await fetchComRetry(
        originalFetch,
        "/api/automacoes/assistente/gerar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo: "criar_fluxo",
            acao: "atualizar",
            sessao_id: sessaoId,
          }),
        },
        3
      );
      ultimaRespostaValida = response;
      corpo = await lerJsonResposta(response);
    } catch {
      return ultimaRespostaValida;
    }
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

function instalarCadastroMultiploPalavrasChave() {
  const inputs = Array.from(document.querySelectorAll("input")).filter((item) =>
    String(item.getAttribute("placeholder") || "")
      .toLocaleLowerCase("pt-BR")
      .includes("suporte, login, senha")
  );

  for (const input of inputs) {
    if (!(input instanceof HTMLInputElement)) continue;

    input.placeholder = "Ex: suporte, login, senha";
    const container = input.parentElement;
    if (!container || container.querySelector(SELETOR_AJUDA_GATILHOS)) continue;

    const ajuda = document.createElement("small");
    ajuda.dataset.ajudaGatilhosLote = "true";
    ajuda.textContent =
      "Cadastre várias palavras de uma vez separando por vírgula ou ponto e vírgula.";
    ajuda.style.display = "block";
    ajuda.style.marginTop = "6px";
    ajuda.style.opacity = "0.72";
    ajuda.style.lineHeight = "1.4";
    container.appendChild(ajuda);
  }
}

function instalarAprimoramentos() {
  instalarLimitePrompt();
  instalarCadastroMultiploPalavrasChave();
}

export default function AssistenteFluxosClientGuard() {
  useEffect(() => {
    let cancelado = false;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requisicao = prepararLotePalavrasChave(input, init);

      try {
        const response = await originalFetch(requisicao.input, requisicao.init);
        return endpointAssistente(input)
          ? acompanharGeracaoAssincrona(response, originalFetch)
          : response;
      } catch (error) {
        if (!endpointAssistente(input)) throw error;

        const body = corpoJson(init);
        let sessaoId = String(
          body?.sessao_id ||
            body?.sessaoId ||
            window.localStorage.getItem(CHAVE_SESSAO) ||
            ""
        ).trim();

        if (!sessaoId) {
          sessaoId = await buscarSessaoAtivaRemota(originalFetch).catch(() => "");
        }

        if (!sessaoId) throw error;
        window.localStorage.setItem(CHAVE_SESSAO, sessaoId);

        await aguardar(900);

        try {
          const recuperacao = await fetchComRetry(
            originalFetch,
            "/api/automacoes/assistente/gerar",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                modo: "criar_fluxo",
                acao: "retomar",
                sessao_id: sessaoId,
              }),
            },
            3
          );

          if (!recuperacao.ok) throw error;
          return acompanharGeracaoAssincrona(recuperacao, originalFetch);
        } catch {
          return respostaPendenteLocal(sessaoId);
        }
      }
    };

    async function sincronizarSessaoRemota() {
      if (window.localStorage.getItem(CHAVE_SESSAO)) return;

      const sessaoId = await buscarSessaoAtivaRemota(originalFetch).catch(() => "");
      if (!sessaoId || cancelado) return;

      window.localStorage.setItem(CHAVE_SESSAO, sessaoId);
      window.location.reload();
    }

    void sincronizarSessaoRemota();
    instalarAprimoramentos();
    const observer = new MutationObserver(instalarAprimoramentos);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelado = true;
      observer.disconnect();
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
