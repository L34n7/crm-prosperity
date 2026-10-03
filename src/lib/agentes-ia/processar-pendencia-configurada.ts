import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarBloqueioFinanceiroMetaConversa } from "@/lib/whatsapp/meta-payment-block";
import { buscarBloqueioLimiteServiceConversa } from "@/lib/whatsapp/service-quota";
import { assumirConversaParaPendenciaAgenteIa } from "./estado-atendimento-conversa";
import { processarPoliticaHorarioAtendimento } from "./politica-horario-atendimento";
import { processarPoliticaAgendaPendencia } from "./politica-agenda";
import { processarPendenciaAgenteIa as processarPendenciaAgenteIaCore } from "./processar-pendencia-configurada-core";

export async function processarPendenciaAgenteIa(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: pendencia } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("empresa_id, conversa_id")
    .eq("id", pendenciaId)
    .maybeSingle();

  if (pendencia?.empresa_id && pendencia?.conversa_id) {
    const bloqueio = await buscarBloqueioFinanceiroMetaConversa({
      empresaId: pendencia.empresa_id,
      conversaId: pendencia.conversa_id,
    });

    if (bloqueio?.ativo) {
      await supabaseAdmin
        .from("agente_ia_pendencias")
        .update({
          status: "cancelado",
          erro: "Agente de IA pausado por pendência financeira na Meta.",
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendenciaId)
        .in("status", ["pendente", "processando"]);

      return {
        ok: true,
        processado: false,
        runtime: "pagamento_meta_pendente",
      };
    }

    const bloqueioService = await buscarBloqueioLimiteServiceConversa({
      empresaId: pendencia.empresa_id,
      conversaId: pendencia.conversa_id,
    });

    if (bloqueioService?.ativo) {
      await supabaseAdmin
        .from("agente_ia_pendencias")
        .update({
          status: "cancelado",
          erro:
            "Agente de IA pausado porque a integração atingiu o limite mensal de Meta Service configurado.",
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendenciaId)
        .in("status", ["pendente", "processando"]);

      return {
        ok: true,
        processado: false,
        runtime: "limite_meta_service_atingido",
      };
    }
  }

  const politicaHorario = await processarPoliticaHorarioAtendimento(pendenciaId);
  if (politicaHorario.tratado) {
    return politicaHorario.resultado || {
      ok: true,
      processado: false,
      runtime: "politica_horario_atendimento",
    };
  }

  const politicaAgenda = await processarPoliticaAgendaPendencia(pendenciaId, options);
  if (politicaAgenda.tratado) {
    return politicaAgenda.resultado || {
      ok: true,
      processado: true,
      runtime: "politica_agenda",
    };
  }

  // Quando uma pendência agendada vence, uma conversa em `fila` só pode ser
  // assumida pela IA se não estiver realmente aguardando atendimento humano.
  // O update é protegido por estado para não atropelar transferência para setor
  // nem um atendente que tenha assumido a conversa no intervalo.
  await assumirConversaParaPendenciaAgenteIa(pendenciaId);

  return processarPendenciaAgenteIaCore(pendenciaId, options);
}
