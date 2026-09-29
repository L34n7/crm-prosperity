import { recuperarFluxoConversaPorUltimaMensagem } from "@/lib/automacoes/recuperar-fluxo-conversa";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function processarFilaRecuperacaoFluxoPorId(jobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("id, empresa_id, conversa_id, tipo_job, status, executar_em, payload_json, tentativas")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Erro ao buscar job de recuperação: ${jobError.message}`);
  }

  if (!job || job.tipo_job !== "recuperar_fluxo_conversa") {
    return {
      ok: true,
      processado: false,
      ignorado: true,
      motivo: "job_recuperacao_nao_encontrado",
    };
  }

  if (job.status !== "pendente") {
    return {
      ok: true,
      processado: job.status === "executado",
      ignorado: true,
      motivo: "job_ja_resolvido",
      status: job.status,
    };
  }

  if (
    job.executar_em &&
    new Date(job.executar_em).getTime() > Date.now() + 1000
  ) {
    return {
      ok: true,
      processado: false,
      ignorado: true,
      motivo: "job_ainda_nao_venceu",
    };
  }

  const agora = new Date().toISOString();
  const { data: travado, error: lockError } = await supabaseAdmin
    .from("fila_processamento_auto")
    .update({
      status: "executando",
      tentativas: Number(job.tentativas || 0) + 1,
      locked_at: agora,
      updated_at: agora,
    })
    .eq("id", jobId)
    .eq("status", "pendente")
    .select("id, empresa_id, conversa_id, payload_json, tentativas")
    .maybeSingle();

  if (lockError) {
    throw new Error(`Erro ao travar job de recuperação: ${lockError.message}`);
  }

  if (!travado) {
    return {
      ok: true,
      processado: false,
      ignorado: true,
      motivo: "job_travado_por_outro_worker",
    };
  }

  const payload =
    travado.payload_json &&
    typeof travado.payload_json === "object" &&
    !Array.isArray(travado.payload_json)
      ? travado.payload_json
      : {};

  try {
    const resultado = await recuperarFluxoConversaPorUltimaMensagem({
      conversaId: travado.conversa_id,
      origem: String(payload.origem || "fila_recuperacao_fluxo"),
      permitirReprocessarSemGatilho: true,
    });

    const finalizadoEm = new Date().toISOString();

    await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status: "executado",
        executed_at: finalizadoEm,
        locked_at: null,
        erro: null,
        updated_at: finalizadoEm,
        payload_json: {
          ...payload,
          resultado_recuperacao: resultado,
          processado_em: finalizadoEm,
        },
      })
      .eq("id", jobId);

    return {
      ok: resultado.ok,
      processado: resultado.iniciado === true,
      ignorado: resultado.iniciado !== true,
      motivo: resultado.motivo || null,
      resultado,
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    const tentativas = Number(travado.tentativas || 1);
    const status = tentativas >= 3 ? "erro" : "pendente";
    const atualizadoEm = new Date().toISOString();

    await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status,
        locked_at: null,
        erro: mensagem,
        executed_at: status === "erro" ? atualizadoEm : null,
        updated_at: atualizadoEm,
        payload_json: {
          ...payload,
          erro_recuperacao: mensagem,
          ultima_tentativa_em: atualizadoEm,
        },
      })
      .eq("id", jobId);

    throw error;
  }
}

export async function processarFilaRecuperacaoFluxoPendentes(limite = 25) {
  const { data: jobs, error } = await supabaseAdmin
    .from("fila_processamento_auto")
    .select("id")
    .eq("tipo_job", "recuperar_fluxo_conversa")
    .eq("status", "pendente")
    .lte("executar_em", new Date().toISOString())
    .order("executar_em", { ascending: true })
    .limit(Math.min(Math.max(limite, 1), 50));

  if (error) {
    throw new Error(
      `Erro ao buscar fila de recuperação de fluxos: ${error.message}`
    );
  }

  let processados = 0;
  let ignorados = 0;
  let erros = 0;

  for (const job of jobs || []) {
    try {
      const resultado = await processarFilaRecuperacaoFluxoPorId(job.id);
      if (resultado.processado) processados += 1;
      else if (resultado.ignorado) ignorados += 1;
    } catch (error) {
      erros += 1;
      console.error("[RECUPERACAO FLUXO FILA] Erro:", {
        jobId: job.id,
        erro: error,
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
