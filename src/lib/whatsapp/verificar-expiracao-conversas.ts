import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

type ConversaExpiravel = {
  id: string;
  empresa_id: string;
  status: string;
  bot_ativo: boolean | null;
  closed_at: string | null;
};

export async function encerrarConversasExpiradas(empresaId: string) {
  if (!empresaId) return;

  const agora = new Date();
  const agoraISO = agora.toISOString();

  const { data: conversas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, status, bot_ativo, closed_at")
    .eq("empresa_id", empresaId)
    .is("closed_at", null)
    .in("status", ["bot", "aberta", "fila", "em_atendimento", "aguardando_cliente"]);

  if (conversasError) {
    throw new Error(`Erro ao buscar conversas expiradas: ${conversasError.message}`);
  }

  if (!conversas?.length) return;

  for (const conversa of conversas as ConversaExpiravel[]) {
    const { data: ultimaMensagemCliente, error: ultimaMensagemError } =
      await supabaseAdmin
        .from("mensagens")
        .select("created_at")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversa.id)
        .eq("origem", "recebida")
        .eq("remetente_tipo", "contato")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (ultimaMensagemError) {
      console.error(
        "[EXPIRACAO_CONVERSAS] Erro ao buscar última mensagem recebida:",
        ultimaMensagemError
      );
      continue;
    }

    if (!ultimaMensagemCliente?.created_at) {
      continue;
    }

    const ultimaClienteMs = new Date(ultimaMensagemCliente.created_at).getTime();

    if (Number.isNaN(ultimaClienteMs)) {
      continue;
    }

    const janelaExpirada = agora.getTime() > ultimaClienteMs + JANELA_24H_MS;

    if (!janelaExpirada) {
      continue;
    }

    await encerrarConversaPor24h({
      empresaId,
      conversaId: conversa.id,
      agoraISO,
    });
  }
}

async function encerrarConversaPor24h({
  empresaId,
  conversaId,
  agoraISO,
}: {
  empresaId: string;
  conversaId: string;
  agoraISO: string;
}) {
  const { data: conversaAtual } = await supabaseAdmin
    .from("conversas")
    .select("id, status, closed_at")
    .eq("empresa_id", empresaId)
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversaAtual || conversaAtual.closed_at) {
    return;
  }

  const { error: conversaUpdateError } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "encerrado_24h",
      bot_ativo: false,
      closed_at: agoraISO,
      updated_at: agoraISO,
    })
    .eq("empresa_id", empresaId)
    .eq("id", conversaId);

  if (conversaUpdateError) {
    throw new Error(
      `Erro ao encerrar conversa por 24h: ${conversaUpdateError.message}`
    );
  }

  const { error: protocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      closed_at: agoraISO,
      updated_at: agoraISO,
    })
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true);

  if (protocoloError) {
    throw new Error(
      `Erro ao fechar protocolo da conversa expirada: ${protocoloError.message}`
    );
  }

  const { error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "cancelado",
      finished_at: agoraISO,
      updated_at: agoraISO,
      metadata_json: {
        motivo_cancelamento: "janela_24h_expirada",
      },
    })
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando", "pausado"]);

  if (execucaoError) {
    throw new Error(
      `Erro ao cancelar automação expirada: ${execucaoError.message}`
    );
  }

  const { error: mensagemError } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: empresaId,
    conversa_id: conversaId,
    remetente_tipo: "sistema",
    conteudo:
      "Conversa encerrada automaticamente porque a janela de 24 horas do WhatsApp expirou sem nova resposta do cliente.",
    tipo_mensagem: "texto",
    origem: "automatica",
    status_envio: "lida",
    created_at: agoraISO,
    updated_at: agoraISO,
  });

  if (mensagemError) {
    throw new Error(
      `Erro ao registrar mensagem de encerramento automático: ${mensagemError.message}`
    );
  }
}