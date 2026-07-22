import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import {
  prepararPayloadAssistente,
  type ContextoAssistenteFluxos,
} from "./route-contexto-ia";
import { completarRespostaPlano } from "./route-completar-estrutura";
import {
  extrairTextoSaida,
  repararRespostaPlano,
  somarUsoRespostas,
  substituirTextoSaida,
  validarQualidadePlano,
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

const contextoAssistenteFluxos = new AsyncLocalStorage<ContextoAssistenteFluxos>();
let sdkResilienteInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null = null;

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 16000
  );
  if (!Number.isFinite(configurado)) return 16000;
  return Math.max(6000, Math.min(24000, Math.floor(configurado)));
})();
const LIMITE_SAIDA_REPETICAO = Math.min(
  24000,
  Math.max(LIMITE_SAIDA_ASSISTENTE, 22000)
);
const LIMITE_SAIDA_REVISAO = LIMITE_SAIDA_REPETICAO;

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function jsonLegivel(resposta: RespostaOpenAI) {
  try {
    const valor = JSON.parse(extrairTextoSaida(resposta));
    return Boolean(valor && typeof valor === "object" && !Array.isArray(valor));
  } catch {
    return false;
  }
}

function repararECompletar(
  resposta: RespostaOpenAI,
  contexto: ContextoAssistenteFluxos
) {
  return completarRespostaPlano(repararRespostaPlano(resposta, contexto), contexto);
}

function escolherRascunhoMaisRecente(
  atual: RespostaOpenAI,
  anterior: RespostaOpenAI
) {
  return jsonLegivel(atual)
    ? extrairTextoSaida(atual)
    : extrairTextoSaida(anterior);
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

    const primeiroPayload = prepararPayloadAssistente({
      body,
      limite: LIMITE_SAIDA_ASSISTENTE,
      repetir: false,
      contexto,
    });
    const primeiraResposta = repararECompletar(
      await criarOriginal.call(this, primeiroPayload, options),
      contexto
    );
    const primeiraValidacao = validarQualidadePlano(primeiraResposta, contexto);

    if (primeiraValidacao.valido) return primeiraResposta;

    console.warn("[assistente-fluxos] repetindo plano incompleto", {
      response_id: primeiraResposta.id || null,
      problemas: primeiraValidacao.problemas,
      output_length: extrairTextoSaida(primeiraResposta).length,
      limite_inicial: LIMITE_SAIDA_ASSISTENTE,
      limite_repeticao: LIMITE_SAIDA_REPETICAO,
    });

    const segundoPayload = prepararPayloadAssistente({
      body,
      limite: LIMITE_SAIDA_REPETICAO,
      repetir: true,
      fase: "estrutura",
      problemas: primeiraValidacao.problemas,
      rascunhoAnterior: extrairTextoSaida(primeiraResposta),
      contexto,
    });
    const segundaResposta = await criarOriginal.call(
      this,
      segundoPayload,
      options
    );
    const segundaRespostaComUso = repararECompletar(
      somarUsoRespostas(primeiraResposta, segundaResposta),
      contexto
    );
    const segundaValidacao = validarQualidadePlano(
      segundaRespostaComUso,
      contexto
    );

    if (segundaValidacao.valido) return segundaRespostaComUso;

    console.warn("[assistente-fluxos] revisando plano ainda incompleto", {
      response_id: segundaRespostaComUso.id || null,
      problemas: segundaValidacao.problemas,
      json_legivel: jsonLegivel(segundaRespostaComUso),
    });

    const terceiroPayload = prepararPayloadAssistente({
      body,
      limite: LIMITE_SAIDA_REVISAO,
      repetir: true,
      fase: "revisao",
      problemas: segundaValidacao.problemas,
      rascunhoAnterior: escolherRascunhoMaisRecente(
        segundaRespostaComUso,
        primeiraResposta
      ),
      contexto,
    });
    const terceiraResposta = await criarOriginal.call(
      this,
      terceiroPayload,
      options
    );
    const respostaComUso = repararECompletar(
      somarUsoRespostas(segundaRespostaComUso, terceiraResposta),
      contexto
    );
    const terceiraValidacao = validarQualidadePlano(respostaComUso, contexto);

    if (!terceiraValidacao.valido) {
      console.error("[assistente-fluxos] plano incompleto apos revisao final", {
        response_id: respostaComUso.id || null,
        problemas: terceiraValidacao.problemas,
        json_legivel: jsonLegivel(respostaComUso),
      });

      // Nunca deixe uma revisao estruturalmente incompleta seguir
      // para o compilador. Invalidar o JSON faz a rota original interromper
      // antes da materializacao e antes do registro de consumo; executarAssistente
      // converte a falha em 422.
      substituirTextoSaida(respostaComUso, "{");
    }

    return respostaComUso;
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
            "A IA nao conseguiu concluir uma estrutura completa e valida apos as etapas de estrutura, correcao e revisao. Nenhum fluxo incompleto foi criado e nenhum token foi debitado.",
        },
        { status: 422 }
      );
    }
  );
}
