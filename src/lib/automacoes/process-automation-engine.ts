import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  executarNo as executarNoCore,
  processAutomationEngine as processAutomationEngineAgenda,
} from "./process-automation-engine-agenda";

export * from "./process-automation-engine-agenda";

const supabaseAdmin = getSupabaseAdmin();

type AutomationEngineInput = Parameters<typeof processAutomationEngineAgenda>[0];

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
  const resultadoPreferencia = await tentarPriorizarPreferenciaHorario(input);

  if (resultadoPreferencia) {
    return resultadoPreferencia;
  }

  return processAutomationEngineAgenda(input);
}
