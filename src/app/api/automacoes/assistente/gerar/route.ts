import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";

export const runtime = "nodejs";

type ContextoAssistenteFluxos = {
  ativo: true;
};

type UsoResposta = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  [chave: string]: unknown;
};

type RespostaOpenAI = {
  id?: string;
  status?: string;
  output_text?: string;
  output?: unknown[];
  usage?: UsoResposta | null;
  incomplete_details?: {
    reason?: string | null;
  } | null;
  [chave: string]: unknown;
};

type CriarResposta = (
  body: Record<string, unknown>,
  options?: unknown
) => Promise<RespostaOpenAI>;

type PrototipoResponses = {
  create: CriarResposta;
};

const contextoAssistenteFluxos =
  new AsyncLocalStorage<ContextoAssistenteFluxos>();

let sdkResilienteInstalado = false;
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
Reduza objetivo, resumo e mensagens ao essencial.
Nao repita a arvore no resumo e retorne somente o JSON final.
`.trim();

function copiarPayload(valor: Record<string, unknown>) {
  return structuredClone(valor);
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
  body: Record<string, unknown>,
  limite: number,
  repetir: boolean
) {
  const payload = copiarPayload(body);
  const limiteAtual = Number(payload.max_output_tokens || 0);

  payload.max_output_tokens = Math.max(
    Number.isFinite(limiteAtual) ? limiteAtual : 0,
    limite
  );

  anexarInstrucaoSistema(payload, INSTRUCAO_COMPACTA);

  if (repetir) {
    anexarInstrucaoSistema(payload, INSTRUCAO_REPETICAO);
  }

  return payload;
}

function extrairTextoSaida(resposta: RespostaOpenAI) {
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

function respostaEstruturadaValida(resposta: RespostaOpenAI) {
  if (resposta.status && resposta.status !== "completed") return false;
  if (resposta.incomplete_details?.reason) return false;

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
  primeira: RespostaOpenAI,
  segunda: RespostaOpenAI
) {
  const usoPrimeira = primeira.usage || {};
  const usoSegunda = segunda.usage || {};

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

function instalarSdkResiliente() {
  if (sdkResilienteInstalado) return;
  sdkResilienteInstalado = true;

  const clienteInstrumentacao = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "instrumentacao",
  });
  const prototipo = Object.getPrototypeOf(
    clienteInstrumentacao.responses
  ) as PrototipoResponses;
  const criarOriginal = prototipo.create;

  prototipo.create = async function criarRespostaResiliente(
    body: Record<string, unknown>,
    options?: unknown
  ) {
    if (!contextoAssistenteFluxos.getStore()?.ativo) {
      return criarOriginal.call(this, body, options);
    }

    const primeiroPayload = prepararPayload(
      body,
      LIMITE_SAIDA_ASSISTENTE,
      false
    );
    const primeiraResposta = await criarOriginal.call(
      this,
      primeiroPayload,
      options
    );

    if (respostaEstruturadaValida(primeiraResposta)) {
      return primeiraResposta;
    }

    console.warn("[assistente-fluxos] repetindo resposta estruturada", {
      response_id: primeiraResposta.id || null,
      status: primeiraResposta.status || null,
      motivo:
        primeiraResposta.incomplete_details?.reason || "json_invalido",
      output_length: extrairTextoSaida(primeiraResposta).length,
      limite_inicial: LIMITE_SAIDA_ASSISTENTE,
      limite_repeticao: LIMITE_SAIDA_REPETICAO,
    });

    const segundoPayload = prepararPayload(
      body,
      LIMITE_SAIDA_REPETICAO,
      true
    );
    const segundaResposta = await criarOriginal.call(
      this,
      segundoPayload,
      options
    );

    return somarUsoRespostas(primeiraResposta, segundaResposta);
  };
}

async function carregarModuloOriginal() {
  instalarSdkResiliente();
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
