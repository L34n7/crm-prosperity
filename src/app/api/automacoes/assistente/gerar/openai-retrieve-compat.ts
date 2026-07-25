import OpenAI from "openai";

import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
} from "@/lib/ia/tokens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

declare module "openai/resources/responses/responses" {
  interface Responses {
    retrieve(
      responseID: string,
      options: {
        timeout?: number;
        maxRetries?: number;
        signal?: AbortSignal;
      }
    ): Promise<unknown>;
  }
}

type ObjetoJson = Record<string, unknown>;
type OpcoesRequisicao = {
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: unknown;
  fetchOptions?: unknown;
};

type CriarOriginal = (
  this: unknown,
  body: Record<string, unknown>,
  options?: unknown
) => Promise<unknown>;

type RecuperarOriginal = (
  this: unknown,
  responseID: string,
  query?: unknown,
  options?: OpcoesRequisicao
) => Promise<unknown>;

type CriarCompat = CriarOriginal & {
  __crmOutputLimit?: boolean;
};

type RecuperarCompat = RecuperarOriginal & {
  __crmRetrieveCompat?: boolean;
};

type GlobalComPatch = typeof globalThis & {
  __crmBriefingIaDesativado?: boolean;
};

type JobConsumo = {
  id: string;
  empresa_id: string;
  usuario_id: string | null;
  fase: string;
  metadados_json: unknown;
};

const supabaseAdmin = getSupabaseAdmin();
const STATUS_TERMINAIS_COBRAVEIS = new Set([
  "failed",
  "incomplete",
  "cancelled",
]);
const FASE_REGISTRANDO_CONSUMO = "geracao_assincrona_registrando_consumo";
const FASES_RECONCILIAVEIS = [
  "geracao_assincrona_aguardando",
  "geracao_assincrona_falhou",
];
const INTERVALO_RECONCILIACAO_MS = 5 * 60_000;
const JANELA_RECONCILIACAO_MS = 20 * 60_000;

let ultimaReconciliacao = 0;
let reconciliacaoEmAndamento: Promise<void> | null = null;

const LIMITE_MINIMO_SAIDA_FLUXOS = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 32_000
  );
  if (!Number.isFinite(configurado)) return 32_000;
  return Math.max(32_000, Math.min(64_000, Math.floor(configurado)));
})();

process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS = String(
  LIMITE_MINIMO_SAIDA_FLUXOS
);

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function pareceOpcaoRequisicao(valor: unknown): valor is OpcoesRequisicao {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const item = valor as Record<string, unknown>;
  return (
    "timeout" in item ||
    "maxRetries" in item ||
    "signal" in item ||
    "headers" in item ||
    "fetchOptions" in item
  );
}

