import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import { validarPlanoAssistenteEstrutural } from "@/lib/automacoes/assistente-fluxos-validacao-estrutural";
import {
  prepararPayloadAssistente,
  type ContextoAssistenteFluxos,
} from "./route-contexto-ia";
import { VERSAO_PROMPT_MESTRE_FLUXOS } from "./route-arquitetura-fluxos-ia";
import { registrarDiagnosticoIa } from "./route-diagnostico-ia";
import {
  extrairTextoSaida,
  substituirTextoSaida,
  type RespostaOpenAI,
} from "./route-validacao-ia";
import {
  carregarContextoAssistente,
  persistirInstrucaoCompleta,
} from "./route-sessao-contexto";

export const runtime = "nodejs";

type CriarResposta = (
  body: Record<string, unknown>,
  options?: unknown
) => Promise<RespostaOpenAI>;
type RecuperarResposta = (
  responseId: string,
  options?: unknown
) => Promise<RespostaOpenAI>;
type PrototipoResponses = {
  create: CriarResposta;
  retrieve: RecuperarResposta;
};
type ObjetoJson = Record<string, unknown>;

const contextoAssistenteFluxos =
  new AsyncLocalStorage<ContextoAssistenteFluxos>();
let sdkInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null =
  null;

const MODELO_ASSISTENTE_FLUXOS =
  process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL || "gpt-5.5";

const ESFORCO_RACIOCINIO = (() => {
  const informado = String(
    process.env.OPENAI_ASSISTENTE_FLUXOS_REASONING_EFFORT || "medium"
  ).toLowerCase();
  return ["none", "low", "medium", "high", "xhigh"].includes(informado)
    ? informado
    : "medium";
})();

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 24000
  );
  if (!Number.isFinite(configurado)) return 24000;
  return Math.max(10000, Math.min(36000, Math.floor(configurado)));
})();

// A função da Vercel possui limite de cinco minutos. A geração fica em
// background na OpenAI e esta rota usa chamadas curtas de consulta, reservando
// tempo suficiente para validar, materializar e persistir o fluxo no final.
const LIMITE_TOTAL_GERACAO_MS = 250_000;
const LIMITE_REQUISICAO_OPENAI_MS = 55_000;
const INTERVALO_CONSULTA_INICIAL_MS = 1_500;
const INTERVALO_CONSULTA_MAXIMO_MS = 6_000;

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function mensagemErro(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Erro desconhecido.");
}

function erroFoiAbortado(error: unknown) {
  const nome = error instanceof Error ? error.name : "";
  const mensagem = mensagemErro(error).toLowerCase();
  return (
    nome === "AbortError" ||
    mensagem.includes("aborted") ||
    mensagem.includes("aborterror") ||
    mensagem.includes("request timed out") ||
    mensagem.includes("request timeout")
  );
}

function statusEmProcessamento(status: unknown) {
  return ["queued", "in_progress"].includes(String(status || ""));
}

function statusConcluido(status: unknown) {
  return String(status || "") === "completed";
}

function detalheFalhaResposta(resposta: RespostaOpenAI) {
  const erro = objeto(resposta.error);
  const incompleto = objeto(resposta.incomplete_details);
  return String(
    erro.message ||
      incompleto.reason ||
      `status ${String(resposta.status || "desconhecido")}`
  );
}

function aguardar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function aguardarRespostaBackground(params: {
  responses: PrototipoResponses;
  respostaInicial: RespostaOpenAI;
  prazoFinal: number;
}) {
  let resposta = params.respostaInicial;
  let intervalo = INTERVALO_CONSULTA_INICIAL_MS;

  while (statusEmProcessamento(resposta.status)) {
    if (!resposta.id) {
      throw new Error(
        "GERACAO_IA_FALHOU: a OpenAI iniciou a geração sem retornar o identificador da resposta."
      );
    }

    const restante = params.prazoFinal - Date.now();
    if (restante <= intervalo + 2_000) {
      throw new Error(
        `GERACAO_IA_TIMEOUT: a geração continuou em processamento além do tempo seguro do servidor. Resposta OpenAI: ${resposta.id}.`
      );
    }

    await aguardar(Math.min(intervalo, Math.max(500, restante - 2_000)));

    resposta = await params.responses.retrieve(resposta.id, {
      timeout: Math.min(LIMITE_REQUISICAO_OPENAI_MS, Math.max(5_000, restante)),
      maxRetries: 1,
      signal: AbortSignal.timeout(
        Math.min(LIMITE_REQUISICAO_OPENAI_MS, Math.max(5_000, restante))
      ),
    });

    intervalo = Math.min(
      INTERVALO_CONSULTA_MAXIMO_MS,
      Math.round(intervalo * 1.45)
    );
  }

  if (!statusConcluido(resposta.status)) {
    throw new Error(
      `GERACAO_IA_FALHOU: ${detalheFalhaResposta(resposta)}.`
    );
  }

  return resposta;
}

