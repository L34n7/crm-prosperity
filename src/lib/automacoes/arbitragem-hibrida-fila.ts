import { Client as QstashClient } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEngineInput } from "./types";

const supabaseAdmin = getSupabaseAdmin();
const TIPO_JOB_ARBITRAGEM_HIBRIDA = "arbitragem_hibrida";
const JANELA_FLUXO_EM_EXECUCAO_PADRAO_MS = 15_000;

type JobArbitragemHibrida = {
  id: string;
  empresa_id: string;
  execucao_id: string;
  fluxo_id: string;
  conversa_id: string;
  no_id: string;
  tipo_job: string;
  status: string;
  executar_em: string;
  payload_json: Record<string, unknown> | null;
  idempotency_key: string;
  tentativas: number | null;
  created_at: string;
};

type ResultadoProcessamentoCallback =
  | {
      acao: "concluir";
      resultado: unknown;
    }
  | {
      acao: "adiar";
      delayMs?: number;
      motivo?: string;
    };

type ContextoReavaliacao = {
  fluxoAindaRodando: boolean;
  tentativas: number;
};

type SaidaFluxoAposMensagem = {
  id: string;
  created_at: string;
  automacao_no_id?: string | null;
};

function inteiroAmbiente(
  valor: string | undefined,
  fallback: number,
  minimo: number,
  maximo: number
) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

function janelaFluxoEmExecucaoMs() {
  return inteiroAmbiente(
    process.env.AUTOMACAO_ARBITRAGEM_JANELA_RODANDO_MS,
    JANELA_FLUXO_EM_EXECUCAO_PADRAO_MS,
    3_000,
    60_000
  );
}

function urlWorkerFilaAutomacao() {
  const configurada =
    process.env.QSTASH_AUTOMACAO_WORKER_URL ||
    process.env.AUTOMACAO_QSTASH_WORKER_URL;

  if (configurada) return configurada;

  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (!host) return "";

  const base = host.startsWith("http") ? host : `https://${host}`;
  return `${base.replace(/\/$/, "")}/api/worker/processar-fila-automacao`;
}

async function publicarJobQstash(jobId: string, delayMs: number) {
  const token = process.env.QSTASH_TOKEN;
  const url = urlWorkerFilaAutomacao();

  if (!token || !url) {
    console.warn(
      "[ARBITRAGEM HIBRIDA] QStash indisponivel; arbitragem aguardara novo evento de estado.",
      { jobId }
    );
    return null;
  }

  try {
    const cliente = new QstashClient({ token });
    const resultado = await cliente.publishJSON({
      url,
      body: { jobId },
      delay: Math.max(1, Math.ceil(delayMs / 1000)),
      retries: 3,
    });
    const messageId =
      resultado && typeof resultado === "object" && "messageId" in resultado
        ? String(resultado.messageId || "").trim() || null
        : null;

    await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        qstash_message_id: messageId,
        qstash_publicado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return messageId;
  } catch (error) {
    console.error("[ARBITRAGEM HIBRIDA] Falha ao publicar reavaliacao no QStash:", {
      jobId,
      error,
    });
    return null;
  }
}

function tipoMensagemValido(
  valor: unknown
): AutomationEngineInput["mensagemTipo"] {
  const tipo = String(valor || "").trim().toLowerCase();
  if (["texto", "imagem", "documento", "audio", "video"].includes(tipo)) {
    return tipo as AutomationEngineInput["mensagemTipo"];
  }
  return undefined;
}

async function execucaoRodandoDaConversa(input: AutomationEngineInput) {
  const { data, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, no_atual_id, status")
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .eq("status", "rodando")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[ARBITRAGEM HIBRIDA] Erro ao verificar execucao rodando:",
      error
    );
    return null;
  }

  return data || null;
}

async function execucaoEstaEstacionadaEmJobLongo(params: {
  empresaId: string;
  execucaoId: string;
  noId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("tipo_job, executar_em")
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", params.execucaoId)
    .eq("no_id", params.noId)
    .in("status", ["pendente", "executando"])
    .neq("tipo_job", TIPO_JOB_ARBITRAGEM_HIBRIDA)
    .order("executar_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[ARBITRAGEM HIBRIDA] Erro ao verificar fila da execucao:",
      error
    );
    return false;
  }

  if (!data?.executar_em) return false;

  const executarEm = new Date(data.executar_em).getTime();
  if (!Number.isFinite(executarEm)) return false;

  return executarEm - Date.now() > janelaFluxoEmExecucaoMs();
}

