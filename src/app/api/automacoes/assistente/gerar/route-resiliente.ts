import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import type { ContextoAssistenteFluxos } from "./route-contexto-ia";
import { prepararPayloadAssistente } from "./route-contexto-ia";
import { carregarContextoAssistente, persistirInstrucaoCompleta } from "./route-sessao-contexto";
import { registrarDiagnosticoIa } from "./route-diagnostico-ia";

export const runtime = "nodejs";

type RespostaOpenAI = {
  id?: string;
  usage?: Record<string, unknown> | null;
  [chave: string]: unknown;
};

type CriarResposta = (
  body: Record<string, unknown>,
  options?: unknown
) => Promise<RespostaOpenAI>;

type PrototipoResponses = { create: CriarResposta };
type ObjetoJson = Record<string, unknown>;

const contextoAssistenteFluxos = new AsyncLocalStorage<ContextoAssistenteFluxos>();
let sdkInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null = null;

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 24000
  );
  if (!Number.isFinite(configurado)) return 24000;
  return Math.max(8000, Math.min(32000, Math.floor(configurado)));
})();

const LIMITE_CHAMADA_IA_MS = 235_000;

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

/**
 * A IA recebe o pedido, os recursos reais, o schema e o prompt padrao completo
 * em uma unica chamada. Planejamento e revisoes adicionais do sistema foram
 * removidos para impedir que respostas posteriores sobrescrevam um fluxo que
 * ja estava coerente ou aumentem o consumo sem garantir melhoria.
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
      repetir: false,
      contexto,
    });

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_unica_request",
      payload,
      metadados: {
        estrategia: "prompt_padrao_completo_uma_unica_chamada",
        planejamento_no_sistema: false,
        revisao_no_sistema: false,
      },
    });

    const resposta = await criarOriginal.call(this, payload, {
      ...objeto(options),
      signal: AbortSignal.timeout(LIMITE_CHAMADA_IA_MS),
    });

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_unica_response",
      resposta,
      metadados: {
        estrategia: "ia_planeja_revisa_e_entrega_fluxo_final",
      },
    });

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

      return response;
    }
  );
}
