import { Client as QstashClient } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  calcularProximaAberturaFluxo,
  fluxoEstaDentroHorarioAtendimento,
  fluxoPermiteIntegracaoWhatsapp,
  obterHorarioAtendimentoFluxo,
} from "@/lib/automacoes/normalizar-configuracao-fluxo";
import { gatilhoCombinaComMensagem } from "./match-trigger";
import type { AutomacaoGatilho, AutomationEngineInput } from "./types";

const supabaseAdmin = getSupabaseAdmin();
const TIPO_AGENDAMENTO_HORARIO_FLUXO = "horario_fluxo";

function appUrl() {
  const host =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";

  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function workerFilaUrl() {
  return (
    process.env.QSTASH_FILA_AUTOMACAO_WORKER_URL?.trim() ||
    process.env.QSTASH_AUTOMACAO_WORKER_URL?.trim() ||
    (appUrl() ? `${appUrl()}/api/worker/processar-fila-automacao` : "")
  );
}

async function publicarJobFilaAutomacaoQstash(jobId: string, delayMs: number) {
  const token = process.env.QSTASH_TOKEN?.trim();
  const url = workerFilaUrl();

  if (!token || !url) return false;

  try {
    const client = new QstashClient({ token });
    await client.publishJSON({
      url,
      body: { jobId },
      delay: Math.max(1, Math.ceil(delayMs / 1000)),
      retries: 3,
    });
    return true;
  } catch (error) {
    console.error("[HORARIO_FLUXO] Falha ao publicar job no QStash:", error);
    return false;
  }
}

async function carregarFluxo(fluxoId: string, empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, fluxo_padrao, configuracao_json, status, created_at")
    .eq("id", fluxoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function resolverFluxoDaMensagem(input: AutomationEngineInput) {
  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, status, created_at")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .in("status", ["rodando", "aguardando"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (execucaoError) throw new Error(execucaoError.message);

  if (execucao?.fluxo_id) {
    const fluxo = await carregarFluxo(execucao.fluxo_id, input.empresaId);
    if (fluxo) {
      return { fluxo, execucaoId: execucao.id as string };
    }
  }

  const { data: fluxos, error: fluxosError } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, fluxo_padrao, configuracao_json, status, created_at")
    .eq("empresa_id", input.empresaId)
    .eq("status", "ativo")
    .eq("canal", "whatsapp")
    .order("created_at", { ascending: true });

  if (fluxosError) throw new Error(fluxosError.message);

  const elegiveis = (fluxos || []).filter((fluxo) =>
    fluxoPermiteIntegracaoWhatsapp(
      fluxo.configuracao_json,
      input.integracaoWhatsappId
    )
  );

  if (!elegiveis.length) return null;

  const ids = elegiveis.map((fluxo) => fluxo.id);
  const { data: gatilhos, error: gatilhosError } = await supabaseAdmin
    .from("automacao_gatilhos")
    .select("*")
    .eq("empresa_id", input.empresaId)
    .eq("ativo", true)
    .in("fluxo_id", ids);

  if (gatilhosError) throw new Error(gatilhosError.message);

  const gatilho = (gatilhos || []).find((item) =>
    gatilhoCombinaComMensagem(
      item as AutomacaoGatilho,
      String(input.mensagemTexto || "")
    )
  );

  const fluxo = gatilho
    ? elegiveis.find((item) => item.id === gatilho.fluxo_id)
    : elegiveis.find((item) => item.fluxo_padrao === true);

  return fluxo ? { fluxo, execucaoId: null } : null;
}

async function cancelarTemporizadoresDaExecucao(execucaoId: string, empresaId: string) {
  await supabaseAdmin
    .from("automacao_agendamentos")
    .update({ status: "cancelado", executed_at: new Date().toISOString() })
    .eq("empresa_id", empresaId)
    .eq("execucao_id", execucaoId)
    .eq("status", "pendente")
    .in("tipo_agendamento", [
      "timeout_sem_resposta",
      "encerramento_inatividade_fluxo",
    ]);
}

export async function interceptarMensagemForaHorarioFluxo(
  input: AutomationEngineInput
) {
  const mensagemId = String(input.mensagemId || "").trim();
  if (!mensagemId) return null;

  const resolucao = await resolverFluxoDaMensagem(input);
  if (!resolucao) return null;

  const configuracao = resolucao.fluxo.configuracao_json || {};
  const horario = obterHorarioAtendimentoFluxo(configuracao);

  if (!horario.ativo || fluxoEstaDentroHorarioAtendimento(configuracao)) {
    return null;
  }

  const proximaAbertura = calcularProximaAberturaFluxo(configuracao);
  if (!proximaAbertura) {
    console.warn("[HORARIO_FLUXO] Fluxo ativo sem próxima abertura válida", {
      empresaId: input.empresaId,
      fluxoId: resolucao.fluxo.id,
    });
    return null;
  }

  const { data: existente } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, executar_em")
    .eq("empresa_id", input.empresaId)
    .eq("tipo_agendamento", TIPO_AGENDAMENTO_HORARIO_FLUXO)
    .eq("status", "pendente")
    .contains("payload_json", { mensagem_id: mensagemId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) {
    return {
      ok: true,
      status: "fluxo_agendado_horario",
      fluxoId: resolucao.fluxo.id,
      agendamentoId: existente.id,
      processarEm: existente.executar_em,
    };
  }

  if (resolucao.execucaoId) {
    await cancelarTemporizadoresDaExecucao(
      resolucao.execucaoId,
      input.empresaId
    );
  }

  const agoraIso = new Date().toISOString();
  const { data: agendamento, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .insert({
      empresa_id: input.empresaId,
      execucao_id: resolucao.execucaoId,
      fluxo_id: resolucao.fluxo.id,
      no_id: null,
      tipo_agendamento: TIPO_AGENDAMENTO_HORARIO_FLUXO,
      executar_em: proximaAbertura.toISOString(),
      status: "pendente",
      payload_json: {
        input,
        conversa_id: input.conversaId,
        mensagem_id: mensagemId,
        fluxo_id: resolucao.fluxo.id,
        agendado_em: agoraIso,
        processar_em: proximaAbertura.toISOString(),
      },
    })
    .select("id, executar_em")
    .single();

  if (error) throw new Error(error.message);

  await publicarJobFilaAutomacaoQstash(
    agendamento.id,
    Math.max(1_000, proximaAbertura.getTime() - Date.now())
  );

  return {
    ok: true,
    status: "fluxo_agendado_horario",
    fluxoId: resolucao.fluxo.id,
    agendamentoId: agendamento.id,
    processarEm: agendamento.executar_em,
  };
}

type PreparacaoAgendamentoHorario =
  | { encontrado: false }
  | {
      encontrado: true;
      pronto: false;
      resultado: Record<string, unknown>;
    }
  | {
      encontrado: true;
      pronto: true;
      agendamentoId: string;
      input: AutomationEngineInput;
    };

export async function prepararAgendamentoHorarioFluxo(
  agendamentoId: string
): Promise<PreparacaoAgendamentoHorario> {
  const { data: original, error: originalError } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("*")
    .eq("id", agendamentoId)
    .eq("tipo_agendamento", TIPO_AGENDAMENTO_HORARIO_FLUXO)
    .maybeSingle();

  if (originalError) throw new Error(originalError.message);
  if (!original) return { encontrado: false };

  if (original.status !== "pendente") {
    return {
      encontrado: true,
      pronto: false,
      resultado: {
        ok: true,
        processado: original.status === "executado",
        ignorado: true,
        motivo: "agendamento_ja_resolvido",
        status: original.status,
      },
    };
  }

  if (new Date(original.executar_em).getTime() > Date.now() + 1_000) {
    return {
      encontrado: true,
      pronto: false,
      resultado: {
        ok: true,
        processado: false,
        ignorado: true,
        motivo: "agendamento_ainda_nao_venceu",
      },
    };
  }

  const { data: travado, error: lockError } = await supabaseAdmin
    .from("automacao_agendamentos")
    .update({ status: "executando", locked_at: new Date().toISOString() })
    .eq("id", agendamentoId)
    .eq("status", "pendente")
    .select("*")
    .maybeSingle();

  if (lockError) throw new Error(lockError.message);
  if (!travado) {
    return {
      encontrado: true,
      pronto: false,
      resultado: {
        ok: true,
        processado: false,
        ignorado: true,
        motivo: "agendamento_travado_por_outro_worker",
      },
    };
  }

  const payload = (travado.payload_json || {}) as Record<string, unknown>;
  const input = payload.input as AutomationEngineInput | undefined;

  if (!input?.empresaId || !input?.conversaId) {
    await supabaseAdmin
      .from("automacao_agendamentos")
      .update({ status: "erro", executed_at: new Date().toISOString() })
      .eq("id", agendamentoId);

    return {
      encontrado: true,
      pronto: false,
      resultado: {
        ok: true,
        processado: false,
        ignorado: true,
        motivo: "payload_horario_fluxo_invalido",
      },
    };
  }

  const fluxo = travado.fluxo_id
    ? await carregarFluxo(travado.fluxo_id, travado.empresa_id)
    : null;

  if (fluxo?.configuracao_json) {
    const horarioAtual = obterHorarioAtendimentoFluxo(fluxo.configuracao_json);
    if (
      horarioAtual.ativo &&
      !fluxoEstaDentroHorarioAtendimento(fluxo.configuracao_json)
    ) {
      const proxima = calcularProximaAberturaFluxo(fluxo.configuracao_json);
      if (proxima) {
        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "pendente",
            executar_em: proxima.toISOString(),
            locked_at: null,
            payload_json: {
              ...payload,
              processar_em: proxima.toISOString(),
              reagendado_em: new Date().toISOString(),
            },
          })
          .eq("id", agendamentoId)
          .eq("status", "executando");

        await publicarJobFilaAutomacaoQstash(
          agendamentoId,
          Math.max(1_000, proxima.getTime() - Date.now())
        );

        return {
          encontrado: true,
          pronto: false,
          resultado: {
            ok: true,
            processado: false,
            ignorado: true,
            motivo: "fora_horario_reagendado",
            processarEm: proxima.toISOString(),
          },
        };
      }
    }
  }

  const mensagemId = String(payload.mensagem_id || input.mensagemId || "").trim();
  if (mensagemId) {
    const { data: entrada } = await supabaseAdmin
      .from("mensagens")
      .select("created_at")
      .eq("id", mensagemId)
      .eq("empresa_id", input.empresaId)
      .eq("conversa_id", input.conversaId)
      .maybeSingle();

    if (entrada?.created_at) {
      const { data: resposta } = await supabaseAdmin
        .from("mensagens")
        .select("id")
        .eq("empresa_id", input.empresaId)
        .eq("conversa_id", input.conversaId)
        .in("remetente_tipo", ["usuario", "bot"])
        .gt("created_at", entrada.created_at)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (resposta) {
        await supabaseAdmin
          .from("automacao_agendamentos")
          .update({
            status: "cancelado",
            locked_at: null,
            executed_at: new Date().toISOString(),
            payload_json: {
              ...payload,
              cancelado_motivo: "conversa_ja_respondida",
            },
          })
          .eq("id", agendamentoId);

        return {
          encontrado: true,
          pronto: false,
          resultado: {
            ok: true,
            processado: false,
            cancelado: true,
            motivo: "conversa_ja_respondida",
          },
        };
      }
    }
  }

  return {
    encontrado: true,
    pronto: true,
    agendamentoId,
    input,
  };
}

export async function finalizarAgendamentoHorarioFluxo(
  agendamentoId: string,
  sucesso: boolean,
  erro?: unknown
) {
  if (sucesso) {
    await supabaseAdmin
      .from("automacao_agendamentos")
      .update({
        status: "executado",
        locked_at: null,
        executed_at: new Date().toISOString(),
      })
      .eq("id", agendamentoId)
      .eq("status", "executando");
    return;
  }

  const executarEm = new Date(Date.now() + 60_000);
  const { data: atual } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("payload_json")
    .eq("id", agendamentoId)
    .maybeSingle();

  await supabaseAdmin
    .from("automacao_agendamentos")
    .update({
      status: "pendente",
      locked_at: null,
      executar_em: executarEm.toISOString(),
      payload_json: {
        ...(atual?.payload_json || {}),
        ultimo_erro: erro instanceof Error ? erro.message : String(erro || "erro"),
      },
    })
    .eq("id", agendamentoId)
    .eq("status", "executando");

  await publicarJobFilaAutomacaoQstash(agendamentoId, 60_000);
}

export async function reagendarFilaProcessamentoAutoSeForaHorario(jobId: string) {
  const { data: job, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("id, empresa_id, fluxo_id, status, executar_em")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!job || job.status !== "pendente" || !job.fluxo_id) return null;

  const fluxo = await carregarFluxo(job.fluxo_id, job.empresa_id);
  if (!fluxo?.configuracao_json) return null;

  const horario = obterHorarioAtendimentoFluxo(fluxo.configuracao_json);
  if (!horario.ativo || fluxoEstaDentroHorarioAtendimento(fluxo.configuracao_json)) {
    return null;
  }

  const proxima = calcularProximaAberturaFluxo(fluxo.configuracao_json);
  if (!proxima) return null;

  await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      executar_em: proxima.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pendente");

  await publicarJobFilaAutomacaoQstash(
    jobId,
    Math.max(1_000, proxima.getTime() - Date.now())
  );

  return {
    ok: true,
    processado: false,
    ignorado: true,
    motivo: "fila_fluxo_fora_horario_reagendada",
    processarEm: proxima.toISOString(),
  };
}

export async function reagendarTimeoutSemRespostaSeForaHorario(params: {
  empresaId: string;
  agendamentoId: string;
}) {
  const { data: agendamento, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, empresa_id, fluxo_id, status, tipo_agendamento")
    .eq("id", params.agendamentoId)
    .eq("empresa_id", params.empresaId)
    .eq("tipo_agendamento", "timeout_sem_resposta")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!agendamento || agendamento.status !== "pendente" || !agendamento.fluxo_id) {
    return null;
  }

  const fluxo = await carregarFluxo(agendamento.fluxo_id, params.empresaId);
  if (!fluxo?.configuracao_json) return null;

  const horario = obterHorarioAtendimentoFluxo(fluxo.configuracao_json);
  if (!horario.ativo || fluxoEstaDentroHorarioAtendimento(fluxo.configuracao_json)) {
    return null;
  }

  const proxima = calcularProximaAberturaFluxo(fluxo.configuracao_json);
  if (!proxima) return null;

  await supabaseAdmin
    .from("automacao_agendamentos")
    .update({ executar_em: proxima.toISOString(), locked_at: null })
    .eq("id", params.agendamentoId)
    .eq("status", "pendente");

  await publicarJobFilaAutomacaoQstash(
    params.agendamentoId,
    Math.max(1_000, proxima.getTime() - Date.now())
  );

  return {
    ok: true,
    processado: false,
    ignorado: true,
    motivo: "timeout_fora_horario_reagendado",
    processarEm: proxima.toISOString(),
  };
}

export async function obterTimeoutSemRespostaPorId(jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, empresa_id, tipo_agendamento, status")
    .eq("id", jobId)
    .eq("tipo_agendamento", "timeout_sem_resposta")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function listarAgendamentosHorarioFluxoVencidos(limite = 50) {
  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id")
    .eq("tipo_agendamento", TIPO_AGENDAMENTO_HORARIO_FLUXO)
    .eq("status", "pendente")
    .lte("executar_em", new Date().toISOString())
    .order("executar_em", { ascending: true })
    .limit(limite);

  if (error) throw new Error(error.message);
  return data || [];
}