function urlRequisicao(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function requisicaoBriefingIa(input: RequestInfo | URL, init?: RequestInit) {
  if (
    !urlRequisicao(input).startsWith("https://api.openai.com/v1/responses") ||
    String(init?.method || "GET").toUpperCase() !== "POST" ||
    typeof init?.body !== "string"
  ) {
    return false;
  }

  try {
    const body = objeto(JSON.parse(init.body));
    const text = objeto(body.text);
    const format = objeto(text.format);
    return format.name === "briefing_estruturado_fluxo";
  } catch {
    return false;
  }
}

function instalarBypassBriefingIa() {
  const globalComPatch = globalThis as GlobalComPatch;
  if (globalComPatch.__crmBriefingIaDesativado) return;

  const fetchOriginal = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (requisicaoBriefingIa(input, init)) {
      return new Response(
        JSON.stringify({
          error: {
            code: "BRIEFING_IA_DESATIVADO",
            message:
              "BRIEFING_DESATIVADO_GERACAO_UNICA: o pedido sera enviado diretamente para a geracao principal.",
          },
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return fetchOriginal(input, init);
  };

  globalComPatch.__crmBriefingIaDesativado = true;
}

function requisicaoGeracaoFluxo(body: Record<string, unknown>) {
  const text = objeto(body.text);
  const format = objeto(text.format);
  const nomeSchema = String(format.name || "");
  const modelo = String(body.model || "");

  return (
    body.background === true &&
    nomeSchema === "plano_assistente_fluxos" &&
    modelo.startsWith("gpt-5.5")
  );
}

function respostaCompactaParaAuditoria(resposta: ObjetoJson) {
  return {
    id: resposta.id || null,
    status: resposta.status || null,
    model: resposta.model || null,
    usage: resposta.usage || null,
    error: resposta.error || null,
    incomplete_details: resposta.incomplete_details || null,
    max_output_tokens: resposta.max_output_tokens || null,
  };
}

async function usoJaRegistrado(responseID: string) {
  const { data, error } = await supabaseAdmin
    .from("ia_token_usos")
    .select("id")
    .eq("origem", "assistente_fluxos")
    .contains("metadata_json", { openai_response_id: responseID })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function buscarJobConsumo(responseID: string) {
  const { data, error } = await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .select("id, empresa_id, usuario_id, fase, metadados_json")
    .eq("response_id", responseID)
    .in("fase", FASES_RECONCILIAVEIS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data || null) as JobConsumo | null;
}

async function registrarConsumoRespostaTerminal(
  responseID: string,
  resultado: unknown
) {
  const resposta = objeto(resultado);
  const status = String(resposta.status || "");
  if (!STATUS_TERMINAIS_COBRAVEIS.has(status)) return;

  const uso = extrairUsoTokensIa(resposta.usage);
  if (uso.totalTokens <= 0) return;
  if (await usoJaRegistrado(responseID)) return;

  const job = await buscarJobConsumo(responseID);
  if (!job?.empresa_id) return;

  const metadadosAtuais = objeto(job.metadados_json);
  const agora = new Date().toISOString();
  const auditoriaResposta = respostaCompactaParaAuditoria(resposta);

  const { data: reservado, error: reservaError } = await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .update({
      fase: FASE_REGISTRANDO_CONSUMO,
      resposta_json: auditoriaResposta,
      metadados_json: {
        ...metadadosAtuais,
        openai_status: status,
        consumo_terminal_detectado_em: agora,
        tokens_terminal_total: uso.totalTokens,
        tokens_terminal_input: uso.inputTokens,
        tokens_terminal_output: uso.outputTokens,
      },
    })
    .eq("id", job.id)
    .in("fase", FASES_RECONCILIAVEIS)
    .select("id")
    .maybeSingle();

  if (reservaError) throw new Error(reservaError.message);
  if (!reservado?.id) return;

  try {
    if (await usoJaRegistrado(responseID)) return;

    const incompleto = objeto(resposta.incomplete_details);
    const erro = objeto(resposta.error);
    const modelo = String(
      resposta.model || metadadosAtuais.modelo || "gpt-5.5"
    );

    await registrarUsoTokensIa({
      empresaId: job.empresa_id,
      usuarioId: job.usuario_id,
      origem: "assistente_fluxos",
      modelo,
      uso,
      metadata: {
        etapa: "geracao_assincrona_terminal",
        openai_response_id: responseID,
        openai_status: status,
        motivo_incompleto: incompleto.reason || null,
        codigo_erro_openai: erro.code || null,
        fluxo_materializado: false,
        consumo_em_tentativa_falha: true,
      },
    });

    await supabaseAdmin
      .from("automacao_assistente_ia_diagnosticos")
      .update({
        fase: job.fase,
        resposta_json: auditoriaResposta,
        metadados_json: {
          ...metadadosAtuais,
          openai_status: status,
          tokens_registrados_em: new Date().toISOString(),
          tokens_registrados_total: uso.totalTokens,
          tokens_registrados_input: uso.inputTokens,
          tokens_registrados_output: uso.outputTokens,
          openai_response_id_consumo: responseID,
        },
      })
      .eq("id", job.id);
  } catch (error) {
    await supabaseAdmin
      .from("automacao_assistente_ia_diagnosticos")
      .update({
        fase: job.fase,
        resposta_json: auditoriaResposta,
        metadados_json: {
          ...metadadosAtuais,
          openai_status: status,
          erro_registro_consumo_em: new Date().toISOString(),
          erro_registro_consumo: error instanceof Error ? error.message : String(error),
        },
      })
      .eq("id", job.id);
    throw error;
  }
}

function normalizarRespostaIncompleta(resultado: unknown) {
  const resposta = objeto(resultado);
  const incompleto = objeto(resposta.incomplete_details);

  if (
    String(resposta.status || "") !== "incomplete" ||
    String(incompleto.reason || "") !== "max_output_tokens"
  ) {
    return resultado;
  }

  const uso = objeto(resposta.usage);
  const tokensSaida = Number(uso.output_tokens || 0);
  const detalheTokens =
    Number.isFinite(tokensSaida) && tokensSaida > 0
      ? ` A resposta consumiu ${tokensSaida.toLocaleString("pt-BR")} tokens de saída antes de ser interrompida.`
      : "";

  resposta.error = {
    ...objeto(resposta.error),
    code: "MAX_OUTPUT_TOKENS",
    message:
      `A estrutura solicitada excedeu o limite seguro de ${LIMITE_MINIMO_SAIDA_FLUXOS.toLocaleString("pt-BR")} tokens de saída.${detalheTokens} O consumo dessa tentativa foi registrado, mas nenhum fluxo incompleto foi salvo.`,
  };

  return resultado;
}

async function tratarRespostaRecuperada(responseID: string, resultado: unknown) {
  const normalizada = normalizarRespostaIncompleta(resultado);

  try {
    await registrarConsumoRespostaTerminal(responseID, normalizada);
  } catch (error) {
    console.error(
      "[assistente-fluxos] falha ao registrar consumo de resposta terminal",
      {
        responseID,
        erro: error instanceof Error ? error.message : String(error),
      }
    );
  }

  return normalizada;
}

export async function reconciliarConsumosIaPendentes() {
  if (!process.env.OPENAI_API_KEY) return;
  if (Date.now() - ultimaReconciliacao < INTERVALO_RECONCILIACAO_MS) return;
  if (reconciliacaoEmAndamento) return reconciliacaoEmAndamento;

  ultimaReconciliacao = Date.now();
  reconciliacaoEmAndamento = (async () => {
    const desde = new Date(Date.now() - JANELA_RECONCILIACAO_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("automacao_assistente_ia_diagnosticos")
      .select("response_id")
      .eq("fase", "geracao_assincrona_falhou")
      .not("response_id", "is", null)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) throw new Error(error.message);

    const responses = Array.from(
      new Set((data || []).map((item) => String(item.response_id || "")).filter(Boolean))
    );

    await Promise.allSettled(
      responses.map(async (responseID) => {
        if (await usoJaRegistrado(responseID)) return;
        const clienteReconciliacao = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        await clienteReconciliacao.responses.retrieve(responseID, {
          timeout: 8_000,
          maxRetries: 0,
          signal: AbortSignal.timeout(8_000),
        });
      })
    );
  })()
    .catch((error) => {
      console.warn(
        "[assistente-fluxos] reconciliacao de consumo nao concluida",
        error instanceof Error ? error.message : String(error)
      );
    })
    .finally(() => {
      reconciliacaoEmAndamento = null;
    });

  return reconciliacaoEmAndamento;
}

instalarBypassBriefingIa();

const cliente = new OpenAI({ apiKey: "compatibilidade-local" });
const prototipo = Object.getPrototypeOf(cliente.responses) as {
  create: CriarCompat;
  retrieve: RecuperarCompat;
};

const criarOriginal = prototipo.create;
if (!criarOriginal.__crmOutputLimit) {
  const criarCompativel: CriarCompat = function (
    this: unknown,
    body: Record<string, unknown>,
    options?: unknown
  ) {
    const bodyFinal = requisicaoGeracaoFluxo(body)
      ? {
          ...body,
          max_output_tokens: Math.max(
            Number(body.max_output_tokens || 0),
            LIMITE_MINIMO_SAIDA_FLUXOS
          ),
        }
      : body;

    return criarOriginal.call(this, bodyFinal, options);
  };

  Object.defineProperty(criarCompativel, "__crmOutputLimit", {
    value: true,
  });
  prototipo.create = criarCompativel;
}

const recuperarOriginal = prototipo.retrieve;
if (!recuperarOriginal.__crmRetrieveCompat) {
  const recuperarCompativel: RecuperarCompat = async function (
    this: unknown,
    responseID: string,
    query?: unknown,
    options?: OpcoesRequisicao
  ) {
    const resultado =
      options === undefined && pareceOpcaoRequisicao(query)
        ? await recuperarOriginal.call(this, responseID, undefined, query)
        : await recuperarOriginal.call(this, responseID, query, options);

    return tratarRespostaRecuperada(responseID, resultado);
  };

  Object.defineProperty(recuperarCompativel, "__crmRetrieveCompat", {
    value: true,
  });
  prototipo.retrieve = recuperarCompativel;
}