export async function deferirMensagemSeFluxoRodando(
  input: AutomationEngineInput
) {
  const mensagemId = String(input.mensagemId || "").trim();
  if (!mensagemId) return null;

  const { data: mensagem, error: mensagemError } = await supabaseAdmin
    .from("mensagens")
    .select("id, remetente_tipo")
    .eq("id", mensagemId)
    .eq("empresa_id", input.empresaId)
    .eq("conversa_id", input.conversaId)
    .maybeSingle();

  if (mensagemError || !mensagem || mensagem.remetente_tipo !== "contato") {
    return null;
  }

  const execucao = await execucaoRodandoDaConversa(input);
  if (!execucao?.id || !execucao.fluxo_id || !execucao.no_atual_id) {
    return null;
  }

  // Um job longo representa uma pausa intencional do fluxo, não a pequena
  // janela em que ele ainda está enviando uma sequência de mensagens.
  if (
    await execucaoEstaEstacionadaEmJobLongo({
      empresaId: input.empresaId,
      execucaoId: execucao.id,
      noId: execucao.no_atual_id,
    })
  ) {
    return null;
  }

  const executarEm = new Date().toISOString();
  const idempotencyKey = `arbitragem_hibrida:${input.empresaId}:${mensagemId}`;
  const payload = {
    mensagem_id: mensagemId,
    contato_id: input.contatoId || null,
    numero_destino: input.numeroDestino || null,
    integracao_whatsapp_id: input.integracaoWhatsappId || null,
    mensagem_tipo: input.mensagemTipo || null,
    media_id: input.mediaId || null,
    mime_type: input.mimeType || null,
    arquivo_nome: input.arquivoNome || null,
    primeira_reavaliacao_em: executarEm,
    motivo: "fluxo_rodando_durante_mensagem_recebida",
  };

  const { data: criado, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .upsert(
      {
        empresa_id: input.empresaId,
        execucao_id: execucao.id,
        fluxo_id: execucao.fluxo_id,
        conversa_id: input.conversaId,
        no_id: execucao.no_atual_id,
        tipo_job: TIPO_JOB_ARBITRAGEM_HIBRIDA,
        status: "pendente",
        executar_em: executarEm,
        payload_json: payload,
        idempotency_key: idempotencyKey,
      },
      {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      }
    )
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao registrar arbitragem hibrida diferida: ${error.message}`
    );
  }

  let job = criado as JobArbitragemHibrida | null;

  if (!job) {
    const { data: existente, error: existenteError } = await supabaseAdmin
      .from("fila_processamento_auto")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existenteError || !existente) {
      throw new Error(
        `Erro ao recuperar arbitragem hibrida existente: ${
          existenteError?.message || "registro nao encontrado"
        }`
      );
    }

    job = existente as JobArbitragemHibrida;
  }

  console.info("[ARBITRAGEM HIBRIDA] Mensagem diferida enquanto fluxo esta rodando", {
    mensagemId,
    conversaId: input.conversaId,
    execucaoId: execucao.id,
    jobId: job.id,
    statusJob: job.status,
  });

  return {
    ok: true,
    status: "arbitragem_hibrida_diferida",
    mensagemId,
    execucaoId: execucao.id,
    jobId: job.id,
  };
}

async function estacionarJobAguardandoEvento(params: {
  job: JobArbitragemHibrida;
  payload: Record<string, unknown>;
  motivo: string;
}) {
  const reavaliacoes = Number(params.payload.reavaliacoes || 0) + 1;
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      status: "pendente",
      payload_json: {
        ...params.payload,
        reavaliacoes,
        ultima_reavaliacao_em: agora,
        ultimo_motivo_adiamento: params.motivo,
      },
      qstash_message_id: null,
      qstash_publicado_at: null,
      locked_at: null,
      erro: null,
      updated_at: agora,
    })
    .eq("id", params.job.id)
    .eq("status", "executando");

  return {
    ok: true,
    processado: false,
    aguardandoEvento: true,
    motivo: params.motivo,
    jobId: params.job.id,
  };
}

async function carregarInputOriginal(job: JobArbitragemHibrida) {
  const payload = job.payload_json || {};
  const mensagemId = String(payload.mensagem_id || "").trim();
  if (!mensagemId) {
    throw new Error("arbitragem_hibrida_mensagem_id_ausente");
  }

  const { data: mensagem, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, remetente_tipo, conteudo, tipo_mensagem")
    .eq("id", mensagemId)
    .eq("empresa_id", job.empresa_id)
    .eq("conversa_id", job.conversa_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao recuperar mensagem da arbitragem: ${error.message}`);
  }

  if (!mensagem || mensagem.remetente_tipo !== "contato") {
    throw new Error("arbitragem_hibrida_mensagem_nao_encontrada");
  }

  return {
    empresaId: job.empresa_id,
    conversaId: job.conversa_id,
    contatoId: String(payload.contato_id || ""),
    mensagemTexto: String(mensagem.conteudo || ""),
    numeroDestino: String(payload.numero_destino || ""),
    integracaoWhatsappId:
      String(payload.integracao_whatsapp_id || "").trim() || null,
    mensagemTipo: tipoMensagemValido(
      payload.mensagem_tipo || mensagem.tipo_mensagem
    ),
    mediaId: String(payload.media_id || "").trim() || null,
    mimeType: String(payload.mime_type || "").trim() || null,
    arquivoNome: String(payload.arquivo_nome || "").trim() || null,
    mensagemId,
  } satisfies AutomationEngineInput;
}