function normalizarRespostaFinal(resposta: RespostaOpenAI) {
  const texto = extrairTextoSaida(resposta);
  if (!texto) {
    throw new Error(
      "RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA: a IA nao retornou o JSON final."
    );
  }

  let plano: ObjetoJson;
  try {
    plano = objeto(JSON.parse(texto));
  } catch (error) {
    throw new Error(
      `RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA: JSON invalido: ${
        error instanceof Error ? error.message : "falha de leitura"
      }.`
    );
  }

  // Nao existe segunda etapa de IA. O plano precisa ser definitivo.
  plano.clarificacoes = [];
  const problemas = validarPlanoAssistenteEstrutural(plano);

  if (problemas.length > 0) {
    const detalhes = problemas
      .slice(0, 12)
      .map((problema) => problema.mensagem)
      .join(" ");
    throw new Error(
      `RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA: ${detalhes}`
    );
  }

  substituirTextoSaida(resposta, JSON.stringify(plano));
  return plano;
}

/**
 * Uma unica chamada recebe Prompt Mestre, pedido, recursos e schema. O modelo
 * planeja e revisa internamente. A resposta roda em background para nao manter
 * uma conexao HTTP longa com a OpenAI; o mesmo response_id e consultado ate o
 * JSON final ficar pronto. Nao existe uma segunda geração nem reparo semantico.
 */
function instalarSdkUmaChamada() {
  if (sdkInstalado) return;
  sdkInstalado = true;

  const clienteInstrumentacao = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "instrumentacao",
  });
  const prototipo = Object.getPrototypeOf(
    clienteInstrumentacao.responses
  ) as PrototipoResponses;
  const criarOriginal = prototipo.create;

  prototipo.create = async function criarRespostaUnica(
    this: PrototipoResponses,
    body: Record<string, unknown>,
    options?: unknown
  ) {
    const contexto = contextoAssistenteFluxos.getStore();
    if (!contexto?.ativo) return criarOriginal.call(this, body, options);

    const payload = prepararPayloadAssistente({
      body,
      limite: LIMITE_SAIDA_ASSISTENTE,
      contexto,
    });

    payload.model = MODELO_ASSISTENTE_FLUXOS;
    payload.reasoning = {
      ...objeto(payload.reasoning),
      effort: ESFORCO_RACIOCINIO,
    };
    payload.prompt_cache_key = VERSAO_PROMPT_MESTRE_FLUXOS;
    payload.background = true;
    payload.store = true;

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_prompt_mestre_request",
      payload,
      metadados: {
        estrategia: "uma_ia_um_prompt_mestre_um_json_final_background",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        reasoning_effort: ESFORCO_RACIOCINIO,
        max_output_tokens: LIMITE_SAIDA_ASSISTENTE,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
        background: true,
        planejamento_adicional_no_sistema: false,
        revisao_adicional_no_sistema: false,
        reparo_semantico_no_sistema: false,
      },
    });

    const prazoFinal = Date.now() + LIMITE_TOTAL_GERACAO_MS;
    let resposta: RespostaOpenAI;

    try {
      const respostaInicial = await criarOriginal.call(this, payload, {
        ...objeto(options),
        timeout: LIMITE_REQUISICAO_OPENAI_MS,
        maxRetries: 0,
        signal: AbortSignal.timeout(LIMITE_REQUISICAO_OPENAI_MS),
      });

      await registrarDiagnosticoIa({
        contexto,
        fase: "geracao_prompt_mestre_background_iniciada",
        resposta: respostaInicial,
        metadados: {
          response_id: respostaInicial.id || null,
          status: respostaInicial.status || null,
          background: true,
        },
      });

      resposta = await aguardarRespostaBackground({
        responses: this,
        respostaInicial,
        prazoFinal,
      });
    } catch (error) {
      const erro = erroFoiAbortado(error)
        ? new Error(
            "GERACAO_IA_TIMEOUT: a comunicação com a OpenAI excedeu o tempo de uma das consultas."
          )
        : error;

      await registrarDiagnosticoIa({
        contexto,
        fase: "geracao_prompt_mestre_falhou",
        problemas: [mensagemErro(erro)],
        metadados: {
          modelo: MODELO_ASSISTENTE_FLUXOS,
          background: true,
        },
      });

      throw erro;
    }

    let plano: ObjetoJson | null = null;
    let erroEstrutural: string | null = null;

    try {
      plano = normalizarRespostaFinal(resposta);
    } catch (error) {
      erroEstrutural =
        error instanceof Error ? error.message : "Falha estrutural desconhecida.";
    }

    await registrarDiagnosticoIa({
      contexto,
      fase: erroEstrutural
        ? "geracao_prompt_mestre_estrutura_invalida"
        : "geracao_prompt_mestre_response",
      resposta,
      problemas: erroEstrutural ? [erroEstrutural] : [],
      metadados: {
        estrategia: "ia_entrega_fluxo_final_sem_reparo_background",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
        response_id: resposta.id || null,
        background: true,
        validacao_aplicada: "json_schema_refs_ids",
        validacao_semantica: false,
        reparo_semantico: false,
        etapas: Array.isArray(plano?.etapas) ? plano.etapas.length : null,
        rotas: Array.isArray(plano?.rotas) ? plano.rotas.length : null,
      },
    });

    if (erroEstrutural) throw new Error(erroEstrutural);
    return resposta;
  };
}

