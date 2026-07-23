import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import {
  prepararPayloadAssistente,
  type ContextoAssistenteFluxos,
} from "./route-contexto-ia";
import { registrarDiagnosticoIa } from "./route-diagnostico-ia";
import { completarRespostaPlano } from "./route-completar-estrutura";
import {
  extrairTextoSaida,
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
const MAX_TENTATIVAS_CORRECAO_IA = 2;

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
      const payloadPlanejamento = criarPayloadPlanejamento({ body, contexto });
      await registrarDiagnosticoIa({
        contexto,
        fase: "planejamento_request",
        payload: payloadPlanejamento,
      });

      respostaPlanejamento = await criarOriginal.call(
        this,
        payloadPlanejamento,
        opcoesComPrazo(options, prazoFinal)
      );
      requisitos = extrairRequisitosNormalizados(respostaPlanejamento);

      await registrarDiagnosticoIa({
        contexto,
        fase: "planejamento_response",
        resposta: respostaPlanejamento,
        metadados: {
          requisitos_extraidos: requisitos,
          requisitos_validos: Boolean(requisitos),
        },
      });

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

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_request",
      payload: primeiroPayload,
      metadados: {
        planejamento_aplicado: Boolean(requisitos),
      },
    });

    const respostaBruta = await criarOriginal.call(
      this,
      primeiroPayload,
      opcoesComPrazo(options, prazoFinal)
    );

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_response_bruta",
      resposta: respostaBruta,
    });

    let respostaPlano = repararECompletar(respostaBruta, contexto);

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_response_normalizada",
      resposta: respostaPlano,
    });

    let validacao = validarQualidadePlano(respostaPlano, contexto);

    await registrarDiagnosticoIa({
      contexto,
      fase: "validacao_pre_compilador",
      resposta: respostaPlano,
      problemas: validacao.problemas,
      metadados: {
        valido: validacao.valido,
        reparaveis: problemasReparaveisPeloCompilador(validacao.problemas),
      },
    });

    for (
      let tentativa = 1;
      !validacao.valido && tentativa <= MAX_TENTATIVAS_CORRECAO_IA;
      tentativa += 1
    ) {
      const rascunhoAnterior = extrairTextoSaida(respostaPlano);
      const payloadCorrecao = prepararPayloadAssistente({
        body: bodyPlanejado,
        limite: LIMITE_SAIDA_ASSISTENTE,
        repetir: true,
        problemas: validacao.problemas,
        rascunhoAnterior,
        fase: "estrutura",
        contexto,
      });

      await registrarDiagnosticoIa({
        contexto,
        fase: `correcao_ia_request_${tentativa}`,
        payload: payloadCorrecao,
        problemas: validacao.problemas,
        metadados: {
          tentativa,
          estrategia: "ia_reconstroi_grafo_com_refs_congeladas",
        },
      });

      const respostaCorrigidaBruta = await criarOriginal.call(
        this,
        payloadCorrecao,
        opcoesComPrazo(options, prazoFinal)
      );

      await registrarDiagnosticoIa({
        contexto,
        fase: `correcao_ia_response_bruta_${tentativa}`,
        resposta: respostaCorrigidaBruta,
        metadados: { tentativa },
      });

      const respostaCorrigida = repararECompletar(
        respostaCorrigidaBruta,
        contexto
      );
      respostaPlano = somarUsoRespostas(respostaPlano, respostaCorrigida);
      validacao = validarQualidadePlano(respostaPlano, contexto);

      await registrarDiagnosticoIa({
        contexto,
        fase: `correcao_ia_validacao_${tentativa}`,
        resposta: respostaPlano,
        problemas: validacao.problemas,
        metadados: {
          tentativa,
          valido: validacao.valido,
        },
      });
    }

    if (respostaPlanejamento) {
      respostaPlano = somarUsoRespostas(
        respostaPlanejamento,
        respostaPlano
      );
    }

    if (!validacao.valido) {
      console.warn("[assistente-fluxos] IA nao eliminou todas as inconsistencias estruturais", {
        response_id: respostaPlano.id || null,
        problemas: validacao.problemas,
      });
    }

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

      await registrarDiagnosticoIa({
        contexto: contextoRequisicao.contexto,
        fase: "erro_final_rota",
        problemas: mensagem ? [mensagem] : [],
        metadados: {
          status_http: response.status,
          corpo,
        },
      });

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