async function buscarSaidaFluxoAposMensagem(
  job: JobArbitragemHibrida
): Promise<SaidaFluxoAposMensagem | null> {
  const mensagemId = String(job.payload_json?.mensagem_id || "").trim();
  if (!mensagemId) return null;

  const { data: mensagemOriginal, error: mensagemError } = await supabaseAdmin
    .from("mensagens")
    .select("created_at")
    .eq("id", mensagemId)
    .eq("empresa_id", job.empresa_id)
    .eq("conversa_id", job.conversa_id)
    .eq("remetente_tipo", "contato")
    .maybeSingle();

  if (mensagemError) {
    throw new Error(
      `Erro ao consultar ordem da mensagem diferida: ${mensagemError.message}`
    );
  }

  if (!mensagemOriginal?.created_at) return null;

  const { data: saidaFluxo, error: saidaError } = await supabaseAdmin
    .from("mensagens")
    .select("id, created_at, automacao_no_id")
    .eq("empresa_id", job.empresa_id)
    .eq("conversa_id", job.conversa_id)
    .eq("remetente_tipo", "bot")
    .eq("automacao_execucao_id", job.execucao_id)
    .gt("created_at", mensagemOriginal.created_at)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (saidaError) {
    throw new Error(
      `Erro ao verificar resposta do fluxo apos mensagem diferida: ${saidaError.message}`
    );
  }

  return (saidaFluxo as SaidaFluxoAposMensagem | null) || null;
}

async function concluirJob(params: {
  job: JobArbitragemHibrida;
  payload: Record<string, unknown>;
  resultado: string;
  metadata?: Record<string, unknown>;
}) {
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      status: "executado",
      payload_json: {
        ...params.payload,
        processado_em: agora,
        resultado: params.resultado,
        ...(params.metadata || {}),
      },
      locked_at: null,
      executed_at: agora,
      erro: null,
      updated_at: agora,
    })
    .eq("id", params.job.id)
    .eq("status", "executando");
}

