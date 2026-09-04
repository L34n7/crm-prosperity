import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa } from "@/lib/ia/tokens";
import { executarContingenciaAgente } from "./fallback";
import { processarPendenciaAgenteIa as processarPendenciaAgenteIaBase } from "./runtime-v3";
import { processarPendenciaNegocio } from "./runtime-negocio";

const supabaseAdmin = getSupabaseAdmin();

type PendenciaRow = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids: string[];
  conteudo_agregado: string;
  versao: number;
};

async function processarSemTokens(
  pendenciaId: string,
  options: { forcar?: boolean }
) {
  const lockToken = crypto.randomUUID();
  const { data: reservada, error: reservaError } = await supabaseAdmin.rpc(
    "agente_ia_reservar_pendencia",
    {
      p_pendencia_id: pendenciaId,
      p_lock_token: lockToken,
      p_forcar: options.forcar === true,
    }
  );
  if (reservaError) throw new Error(reservaError.message);
  if (!reservada) {
    return {
      ok: true,
      processado: false,
      motivo: "pendencia_indisponivel_ou_debounce",
    };
  }

  const pendencia = reservada as PendenciaRow;
  const inicio = Date.now();
  const { data: agente, error: agenteError } = await supabaseAdmin
    .from("agentes_ia")
    .select("id, empresa_id, status, fallback_tipo, fallback_fluxo_id, fallback_transferencia_json")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.agente_id)
    .eq("status", "ativo")
    .maybeSingle();

  if (agenteError || !agente) {
    await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
      p_pendencia_id: pendencia.id,
      p_lock_token: lockToken,
      p_versao: pendencia.versao,
      p_status: "cancelado",
      p_erro: "agente_inativo_ou_removido",
    });
    return { ok: true, processado: false, motivo: "agente_inativo_ou_removido" };
  }

  const agora = new Date().toISOString();
  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("agente_ia_execucoes")
    .insert({
      empresa_id: pendencia.empresa_id,
      agente_id: agente.id,
      conversa_id: pendencia.conversa_id,
      contato_id: pendencia.contato_id || null,
      mensagem_ids: pendencia.mensagem_ids,
      status: "processando",
      entrada_resumida: pendencia.conteudo_agregado.slice(0, 4000),
      modelo: "contingencia_sem_ia",
      started_at: agora,
      metadata_json: { motivo: "saldo_tokens_ia_esgotado" },
    })
    .select("id")
    .single();
  if (execucaoError || !execucao) {
    throw new Error(execucaoError?.message || "Não foi possível registrar a contingência do agente.");
  }

  let resultado: Awaited<ReturnType<typeof executarContingenciaAgente>>;
  try {
    resultado = await executarContingenciaAgente(agente, pendencia);
  } catch (error) {
    resultado = {
      ok: false,
      tipo: String(agente.fallback_tipo || "nenhum"),
      executado: false,
      motivo: "erro_contingencia",
      error: error instanceof Error ? error.message : String(error),
    } as Awaited<ReturnType<typeof executarContingenciaAgente>>;
  }

  const finalAgora = new Date().toISOString();
  await supabaseAdmin
    .from("agente_ia_execucoes")
    .update({
      status: "fallback",
      erro:
        resultado.ok === true
          ? resultado.tipo === "nenhum"
            ? "saldo_tokens_ia_esgotado_sem_contingencia"
            : "saldo_tokens_ia_esgotado"
          : `saldo_tokens_ia_esgotado_contingencia_falhou: ${String((resultado as { error?: string }).error || "erro")}`,
      latencia_ms: Date.now() - inicio,
      finished_at: finalAgora,
      updated_at: finalAgora,
      metadata_json: {
        motivo: "saldo_tokens_ia_esgotado",
        contingencia: resultado,
      },
    })
    .eq("id", execucao.id);

  await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: pendencia.id,
    p_lock_token: lockToken,
    p_versao: pendencia.versao,
    p_status: "processado",
    p_erro: resultado.ok === true ? null : String((resultado as { error?: string }).error || "erro_contingencia"),
  });

  return {
    ok: resultado.ok === true,
    processado: true,
    fallback: true,
    motivo: "saldo_tokens_ia_esgotado",
    contingencia: resultado,
  };
}

export async function processarPendenciaAgenteIa(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
) {
  const { data: pendencia, error } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("id, empresa_id, status")
    .eq("id", pendenciaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pendencia) return { ok: true, processado: false, motivo: "pendencia_nao_encontrada" };

  const saldo = await buscarSaldoTokensIa(pendencia.empresa_id);
  if (saldo.limite !== null && Number(saldo.restantes || 0) <= 0) {
    return processarSemTokens(pendenciaId, options);
  }

  const negocio = await processarPendenciaNegocio(pendenciaId, options);
  if (negocio.tratado) {
    return negocio.resultado || {
      ok: true,
      processado: true,
      runtime: "negocio",
    };
  }

  return processarPendenciaAgenteIaBase(pendenciaId, options);
}
