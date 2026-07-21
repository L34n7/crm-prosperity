import { AsyncLocalStorage } from "node:async_hooks";

export const runtime = "nodejs";

type ContextoAssistenteFluxos = {
  ativo: true;
};

type RespostaOpenAIJson = Record<string, unknown>;

const contextoAssistenteFluxos =
  new AsyncLocalStorage<ContextoAssistenteFluxos>();
const fetchOriginal = globalThis.fetch.bind(globalThis);

let fetchResilienteInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null = null;

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 14000
  );

  if (!Number.isFinite(configurado)) return 14000;

  return Math.max(4200, Math.min(24000, Math.floor(configurado)));
})();

const LIMITE_SAIDA_REPETICAO = Math.min(
  24000,
  Math.max(LIMITE_SAIDA_ASSISTENTE, 20000)
);

const INSTRUCAO_COMPACTA = `
Regras adicionais de tamanho e compatibilidade:
- Seja conciso nos campos objetivo, resumo e mensagens.
- Nao repita no resumo a arvore ja representada por etapas e rotas.
- Preserve todos os caminhos pedidos, sem omitir opcoes.
- pergunta_botoes aceita no maximo 3 botoes.
- Quando houver mais de 3 opcoes, use pergunta_opcoes, que aceita ate 10 itens.
- Se o usuario exigir botoes, divida as opcoes em submenus de ate 3 botoes.
- Cada mensagem deve preferencialmente ter ate 700 caracteres.
`.trim();

const INSTRUCAO_REPETICAO = `
A resposta anterior nao terminou com um JSON completo e valido.
Gere novamente o plano completo conforme o schema, sem omitir etapas ou rotas.
Reduza objetivo, resumo e mensagens ao essencial e retorne somente o JSON final.
`.trim();

function obterUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function ehEndpointResponsesOpenAI(input: Parameters<typeof fetch>[0]) {
  try {
    const url = new URL(obterUrl(input));
    return (
      url.hostname === "api.openai.com" &&
      url.pathname.replace(/\/+$/, "") === "/v1/responses"
    );
  } catch {
    return false;
  }
}

function anexarInstrucaoSistema(
  payload: Record<string, unknown>,
  instrucao: string
) {
  if (!Array.isArray(payload.input)) return;

  const mensagemSistema = payload.input.find((item) => {
    return (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).role === "system"
    );
  });

  if (!mensagemSistema || typeof mensagemSistema !== "object") return;

  const mensagem = mensagemSistema as Record<string, unknown>;

  if (typeof mensagem.content === "string") {
    if (!mensagem.content.includes(instrucao)) {
      mensagem.content = `${mensagem.content}\n\n${instrucao}`;
    }
    return;
  }

  if (Array.isArray(mensagem.content)) {
    mensagem.content = [
      ...mensagem.content,
      {
        type: "input_text",
        text: instrucao,
      },
    ];
  }
}

function prepararPayload(
  body: string,
  limite: number,
  repetir: boolean
): string | null {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const limiteAtual = Number(payload.max_output_tokens || 0);

    payload.max_output_tokens = Math.max(
      Number.isFinite(limiteAtual) ? limiteAtual : 0,
      limite
    );

    anexarInstrucaoSistema(payload, INSTRUCAO_COMPACTA);

    if (repetir) {
      anexarInstrucaoSistema(payload, INSTRUCAO_REPETICAO);
    }

    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

async function lerRespostaJson(response: Response) {
  try {
    const valor = await response.clone().json();
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as RespostaOpenAIJson)
      : null;
  } catch {
    return null;
  }
}

function extrairTextoSaida(resposta: RespostaOpenAIJson) {
  if (typeof resposta.output_text === "string") {
    return resposta.output_text.trim();
  }

  if (!Array.isArray(resposta.output)) return "";

  const partes: string[] = [];

  for (const item of resposta.output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const conteudos = (item as Record<string, unknown>).content;
    if (!Array.isArray(conteudos)) continue;

    for (const conteudo of conteudos) {
      if (
        conteudo &&
        typeof conteudo === "object" &&
        !Array.isArray(conteudo)
      ) {
        const bloco = conteudo as Record<string, unknown>;
        if (bloco.type === "output_text" && typeof bloco.text === "string") {
          partes.push(bloco.text);
        }
      }
    }
  }

  return partes.join("").trim();
}

function respostaEstruturadaValida(resposta: RespostaOpenAIJson | null) {
  if (!resposta) return false;
  if (resposta.status && resposta.status !== "completed") return false;

  const texto = extrairTextoSaida(resposta);
  if (!texto) return false;

  try {
    JSON.parse(texto);
    return true;
  } catch {
    return false;
  }
}