export async function processarJobArbitragemHibrida(params: {
  jobId: string;
  processar: (
    input: AutomationEngineInput,
    contexto: ContextoReavaliacao
  ) => Promise<ResultadoProcessamentoCallback>;
}) {
  const { data: original, error: originalError } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("*")
    .eq("id", params.jobId)
    .maybeSingle();

  if (originalError) {
    throw new Error(
      `Erro ao buscar job de arbitragem hibrida: ${originalError.message}`
    );
  }

  if (!original || original.tipo_job !== TIPO_JOB_ARBITRAGEM_HIBRIDA) {
    return null;
  }

  const jobAtual = original as JobArbitragemHibrida;

  if (jobAtual.status !== "pendente") {
    return {
      ok: true,
      processado: jobAtual.status === "executado",
      ignorado: true,
      motivo: "job_ja_resolvido",
      status: jobAtual.status,
    };
  }

  if (new Date(jobAtual.executar_em).getTime() > Date.now() + 1_000) {
    return {
      ok: true,
      processado: false,
      ignorado: true,
      motivo: "job_ainda_nao_venceu",
    };
  }

  const { data: lock, error: lockError } = await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      status: "executando",
      tentativas: (jobAtual.tentativas || 0) + 1,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.jobId)
    .eq("status", "pendente")
    .select("*")
    .maybeSingle();

  if (lockError) {
    throw new Error(`Erro ao travar arbitragem hibrida: ${lockError.message}`);
  }

  if (!lock) {
    return {
      ok: true,
      processado: false,
      ignorado: true,
      motivo: "job_travado_por_outro_worker",
    };
  }

  const job = lock as JobArbitragemHibrida;
  const payload = job.payload_json || {};

  try {
    const { data: execucao, error: execucaoError } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("id, status, finished_at")
      .eq("id", job.execucao_id)
      .eq("empresa_id", job.empresa_id)
      .maybeSingle();

    if (execucaoError) {
      throw new Error(
        `Erro ao consultar execucao da arbitragem: ${execucaoError.message}`
      );
    }

    if (
      !execucao ||
      execucao.status === "cancelado" ||
      execucao.status === "erro"
    ) {
      const agora = new Date().toISOString();
      const motivo = !execucao
        ? "execucao_nao_encontrada"
        : `execucao_${execucao.status}`;

      await supabaseAdmin
        .from("fila_processamento_auto")
        .update({
          status: "cancelado",
          locked_at: null,
          executed_at: agora,
          updated_at: agora,
          payload_json: {
            ...payload,
            motivo_cancelamento: motivo,
            cancelado_em: agora,
          },
        })
        .eq("id", job.id)
        .eq("status", "executando");

      return {
        ok: true,
        processado: false,
        cancelado: true,
        motivo,
        jobId: job.id,
      };
    }

    const fluxoAindaRodando =
      execucao.status === "rodando" && !execucao.finished_at;

    if (fluxoAindaRodando) {
      const resultadoAguardando = await estacionarJobAguardandoEvento({
        job,
        payload,
        motivo: "fluxo_ainda_rodando_aguardando_evento",
      });

      // Fecha a corrida em que a execução muda de estado exatamente enquanto
      // um worker antigo ainda estava verificando o job.
      const { data: execucaoDepois } = await supabaseAdmin
        .from("automacao_execucoes")
        .select("status, finished_at")
        .eq("id", job.execucao_id)
        .eq("empresa_id", job.empresa_id)
        .maybeSingle();

      if (
        execucaoDepois &&
        (execucaoDepois.status !== "rodando" || execucaoDepois.finished_at)
      ) {
        await acordarArbitragensHibridasPendentes({
          empresaId: job.empresa_id,
          execucaoId: job.execucao_id,
        });
      }

      return resultadoAguardando;
    }

    // A mensagem foi recebida no meio de uma sequência. Se a mesma execução
    // enviou qualquer saída depois dela, essa saída é a continuação visível da
    // conversa. A mensagem antiga não pode ser reinterpretada como resposta a
    // um CTA que só apareceu depois, nem ser entregue ao Agente retroativamente.
    if (!fluxoAindaRodando) {
      const saidaFluxo = await buscarSaidaFluxoAposMensagem(job);

      if (saidaFluxo) {
        await concluirJob({
          job,
          payload,
          resultado: "respondida_pelo_fluxo_apos_diferimento",
          metadata: {
            mensagem_fluxo_id: saidaFluxo.id,
            mensagem_fluxo_em: saidaFluxo.created_at,
            mensagem_fluxo_no_id: saidaFluxo.automacao_no_id || null,
          },
        });

        console.info(
          "[ARBITRAGEM HIBRIDA] Mensagem não reprocessada porque o fluxo respondeu depois dela",
          {
            jobId: job.id,
            mensagemId: String(payload.mensagem_id || ""),
            execucaoId: job.execucao_id,
            mensagemFluxoId: saidaFluxo.id,
          }
        );

        return {
          ok: true,
          processado: true,
          jobId: job.id,
          tipoJob: TIPO_JOB_ARBITRAGEM_HIBRIDA,
          motivo: "fluxo_respondeu_apos_mensagem_diferida",
          resultado: {
            status: "mensagem_absorvida_pela_sequencia_do_fluxo",
            mensagemFluxoId: saidaFluxo.id,
          },
        };
      }
    }

    const input = await carregarInputOriginal(job);
    const decisao = await params.processar(input, {
      fluxoAindaRodando,
      tentativas: job.tentativas || 1,
    });

    if (decisao.acao === "adiar") {
      return estacionarJobAguardandoEvento({
        job,
        payload,
        motivo: decisao.motivo || "aguardando_novo_evento_de_estado",
      });
    }

    await concluirJob({
      job,
      payload,
      resultado: "arbitragem_reavaliada",
    });

    return {
      ok: true,
      processado: true,
      jobId: job.id,
      tipoJob: TIPO_JOB_ARBITRAGEM_HIBRIDA,
      resultado: decisao.resultado,
    };
  } catch (error) {
    const mensagemErro =
      error instanceof Error ? error.message : String(error);
    const errosAnteriores = Number(payload.erros_processamento || 0);
    const errosProcessamento = errosAnteriores + 1;
    const status = errosProcessamento >= 3 ? "erro" : "pendente";

    await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status,
        executar_em: job.executar_em,
        payload_json: {
          ...payload,
          erros_processamento: errosProcessamento,
          ultimo_erro_em: new Date().toISOString(),
        },
        locked_at: null,
        executed_at: status === "erro" ? new Date().toISOString() : null,
        erro: mensagemErro,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "executando");

    throw error;
  }
}

