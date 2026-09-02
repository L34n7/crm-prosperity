import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import { processarMensagemRecebidaRotinas } from "@/lib/rotinas-automacao/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { interceptarMensagemAgenteIa } from "@/lib/agentes-ia/runtime";
import {
  executarNo as executarNoCore,
  processAutomationEngine as processAutomationEngineAgenda,
  processarFilaProcessamentoAutoPorId as processarFilaProcessamentoAutoPorIdBase,
  processarTimeoutSemRespostaAgendado as processarTimeoutSemRespostaAgendadoBase,
} from "./process-automation-engine-agenda";
import { continuarConsultasEstoqueAutomacao } from "./process-automation-engine-estoque-runtime";
import {
  continuarCheckoutPagamentoAutomacao,
  interceptarMensagemCheckoutPendente,
} from "./process-automation-engine-checkout-runtime";
import { processarIntencoesMensagem } from "./intencoes-runtime";
import {
  acordarArbitragensHibridasPendentes,
  deferirMensagemSeFluxoRodando,
  processarJobArbitragemHibrida,
} from "./arbitragem-hibrida-fila";

export * from "./process-automation-engine-agenda";

const supabaseAdmin = getSupabaseAdmin();

const TOLERANCIA_ORDEM_MENSAGEM_MS = 5_000;
const ATRASO_MAXIMO_MENSAGEM_AUTOMACAO_PADRAO_SEGUNDOS = 5 * 60;

type AutomationEngineInput = Parameters<typeof processAutomationEngineAgenda>[0];
type TimeoutSemRespostaParams = Parameters<
  typeof processarTimeoutSemRespostaAgendadoBase
>[0];

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

async function continuarNosEspeciaisDepoisDoMotor(params: {
  empresaId: string;
  conversaId: string;
  numeroDestino?: string | null;
  mensagemTexto?: string;
  execucaoId?: string | null;
}) {
  const comum = {
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    numeroDestino: String(params.numeroDestino || ""),
    execucaoId: params.execucaoId,
  };

  await continuarConsultasEstoqueAutomacao({
    ...comum,
    mensagemTexto: params.mensagemTexto,
  });

  await continuarCheckoutPagamentoAutomacao(comum);
}

async function acordarArbitragemDepoisDaExecucao(params: {
  empresaId: string;
  execucaoId?: string | null;
}) {
  const execucaoId = String(params.execucaoId || "").trim();
  if (!execucaoId) return;

  await acordarArbitragensHibridasPendentes({
    empresaId: params.empresaId,
    execucaoId,
  });
}

async function processarDepoisDasRotinas(
  input: AutomationEngineInput,
  opcoes?: { permitirDiferimento?: boolean }
) {
  if (opcoes?.permitirDiferimento !== false) {
    const resultadoDiferimento = await deferirMensagemSeFluxoRodando(input);
    if (resultadoDiferimento) return resultadoDiferimento;
  }

  const resultadoAgente = await interceptarMensagemAgenteIa(input);
  if (resultadoAgente) return resultadoAgente;

  const resultadoIntencoes = await processarIntencoesMensagem({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    contatoId: input.contatoId || null,
    mensagemId: input.mensagemId || null,
    mensagemTexto: input.mensagemTexto || "",
    mensagemTipo: input.mensagemTipo || null,
    numeroDestino: input.numeroDestino || null,
  });

  if (resultadoIntencoes?.interrompeuFluxo || resultadoIntencoes?.somenteIntencao) {
    return {
      ok: true,
      status: resultadoIntencoes.interrompeuFluxo
        ? "intencao_interrompeu_fluxo"
        : "intencao_processada",
      execucaoId: resultadoIntencoes.execucaoId,
      intencoesExecutadas: resultadoIntencoes.intencoesExecutadas,
    };
  }

  const inputPrincipal: AutomationEngineInput =
    resultadoIntencoes?.mensagemFluxo &&
    resultadoIntencoes.mensagemFluxo !== String(input.mensagemTexto || "")
      ? { ...input, mensagemTexto: resultadoIntencoes.mensagemFluxo }
      : input;

  const resultadoPreferencia = await tentarPriorizarPreferenciaHorario(inputPrincipal);

  if (resultadoPreferencia) {
    await continuarNosEspeciaisDepoisDoMotor({
      empresaId: inputPrincipal.empresaId,
      conversaId: inputPrincipal.conversaId,
      numeroDestino: inputPrincipal.numeroDestino,
      mensagemTexto: inputPrincipal.mensagemTexto,
      execucaoId: resultadoPreferencia.execucaoId,
    });

    await acordarArbitragemDepoisDaExecucao({
      empresaId: inputPrincipal.empresaId,
      execucaoId: resultadoPreferencia.execucaoId,
    });

    return resultadoPreferencia;
  }

  const resultado = await processAutomationEngineAgenda(inputPrincipal);
  const execucaoIdResultado =
    resultado && typeof resultado === "object" && "execucaoId" in resultado
      ? String(resultado.execucaoId || "") || null
      : null;

  await continuarNosEspeciaisDepoisDoMotor({
    empresaId: inputPrincipal.empresaId,
    conversaId: inputPrincipal.conversaId,
    numeroDestino: inputPrincipal.numeroDestino,
    mensagemTexto: inputPrincipal.mensagemTexto,
    execucaoId: execucaoIdResultado,
  });

  await acordarArbitragemDepoisDaExecucao({
    empresaId: inputPrincipal.empresaId,
    execucaoId: execucaoIdResultado,
  });

  return resultado;
}

