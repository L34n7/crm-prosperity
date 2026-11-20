import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { automacoesContatoEstaoDesabilitadas } from "@/lib/contatos/automacoes";
import { automacoesEmpresaEstaoBloqueadas } from "@/lib/assinaturas/bloqueio-operacional";
import { buscarBloqueioLimiteServiceConversa } from "@/lib/whatsapp/service-quota";
import { assumirConversaParaPendenciaAgenteIa, conversaEstaComHumano } from "./estado-atendimento-conversa";
import { processarPedidoHumanoPrioritario } from "./transferencia-humana-prioritaria";
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
    .select("id, empresa_id, agente_id, conversa_id, contato_id, numero_destino, mensagem_ids, conteudo_agregado, status, versao")
    .eq("id", pendenciaId)
    .maybeSingle();

  if (pendencia?.empresa_id && pendencia?.conversa_id) {
    // A fila humana nunca pode ser tomada por uma pendência antiga nem gerar novos follow-ups.
    const { data: conversaAtual, error: erroConversa } = await supabaseAdmin
      .from("conversas")
      .select("id,status,bot_ativo,aguardando_atendente,responsavel_id")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("id", pendencia.conversa_id)
      .maybeSingle();
    if (erroConversa) throw new Error(erroConversa.message);
    if (conversaEstaComHumano(conversaAtual)) {
      await supabaseAdmin.from("agente_ia_pendencias")
        .update({ status: "cancelado", erro: "atendimento_humano", updated_at: new Date().toISOString() })
        .eq("id", pendenciaId).eq("status", "pendente");
      return { ok: true, processado: false, runtime: "atendimento_humano" };
    }
    if (await automacoesEmpresaEstaoBloqueadas(pendencia.empresa_id)) {
      await supabaseAdmin.from("agente_ia_pendencias")
        .update({ status: "cancelado", erro: "assinatura_bloqueada", lock_token: null, locked_at: null, updated_at: new Date().toISOString() })
        .eq("id", pendenciaId).in("status", ["pendente", "processando"]);
      return { ok: true, processado: false, runtime: "assinatura_bloqueada" };
    }
    const automacoesDesabilitadas = await automacoesContatoEstaoDesabilitadas({
      empresaId: pendencia.empresa_id,
      contatoId: pendencia.contato_id || null,
      conversaId: pendencia.conversa_id,
    });

    if (automacoesDesabilitadas) {
      await supabaseAdmin
        .from("agente_ia_pendencias")
        .update({
          status: "cancelado",
          erro: "Automações desabilitadas para o contato.",
          lock_token: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendenciaId)
        .in("status", ["pendente", "processando"]);

      return {
        ok: true,
        processado: false,
        runtime: "contato_automacoes_desabilitadas",
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

  // Pedidos explícitos de humano têm prioridade sobre as respostas e demais políticas da IA.
  const transferencia = await processarPedidoHumanoPrioritario(pendenciaId, pendencia, options);
  if (transferencia.tratado) return transferencia.resultado;

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