async function carregarModuloOriginal() {
  instalarSdkUmaChamada();
  moduloOriginalPromise ||= import("./route-original");
  return moduloOriginalPromise;
}

function respostaErroConhecido(mensagem: string) {
  if (mensagem.includes("RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA")) {
    return Response.json(
      {
        ok: false,
        code: "RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA",
        error: mensagem.replace(
          /^.*RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA:\s*/,
          ""
        ),
      },
      { status: 422 }
    );
  }

  if (mensagem.includes("GERACAO_IA_TIMEOUT")) {
    return Response.json(
      {
        ok: false,
        code: "GERACAO_IA_TIMEOUT",
        error:
          "A IA ainda não concluiu o fluxo dentro do tempo seguro do servidor. A geração foi interrompida sem salvar um fluxo incompleto. Tente novamente com uma solicitação um pouco mais objetiva.",
      },
      { status: 504 }
    );
  }

  if (mensagem.includes("GERACAO_IA_FALHOU")) {
    return Response.json(
      {
        ok: false,
        code: "GERACAO_IA_FALHOU",
        error: mensagem.replace(/^.*GERACAO_IA_FALHOU:\s*/, ""),
      },
      { status: 502 }
    );
  }

  return null;
}

export async function executarAssistente(request: Request) {
  const body = objeto(await request.clone().json().catch(() => ({})));
  const contextoRequisicao = await carregarContextoAssistente(body);
  const moduloOriginal = await carregarModuloOriginal();

  return contextoAssistenteFluxos.run(
    contextoRequisicao.contexto,
    async () => {
      const response = await moduloOriginal.POST(request);

      await persistirInstrucaoCompleta({
        response,
        instrucaoCompleta: contextoRequisicao.contexto.instrucaoCompleta,
        empresaId: contextoRequisicao.empresaId,
        usuarioId: contextoRequisicao.usuarioId,
      });

      if (response.status !== 500) return response;

      const corpo = await response
        .clone()
        .json()
        .catch(() => null as ObjetoJson | null);
      const mensagem = String(corpo?.error || "");
      return respostaErroConhecido(mensagem) || response;
    }
  );
}
