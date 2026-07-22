import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import {
  prepararPayloadAssistente,
  type ContextoAssistenteFluxos,
} from "./route-contexto-ia";
import { completarRespostaPlano } from "./route-completar-estrutura";
import {
  repararRespostaPlano,
  somarUsoRespostas,
  validarQualidadePlano,
  type RespostaOpenAI,
} from "./route-validacao-ia";
import {
  carregarContextoAssistente,
  persistirInstrucaoCompleta,
} from "./route-sessao-contexto";
import {
  criarPayloadPlanejamento,
  devePlanejarJornada,
  extrairRequisitosNormalizados,
  injetarPlanejamentoNoPayload,
  type RequisitosNormalizadosFluxo,
} from "./route-planejamento-ia";
import { problemasReparaveisPeloCompilador } from "./route-politica-reparo";

export {
  deveExecutarRevisaoFinal,
  problemasReparaveisPeloCompilador,
} from "./route-politica-reparo";

export const runtime = "nodejs";

type CriarResposta = (
  body: Record<string, unknown>,
  options?: unknown
) => Promise<RespostaOpenAI>;
type PrototipoResponses = { create: CriarResposta };
type ObjetoJson = Record<string, unknown>;

const contextoAssistenteFluxos = new AsyncLocalStorage<ContextoAssistenteFluxos>();
let sdkResilienteInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null = null;
const LIMITE_PIPELINE_IA_MS = 210_000;

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 16000
  );
  if (!Number.isFinite(configurado)) return 16000;
  return Math.max(6000, Math.min(24000, Math.floor(configurado)));
})();
function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function repararECompletar(
  resposta: RespostaOpenAI,
  contexto: ContextoAssistenteFluxos
) {
  return completarRespostaPlano(repararRespostaPlano(resposta, contexto), contexto);
}

function opcoesComPrazo(options: unknown, prazoFinal: number) {
  const restante = Math.max(1_000, prazoFinal - Date.now());
  return {
    ...objeto(options),
    signal: AbortSignal.timeout(restante),
  };
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
    const contexto = contextoAssistenteFluxos.getStore();
    if (!contexto?.ativo) return criarOriginal.call(this, body, options);

    const pipelineCompleto = devePlanejarJornada(body, contexto);
    let requisitos: RequisitosNormalizadosFluxo | null = null;
    let respostaPlanejamento: RespostaOpenAI | null = null;
    let bodyPlanejado = body;
    const prazoFinal = Date.now() + LIMITE_PIPELINE_IA_MS;

    if (pipelineCompleto) {
      respostaPlanejamento = await criarOriginal.call(
        this,
        criarPayloadPlanejamento({ body, contexto }),
        opcoesComPrazo(options, prazoFinal)
      );
      requisitos = extrairRequisitosNormalizados(respostaPlanejamento);

      if (requisitos) {
        bodyPlanejado = injetarPlanejamentoNoPayload(body, requisitos);
      } else {
        console.warn("[assistente-fluxos] planejamento inicial ilegivel; seguindo com o pedido original", {
          response_id: respostaPlanejamento.id || null,
        });
      }
    }

    const primeiroPayload = prepararPayloadAssistente({
      body: bodyPlanejado,
      limite: LIMITE_SAIDA_ASSISTENTE,
      repetir: false,
      contexto,
    });
    let respostaPlano = repararECompletar(
      await criarOriginal.call(
        this,
        primeiroPayload,
        opcoesComPrazo(options, prazoFinal)
      ),
      contexto
    );
    if (respostaPlanejamento) {
      respostaPlano = somarUsoRespostas(
        respostaPlanejamento,
        respostaPlano
      );
    }
    const validacao = validarQualidadePlano(respostaPlano, contexto);

    if (!validacao.valido) {
      console.info("[assistente-fluxos] encaminhando plano ao compilador deterministico", {
        response_id: respostaPlano.id || null,
        problemas: validacao.problemas,
        reparaveis: problemasReparaveisPeloCompilador(validacao.problemas),
      });
    }

    // Nao existe nova chamada probabilistica para copy, reparo ou revisao.
    // O plano semantico ja orientou a escrita final; estrutura, rotas e
    // garantias de execucao pertencem ao compilador deterministico.
    return respostaPlano;
  };
}

async function carregarModuloOriginal() {
  instalarSdkResiliente();
  moduloOriginalPromise ||= import("./route-original");
  return moduloOriginalPromise;
}

function erroJsonIncompleto(error: unknown) {
  return /unterminated string|unexpected end of json|json at position|json\.parse|valid json|expected property name/i.test(
    String(error || "")
  );
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
      const mensagem =
        corpo && typeof corpo.error === "string" ? corpo.error : "";

      if (!erroJsonIncompleto(mensagem)) return response;

      return Response.json(
        {
          ok: false,
          code: "RESPOSTA_IA_INCOMPLETA",
          error:
            "A IA nao conseguiu concluir o plano conversacional. Nenhum fluxo incompleto foi criado e nenhum token foi debitado.",
        },
        { status: 422 }
      );
    }
  );
}