function numeroUso(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function somarUsoRespostas(
  primeira: RespostaOpenAIJson,
  segunda: RespostaOpenAIJson
) {
  const usoPrimeira =
    primeira.usage &&
    typeof primeira.usage === "object" &&
    !Array.isArray(primeira.usage)
      ? (primeira.usage as Record<string, unknown>)
      : {};
  const usoSegunda =
    segunda.usage &&
    typeof segunda.usage === "object" &&
    !Array.isArray(segunda.usage)
      ? (segunda.usage as Record<string, unknown>)
      : {};

  segunda.usage = {
    ...usoSegunda,
    input_tokens:
      numeroUso(usoPrimeira.input_tokens) + numeroUso(usoSegunda.input_tokens),
    output_tokens:
      numeroUso(usoPrimeira.output_tokens) +
      numeroUso(usoSegunda.output_tokens),
    total_tokens:
      numeroUso(usoPrimeira.total_tokens) + numeroUso(usoSegunda.total_tokens),
  };

  return segunda;
}

function recriarRespostaJson(dados: RespostaOpenAIJson, base: Response) {
  const headers = new Headers(base.headers);
  headers.delete("content-length");

  return new Response(JSON.stringify(dados), {
    status: base.status,
    statusText: base.statusText,
    headers,
  });
}

function instalarFetchResiliente() {
  if (fetchResilienteInstalado) return;
  fetchResilienteInstalado = true;

  globalThis.fetch = (async (input, init) => {
    if (
      !contextoAssistenteFluxos.getStore()?.ativo ||
      !ehEndpointResponsesOpenAI(input) ||
      typeof init?.body !== "string"
    ) {
      return fetchOriginal(input, init);
    }

    const primeiroBody = prepararPayload(
      init.body,
      LIMITE_SAIDA_ASSISTENTE,
      false
    );

    if (!primeiroBody) {
      return fetchOriginal(input, init);
    }

    const primeiraResposta = await fetchOriginal(input, {
      ...init,
      body: primeiroBody,
    });

    if (!primeiraResposta.ok) return primeiraResposta;

    const primeiroJson = await lerRespostaJson(primeiraResposta);

    if (respostaEstruturadaValida(primeiroJson)) {
      return primeiraResposta;
    }

    const segundoBody = prepararPayload(
      init.body,
      LIMITE_SAIDA_REPETICAO,
      true
    );

    if (!segundoBody) return primeiraResposta;

    console.warn("[assistente-fluxos] repetindo resposta estruturada", {
      response_id:
        primeiroJson && typeof primeiroJson.id === "string"
          ? primeiroJson.id
          : null,
      status: primeiroJson?.status || null,
      motivo:
        primeiroJson?.incomplete_details &&
        typeof primeiroJson.incomplete_details === "object" &&
        !Array.isArray(primeiroJson.incomplete_details)
          ? (primeiroJson.incomplete_details as Record<string, unknown>).reason ||
            "json_invalido"
          : "json_invalido",
      limite_inicial: LIMITE_SAIDA_ASSISTENTE,
      limite_repeticao: LIMITE_SAIDA_REPETICAO,
    });

    const segundaResposta = await fetchOriginal(input, {
      ...init,
      body: segundoBody,
    });

    if (!segundaResposta.ok || !primeiroJson) return segundaResposta;

    const segundoJson = await lerRespostaJson(segundaResposta);
    if (!segundoJson) return segundaResposta;

    return recriarRespostaJson(
      somarUsoRespostas(primeiroJson, segundoJson),
      segundaResposta
    );
  }) as typeof fetch;
}

async function carregarModuloOriginal() {
  instalarFetchResiliente();
  moduloOriginalPromise ||= import("./route-original");
  return moduloOriginalPromise;
}

function erroJsonIncompleto(error: unknown) {
  return /unterminated string|unexpected end of json|json at position|json\.parse|valid json/i.test(
    String(error || "")
  );
}

export async function POST(request: Request) {
  const moduloOriginal = await carregarModuloOriginal();

  return contextoAssistenteFluxos.run({ ativo: true }, async () => {
    const response = await moduloOriginal.POST(request);

    if (response.status !== 500) return response;

    const corpo = await response
      .clone()
      .json()
      .catch(() => null as Record<string, unknown> | null);
    const mensagem =
      corpo && typeof corpo.error === "string" ? corpo.error : "";

    if (!erroJsonIncompleto(mensagem)) return response;

    return Response.json(
      {
        ok: false,
        code: "RESPOSTA_IA_INCOMPLETA",
        error:
          "A IA nao conseguiu concluir toda a estrutura do fluxo mesmo apos uma nova tentativa. Nenhum fluxo incompleto foi criado. Tente novamente mantendo os mesmos requisitos.",
      },
      { status: 422 }
    );
  });
}
