import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  executarNo as executarNoCore,
  processAutomationEngine as processAutomationEngineCore,
} from "./process-automation-engine-core";

export * from "./process-automation-engine-core";

const supabaseAdmin = getSupabaseAdmin();

type AutomationEngineInput = Parameters<typeof processAutomationEngineCore>[0];

function respostaEhEscolhaNumericaExplicita(mensagemTexto: string) {
  const texto = String(mensagemTexto || "").trim();

  if (!texto) return false;

  if (
    /^(?:(?:op(?:ç|c)[aã]o|opcao|n[uú]mero|numero|quero|escolho)\s*)?#?\d{1,2}\s*$/i.test(
      texto
    )
  ) {
    return true;
  }

  return /^\d{1,2}\s*(?:[-–—.)])\s*\d{1,2}:\d{2}\s*$/.test(texto);
}

function formatarDataIsoParaEntrada(dataIso: string) {
  const match = String(dataIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return "";

  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function tentarReprocessarPreferenciaHorario(
  input: AutomationEngineInput
) {
  const mensagemTexto = String(input.mensagemTexto || "").trim();

  if (!mensagemTexto || respostaEhEscolhaNumericaExplicita(mensagemTexto)) {
    return null;
  }

  const interpretacao = interpretarDataHorarioAgenda(
    mensagemTexto,
    "America/Sao_Paulo"
  );

  // Nova data continua sendo tratada normalmente pelo motor original.
  // Aqui cobrimos somente uma preferência de horário dentro do dia que já
  // estava sendo exibido (ex.: tarde, depois das 11, antes das 15).
  if (
    !interpretacao.preferencia ||
    interpretacao.data ||
    interpretacao.data_invalida_motivo
  ) {
    return null;
  }

  const numeroDestino = String(input.numeroDestino || "").trim();

  if (!numeroDestino) {
    return null;
  }

  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, no_atual_id, status, metadata_json")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError || !execucao?.no_atual_id) {
    return null;
  }

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

  if (!dataParaInterpretacao) {
    return null;
  }

  // Reexecuta somente a listagem do mesmo bloco, sem consumir tentativa
  // inválida e sem interpretar números de uma frase como índice da opção.
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
  const resultadoPreferencia = await tentarReprocessarPreferenciaHorario(input);

  if (resultadoPreferencia) {
    return resultadoPreferencia;
  }

  return processAutomationEngineCore(input);
}