export async function acordarArbitragensHibridasPendentes(params: {
  empresaId: string;
  execucaoId?: string | null;
}) {
  const execucaoId = String(params.execucaoId || "").trim();
  if (!execucaoId) return 0;

  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, status, finished_at")
    .eq("empresa_id", params.empresaId)
    .eq("id", execucaoId)
    .maybeSingle();

  if (execucaoError) {
    console.error(
      "[ARBITRAGEM HIBRIDA] Erro ao verificar mudança de estado da execução:",
      execucaoError
    );
    return 0;
  }

  if (!execucao || execucao.status === "cancelado" || execucao.status === "erro") {
    const agora = new Date().toISOString();

    const { data: cancelados, error: cancelamentoError } = await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status: "cancelado",
        locked_at: null,
        executed_at: agora,
        updated_at: agora,
      })
      .eq("empresa_id", params.empresaId)
      .eq("execucao_id", execucaoId)
      .eq("tipo_job", TIPO_JOB_ARBITRAGEM_HIBRIDA)
      .eq("status", "pendente")
      .select("id");

    if (cancelamentoError) {
      console.error(
        "[ARBITRAGEM HIBRIDA] Erro ao cancelar jobs após encerramento da execução:",
        cancelamentoError
      );
      return 0;
    }

    return cancelados?.length || 0;
  }

  if (execucao.status === "rodando" && !execucao.finished_at) {
    return 0;
  }

  const agora = new Date().toISOString();
  const { data: jobs, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      executar_em: agora,
      qstash_publicado_at: agora,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", execucaoId)
    .eq("tipo_job", TIPO_JOB_ARBITRAGEM_HIBRIDA)
    .eq("status", "pendente")
    .is("qstash_publicado_at", null)
    .select("id");

  if (error || !jobs?.length) {
    if (error) {
      console.error(
        "[ARBITRAGEM HIBRIDA] Erro ao preparar jobs para evento de estado:",
        error
      );
    }
    return 0;
  }

  const falhas: string[] = [];

  for (const job of jobs) {
    const messageId = await publicarJobQstash(job.id, 1_000);
    if (!messageId) {
      falhas.push(job.id);
      await supabaseAdmin
        .from("fila_processamento_auto")
        .update({
          qstash_message_id: null,
          qstash_publicado_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "pendente");
    }
  }

  if (falhas.length > 0) {
    throw new Error(
      `Falha ao publicar arbitragem por evento de estado: ${falhas.join(",")}`
    );
  }

  return jobs.length;
}
