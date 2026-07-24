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
type PrototipoResponses = { create: CriarResposta };
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
    process.env.OPENAI_ASSISTENTE_FLUXOS_REASONING_EFFORT || "high"
  ).toLowerCase();
  return ["none", "low", "medium", "high", "xhigh"].includes(informado)
    ? informado
    : "high";
})();

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 32000
  );
  if (!Number.isFinite(configurado)) return 32000;
  return Math.max(12000, Math.min(48000, Math.floor(configurado)));
})();

const LIMITE_CHAMADA_IA_MS = 235_000;

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
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
 * planeja e revisa internamente. Depois da resposta, o sistema apenas confirma
 * se o JSON e estruturalmente persistivel; nao corrige significado ou caminhos.
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

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_prompt_mestre_request",
      payload,
      metadados: {
        estrategia: "uma_ia_um_prompt_mestre_um_json_final",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        reasoning_effort: ESFORCO_RACIOCINIO,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
        planejamento_adicional_no_sistema: false,
        revisao_adicional_no_sistema: false,
        reparo_semantico_no_sistema: false,
      },
    });

    const resposta = await criarOriginal.call(this, payload, {
      ...objeto(options),
      signal: AbortSignal.timeout(LIMITE_CHAMADA_IA_MS),
    });

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
        estrategia: "ia_entrega_fluxo_final_sem_reparo",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
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

      if (!mensagem.includes("RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA")) {
        return response;
      }

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
  );
}