export async function processAutomationEngine(input: AutomationEngineInput) {
  const resultadoTemporal = await ignorarMensagemTemporalmenteInvalida(input);
  if (resultadoTemporal) return resultadoTemporal;

  const checkoutPendente = await interceptarMensagemCheckoutPendente({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
  });
  if (checkoutPendente) return checkoutPendente;

  const resultadoRotinas = await processarMensagemRecebidaRotinas({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    contatoId: input.contatoId || null,
    mensagemId: input.mensagemId || null,
    mensagemTexto: input.mensagemTexto || "",
    mensagemTipo: input.mensagemTipo || null,
  });

  if (resultadoRotinas?.interromperFluxoAtual) {
    return {
      ok: !resultadoRotinas.erro,
      status: resultadoRotinas.erro
        ? "rotina_automacao_interrompeu_com_erro"
        : "rotina_automacao_interrompeu_fluxo",
      execucaoId: resultadoRotinas.execucaoIds[0] || undefined,
      error: resultadoRotinas.erro || undefined,
    };
  }

  return processarDepoisDasRotinas(input);
}

export async function processarFilaProcessamentoAutoPorId(jobId: string) {
  const resultadoArbitragem = await processarJobArbitragemHibrida({
    jobId,
    processar: async (inputReavaliado, contexto) => {
      if (contexto.fluxoAindaRodando) {
        const resultadoAgente = await interceptarMensagemAgenteIa(inputReavaliado);
        if (resultadoAgente) {
          return { acao: "concluir" as const, resultado: resultadoAgente };
        }
        return {
          acao: "adiar" as const,
          motivo: "fluxo_ainda_rodando_sem_agente_disponivel",
        };
      }

      const resultado = await processarDepoisDasRotinas(inputReavaliado, {
        permitirDiferimento: false,
      });
      return { acao: "concluir" as const, resultado };
    },
  });

  if (resultadoArbitragem) return resultadoArbitragem;

  const resultado = await processarFilaProcessamentoAutoPorIdBase(jobId);
  const { data: job } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("empresa_id, conversa_id, execucao_id, payload_json")
    .eq("id", jobId)
    .maybeSingle();

  if (job) {
    const payload = job.payload_json || {};
    await continuarNosEspeciaisDepoisDoMotor({
      empresaId: job.empresa_id,
      conversaId: job.conversa_id,
      numeroDestino: payload.numero_destino,
      execucaoId: job.execucao_id,
    });
    await acordarArbitragemDepoisDaExecucao({
      empresaId: job.empresa_id,
      execucaoId: job.execucao_id,
    });
  }

  return resultado;
}

export async function processarFilaProcessamentoAutoPendentes(limite = 50) {
  const { data: jobs, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("id")
    .eq("status", "pendente")
    .lte("executar_em", new Date().toISOString())
    .order("executar_em", { ascending: true })
    .limit(limite);

  if (error) {
    throw new Error(
      `Erro ao buscar fila de processamento da automação: ${error.message}`
    );
  }

  let processados = 0;
  let erros = 0;
  let ignorados = 0;

  for (const job of jobs || []) {
    try {
      const resultado = await processarFilaProcessamentoAutoPorId(job.id);
      const resumo = resultado as {
        processado?: unknown;
        ignorado?: unknown;
        cancelado?: unknown;
      };

      if (resumo?.processado) {
        processados += 1;
      } else if (resumo?.ignorado || resumo?.cancelado) {
        ignorados += 1;
      }
    } catch (errorJob) {
      erros += 1;
      console.error("[FILA AUTO] Erro no cron fallback:", {
        jobId: job.id,
        erro: errorJob,
      });
    }
  }

  return {
    encontrados: jobs?.length || 0,
    processados,
    ignorados,
    erros,
  };
}

export async function processarTimeoutSemRespostaAgendado(
  params: TimeoutSemRespostaParams
) {
  const resultado = await processarTimeoutSemRespostaAgendadoBase(params);

  const { data: agendamento } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("execucao_id, payload_json")
    .eq("id", params.agendamentoId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (agendamento) {
    const payload = agendamento.payload_json || {};
    const conversaId = String(payload.conversa_id || "").trim();

    if (conversaId) {
      await continuarNosEspeciaisDepoisDoMotor({
        empresaId: params.empresaId,
        conversaId,
        numeroDestino: payload.numero_destino,
        execucaoId: agendamento.execucao_id,
      });

      await acordarArbitragemDepoisDaExecucao({
        empresaId: params.empresaId,
        execucaoId: agendamento.execucao_id,
      });
    }
  }

  return resultado;
}
