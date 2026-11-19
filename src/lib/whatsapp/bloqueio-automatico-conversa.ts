import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Falha 130403 da Meta: o WhatsApp Business bloqueou o destinatário.
 * Bloqueia somente os envios AUTOMÁTICOS vinculados à conversa afetada.
 * Envio humano e disparos em massa usam fluxos independentes.
 */
export const MOTIVO_ENVIO_AUTOMATICO_BLOQUEADO_130403 =
  "envio_automatico_bloqueado_meta_130403" as const;

const supabase = getSupabaseAdmin();

export async function envioAutomaticoEstaBloqueado(params: {
  empresaId: string;
  conversaId: string;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversas")
    .select("id,envios_automaticos_bloqueados_em")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();

  // Falhar fechado: nunca permitir enviar sem confirmar a conversa correta.
  if (error) throw new Error("Falha ao validar bloqueio 130403 da conversa: " + error.message);
  if (!data) throw new Error("Conversa não encontrada para validar bloqueio 130403.");
  return Boolean(data.envios_automaticos_bloqueados_em);
}

export async function registrarFalha130403Conversa(params: {
  empresaId: string;
  conversaId: string;
  mensagemId: string;
}) {
  const agora = new Date().toISOString();

  // Idempotência: preservar o primeiro evento que suspendeu a conversa.
  const { error } = await supabase
    .from("conversas")
    .update({
      envios_automaticos_bloqueados_em: agora,
      envios_automaticos_bloqueio_codigo: 130403,
      envios_automaticos_bloqueio_mensagem_id: params.mensagemId,
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .is("envios_automaticos_bloqueados_em", null);

  if (error) throw new Error("Não foi possível suspender envios automáticos da conversa: " + error.message);

  // Impede que passos atrasados acordem e tentem enviar novamente.
  // Todas as queries usam empresa + conversa (nunca integração ou empresa isoladamente).
  const [fluxos, fila, pendencias, agendamentos] = await Promise.all([
    supabase.from("automacao_execucoes")
      .update({ status: "cancelado", finished_at: agora, updated_at: agora })
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .in("status", ["rodando", "aguardando"]),
    supabase.from("fila_processamento_auto")
      .update({ status: "cancelado", updated_at: agora, executed_at: agora })
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("status", "pendente"),
    supabase.from("agente_ia_pendencias")
      .update({ status: "cancelado", updated_at: agora })
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("status", "pendente"),
    supabase.from("automacao_agendamentos")
      .update({ status: "cancelado", executed_at: agora })
      .eq("empresa_id", params.empresaId)
      .contains("payload_json", { conversa_id: params.conversaId })
      .eq("status", "pendente"),
  ]);

  const erroFila = [fluxos.error, fila.error, pendencias.error, agendamentos.error].find(Boolean);
  if (erroFila) throw new Error("Conversa suspensa, mas houve falha ao cancelar pendências: " + erroFila.message);

  return { bloqueado: true, motivo: MOTIVO_ENVIO_AUTOMATICO_BLOQUEADO_130403 };
}
