import { Client as QstashClient } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEngineInput } from "./types";

const supabaseAdmin = getSupabaseAdmin();
const TIPO_JOB_ARBITRAGEM_HIBRIDA = "arbitragem_hibrida";
const DELAY_REAVALIACAO_PADRAO_MS = 2_000;
const JANELA_FLUXO_EM_EXECUCAO_PADRAO_MS = 15_000;
const DELAY_REAVALIACAO_MAXIMO_MS = 10_000;

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
  excedeuJanelaAtiva: boolean;
  tentativas: number;
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

function delayReavaliacaoMs() {
  return inteiroAmbiente(
    process.env.AUTOMACAO_ARBITRAGEM_REAVALIACAO_MS,
    DELAY_REAVALIACAO_PADRAO_MS,
    1_000,
    10_000
  );
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
      "[ARBITRAGEM HIBRIDA] QStash indisponivel; cron da fila fara a reavaliacao.",
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

function tipoMensagemValido(valor: unknown): AutomationEngineInput["mensagemTipo"] {
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

  // Se a execucao esta propositalmente estacionada em um job longo, nao se trata
  // da pequena janela de concorrencia entre mensagens sequenciais do fluxo.
  if (
    await execucaoEstaEstacionadaEmJobLongo({
      empresaId: input.empresaId,
      execucaoId: execucao.id,
      noId: execucao.no_atual_id,
    })
  ) {
    return null;
  }

  const delayMs = delayReavaliacaoMs();
  const executarEm = new Date(Date.now() + delayMs).toISOString();
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
  } else {
    await publicarJobQstash(job.id, delayMs);
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

async function reagendarJob(params: {
  job: JobArbitragemHibrida;
  payload: Record<string, unknown>;
  delayMs: number;
  motivo: string;
}) {
  const executarEm = new Date(Date.now() + params.delayMs).toISOString();
  const reavaliacoes = Number(params.payload.reavaliacoes || 0) + 1;

  await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      status: "pendente",
      executar_em: executarEm,
      payload_json: {
        ...params.payload,
        reavaliacoes,
        ultima_reavaliacao_em: new Date().toISOString(),
        ultimo_motivo_adiamento: params.motivo,
      },
      locked_at: null,
      erro: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.job.id)
    .eq("status", "executando");

  await publicarJobQstash(params.job.id, params.delayMs);

  return {
    ok: true,
    processado: false,
    adiado: true,
    motivo: params.motivo,
    jobId: params.job.id,
    executarEm,
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

    const fluxoAindaRodando =
      execucao?.status === "rodando" && !execucao.finished_at;
    const criadoEmMs = new Date(job.created_at).getTime();
    const tempoDecorridoMs = Number.isFinite(criadoEmMs)
      ? Date.now() - criadoEmMs
      : 0;
    const excedeuJanelaAtiva =
      fluxoAindaRodando && tempoDecorridoMs >= janelaFluxoEmExecucaoMs();

    if (fluxoAindaRodando && !excedeuJanelaAtiva) {
      return reagendarJob({
        job,
        payload,
        delayMs: delayReavaliacaoMs(),
        motivo: "fluxo_ainda_rodando",
      });
    }

    const input = await carregarInputOriginal(job);
    const decisao = await params.processar(input, {
      fluxoAindaRodando,
      excedeuJanelaAtiva,
      tentativas: job.tentativas || 1,
    });

    if (decisao.acao === "adiar") {
      const reavaliacoes = Number(payload.reavaliacoes || 0);
      const atrasoProgressivo = Math.min(
        DELAY_REAVALIACAO_MAXIMO_MS,
        delayReavaliacaoMs() + Math.max(0, reavaliacoes - 4) * 1_000
      );

      return reagendarJob({
        job,
        payload,
        delayMs: decisao.delayMs || atrasoProgressivo,
        motivo: decisao.motivo || "fluxo_nao_estabilizou",
      });
    }

    await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status: "executado",
        payload_json: {
          ...payload,
          processado_em: new Date().toISOString(),
          resultado: "arbitragem_reavaliada",
        },
        locked_at: null,
        executed_at: new Date().toISOString(),
        erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "executando");

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
    const delayMs = delayReavaliacaoMs();

    await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status,
        executar_em:
          status === "pendente"
            ? new Date(Date.now() + delayMs).toISOString()
            : job.executar_em,
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

    if (status === "pendente") {
      await publicarJobQstash(job.id, delayMs);
    }

    throw error;
  }
}

export async function acordarArbitragensHibridasPendentes(params: {
  empresaId: string;
  execucaoId?: string | null;
}) {
  const execucaoId = String(params.execucaoId || "").trim();
  if (!execucaoId) return 0;

  const { data: jobs, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", execucaoId)
    .eq("tipo_job", TIPO_JOB_ARBITRAGEM_HIBRIDA)
    .eq("status", "pendente");

  if (error || !jobs?.length) return 0;

  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      executar_em: agora,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", execucaoId)
    .eq("tipo_job", TIPO_JOB_ARBITRAGEM_HIBRIDA)
    .eq("status", "pendente");

  await Promise.all(
    jobs.map((job) => publicarJobQstash(job.id, 1_000))
  );

  return jobs.length;
}
