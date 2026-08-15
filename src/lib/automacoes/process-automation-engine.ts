import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  executarNo as executarNoCore,
  processAutomationEngine as processAutomationEngineAgenda,
} from "./process-automation-engine-agenda";

export * from "./process-automation-engine-agenda";

const supabaseAdmin = getSupabaseAdmin();

const TOLERANCIA_ORDEM_MENSAGEM_MS = 5_000;
const ATRASO_MAXIMO_MENSAGEM_AUTOMACAO_PADRAO_SEGUNDOS = 5 * 60;

type AutomationEngineInput = Parameters<typeof processAutomationEngineAgenda>[0];

function normalizarAtrasoMaximoMensagemAutomacaoMs() {
  const configurado = Number(
    process.env.WHATSAPP_AUTOMACAO_MAX_ATRASO_MENSAGEM_SEGUNDOS
  );

  const segundos = Number.isFinite(configurado)
    ? Math.min(24 * 60 * 60, Math.max(30, Math.floor(configurado)))
    : ATRASO_MAXIMO_MENSAGEM_AUTOMACAO_PADRAO_SEGUNDOS;

  return segundos * 1000;
}

function timestampMensagemParaMs(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = Number(valor);

  if (Number.isFinite(numero) && numero > 0) {
    const milissegundos = numero < 100_000_000_000 ? numero * 1000 : numero;
    const data = new Date(milissegundos);

    if (!Number.isNaN(data.getTime())) {
      return data.getTime();
    }
  }

  const data = new Date(String(valor));
  return Number.isNaN(data.getTime()) ? null : data.getTime();
}

async function ignorarMensagemTemporalmenteInvalida(
  input: AutomationEngineInput
) {
  const mensagemId = String(input.mensagemId || "").trim();

  // Chamadas internas do motor que não vieram de uma mensagem persistida
  // continuam com o comportamento atual.
  if (!mensagemId) return null;

  const { data: mensagem, error: mensagemError } = await supabaseAdmin
    .from("mensagens")
    .select("id, remetente_tipo, created_at, metadata_json")
    .eq("id", mensagemId)
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .maybeSingle();

  if (mensagemError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao validar temporalidade da mensagem:",
      mensagemError
    );
    return null;
  }

  if (!mensagem || mensagem.remetente_tipo !== "contato") {
    return null;
  }

  const metadata = mensagem.metadata_json || {};
  const timestampOriginal =
    metadata.timestamp_original_whatsapp ??
    metadata.timestamp_whatsapp ??
    mensagem.created_at;
  const timestampMensagemMs = timestampMensagemParaMs(timestampOriginal);

  if (timestampMensagemMs == null) {
    return null;
  }

  const agoraMs = Date.now();
  const atrasoMs = Math.max(0, agoraMs - timestampMensagemMs);
  const atrasoMaximoMs = normalizarAtrasoMaximoMensagemAutomacaoMs();

  const { data: execucaoAtiva, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, started_at, created_at")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao validar ordem temporal da execução:",
      execucaoError
    );
    return null;
  }

  const inicioExecucaoMs = execucaoAtiva
    ? timestampMensagemParaMs(execucaoAtiva.started_at || execucaoAtiva.created_at)
    : null;
  const mensagemAnteriorExecucao =
    inicioExecucaoMs != null &&
    timestampMensagemMs + TOLERANCIA_ORDEM_MENSAGEM_MS < inicioExecucaoMs;
  const mensagemEntregueComAtraso = atrasoMs > atrasoMaximoMs;

  if (!mensagemAnteriorExecucao && !mensagemEntregueComAtraso) {
    return null;
  }

  const motivo = mensagemAnteriorExecucao
    ? "mensagem_anterior_execucao_ativa"
    : "mensagem_entregue_com_atraso";

  console.warn("[AUTOMATION_ENGINE] Mensagem ignorada por temporalidade", {
    mensagemId,
    conversaId: input.conversaId,
    execucaoId: execucaoAtiva?.id || null,
    motivo,
    timestampMensagem: new Date(timestampMensagemMs).toISOString(),
    inicioExecucao:
      inicioExecucaoMs != null ? new Date(inicioExecucaoMs).toISOString() : null,
    atrasoSegundos: Math.floor(atrasoMs / 1000),
    atrasoMaximoSegundos: Math.floor(atrasoMaximoMs / 1000),
  });

  return {
    ok: true,
    status: "ignorado_mensagem_atrasada",
    motivo,
    mensagemId,
    execucaoId: execucaoAtiva?.id || null,
    timestampMensagem: new Date(timestampMensagemMs).toISOString(),
    inicioExecucao:
      inicioExecucaoMs != null ? new Date(inicioExecucaoMs).toISOString() : null,
    atrasoSegundos: Math.floor(atrasoMs / 1000),
  };
}

function formatarDataIsoParaEntrada(dataIso: string) {
  const match = String(dataIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return "";

  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function tentarPriorizarPreferenciaHorario(input: AutomationEngineInput) {
  const mensagemTexto = String(input.mensagemTexto || "").trim();

  if (!mensagemTexto) return null;

  const interpretacao = interpretarDataHorarioAgenda(
    mensagemTexto,
    "America/Sao_Paulo"
  );
  const preferencia = interpretacao.preferencia;

  // Expressões completas têm prioridade sobre o horário isolado contido nelas.
  // Ex.: "depois das 16hr" não pode virar "às 16:00".
  if (
    !preferencia ||
    preferencia.tipo === "exato" ||
    interpretacao.data ||
    interpretacao.data_invalida_motivo
  ) {
    return null;
  }

  const numeroDestino = String(input.numeroDestino || "").trim();
  if (!numeroDestino) return null;

  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, no_atual_id, status, metadata_json")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError || !execucao?.no_atual_id) return null;

  const noAtualId = String(execucao.no_atual_id);
  const metadata = execucao.metadata_json || {};
  const estadoAgenda = metadata.agenda_estado?.[noAtualId] || {};
  const dataEscolhida = String(estadoAgenda.data_escolhida || "").trim();

  if (
    estadoAgenda.etapa !== "aguardando_horario" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dataEscolhida)
  ) {
    return null;
  }

  const { data: noAtual, error: noError } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("id", noAtualId)
    .eq("empresa_id", input.empresaId)
    .eq("fluxo_id", execucao.fluxo_id)
    .eq("ativo", true)
    .maybeSingle();

  if (noError || !noAtual || noAtual.tipo_no !== "agenda_escolher_horario") {
    return null;
  }

  const dataParaInterpretacao = formatarDataIsoParaEntrada(dataEscolhida);
  if (!dataParaInterpretacao) return null;

  await executarNoCore({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    execucaoId: execucao.id,
    fluxoId: execucao.fluxo_id,
    no: noAtual,
    mensagemTexto: `${mensagemTexto}\n${dataParaInterpretacao}`,
    numeroDestino,
    retomadaDelayAgendado: true,
  });

  return {
    ok: true,
    status: "agenda_aguardando_escolha_horario",
    execucaoId: execucao.id,
  };
}

export async function processAutomationEngine(input: AutomationEngineInput) {
  const resultadoTemporal = await ignorarMensagemTemporalmenteInvalida(input);

  if (resultadoTemporal) {
    return resultadoTemporal;
  }

  const resultadoPreferencia = await tentarPriorizarPreferenciaHorario(input);

  if (resultadoPreferencia) {
    return resultadoPreferencia;
  }

  return processAutomationEngineAgenda(input);
}
