import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

// Margem operacional de um minuto para o cron concluir o encerramento antes
// do limite externo de 24 horas.
export const JANELA_24H_MS = (24 * 60 - 1) * 60 * 1000;

const STATUS_EXPIRAVEIS_POR_24H = [
  "bot",
  "aberta",
  "fila",
  "em_atendimento",
  "aguardando_cliente",
  "encerrada",
  "encerrado_manual",
  "encerrado_aut",
];

type ConversaExpiravel = {
  id: string;
  empresa_id: string;
  status: string;
  bot_ativo: boolean | null;
  closed_at: string | null;
  last_inbound_message_at?: string | null;
};

function dataValidaOuNull(data?: string | null) {
  if (!data) return null;

  const time = new Date(data).getTime();

  if (Number.isNaN(time)) {
    return null;
  }

  return data;
}

function dataMaisRecente(
  primeira?: string | null,
  segunda?: string | null
) {
  const dataPrimeira = dataValidaOuNull(primeira);
  const dataSegunda = dataValidaOuNull(segunda);

  if (!dataPrimeira) return dataSegunda;
  if (!dataSegunda) return dataPrimeira;

  return new Date(dataPrimeira).getTime() >= new Date(dataSegunda).getTime()
    ? dataPrimeira
    : dataSegunda;
}

export function janela24hExpirada(
  ultimaMensagemContatoAt?: string | null,
  agora = new Date()
) {
  const dataUltimaMensagem = dataValidaOuNull(ultimaMensagemContatoAt);

  if (!dataUltimaMensagem) {
    return false;
  }

  const ultimaMensagemMs = new Date(dataUltimaMensagem).getTime();

  return agora.getTime() > ultimaMensagemMs + JANELA_24H_MS;
}

async function buscarUltimaMensagemRecebidaContato({
  empresaId,
  conversaId,
}: {
  empresaId: string;
  conversaId: string;
}) {
  const { data: ultimaMensagemCliente, error: ultimaMensagemError } =
    await supabaseAdmin
      .from("mensagens")
      .select("created_at")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("origem", "recebida")
      .eq("remetente_tipo", "contato")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (ultimaMensagemError) {
    throw new Error(
      `Erro ao buscar ultima mensagem recebida: ${ultimaMensagemError.message}`
    );
  }

  return dataValidaOuNull(ultimaMensagemCliente?.created_at ?? null);
}

async function buscarExpiracaoPersistidaConversa({
  empresaId,
  conversaId,
}: {
  empresaId: string;
  conversaId: string;
}) {
  const { data: conversa, error } = await supabaseAdmin
    .from("conversas")
    .select("last_inbound_message_at, window_expires_at")
    .eq("empresa_id", empresaId)
    .eq("id", conversaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar expiracao da conversa: ${error.message}`);
  }

  return {
    lastInboundMessageAt: dataValidaOuNull(
      conversa?.last_inbound_message_at ?? null
    ),
    windowExpiresAt: dataValidaOuNull(conversa?.window_expires_at ?? null),
  };
}

export async function verificarEEncerrarConversaSe24hExpirada({
  empresaId,
  conversaId,
  lastInboundMessageAt = null,
  agora = new Date(),
}: {
  empresaId: string;
  conversaId: string;
  lastInboundMessageAt?: string | null;
  agora?: Date;
}) {
  let ultimaMensagemContatoAt = dataValidaOuNull(lastInboundMessageAt);
  let windowExpiresAt: string | null = null;

  if (!ultimaMensagemContatoAt || janela24hExpirada(ultimaMensagemContatoAt, agora)) {
    const ultimaMensagemBanco = await buscarUltimaMensagemRecebidaContato({
      empresaId,
      conversaId,
    });

    ultimaMensagemContatoAt = dataMaisRecente(
      ultimaMensagemContatoAt,
      ultimaMensagemBanco
    );
  }

  if (!ultimaMensagemContatoAt) {
    const expiracaoPersistida = await buscarExpiracaoPersistidaConversa({
      empresaId,
      conversaId,
    });

    ultimaMensagemContatoAt = dataMaisRecente(
      ultimaMensagemContatoAt,
      expiracaoPersistida.lastInboundMessageAt
    );
    windowExpiresAt = expiracaoPersistida.windowExpiresAt;
  }

  const expirouPelaMensagemRecebida = janela24hExpirada(
    ultimaMensagemContatoAt,
    agora
  );
  const expirouPelaJanelaPersistida =
    !ultimaMensagemContatoAt &&
    !!windowExpiresAt &&
    agora.getTime() >= new Date(windowExpiresAt).getTime();

  if (!expirouPelaMensagemRecebida && !expirouPelaJanelaPersistida) {
    return {
      expirada: false,
      encerrada: false,
      ultimaMensagemContatoAt,
    };
  }

  await encerrarConversaPor24h({
    empresaId,
    conversaId,
    agoraISO: agora.toISOString(),
  });

  return {
    expirada: true,
    encerrada: true,
    ultimaMensagemContatoAt,
  };
}

export async function encerrarConversasExpiradas(empresaId: string) {
  if (!empresaId) return;

  const agora = new Date();

  const { data: conversas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, status, bot_ativo, closed_at, last_inbound_message_at")
    .eq("empresa_id", empresaId)
    .in("status", STATUS_EXPIRAVEIS_POR_24H);

  if (conversasError) {
    throw new Error(`Erro ao buscar conversas expiradas: ${conversasError.message}`);
  }

  if (!conversas?.length) return;

  for (const conversa of conversas as ConversaExpiravel[]) {
    try {
      await verificarEEncerrarConversaSe24hExpirada({
        empresaId,
        conversaId: conversa.id,
        lastInboundMessageAt: conversa.last_inbound_message_at ?? null,
        agora,
      });
    } catch (error) {
      console.error(
        "[EXPIRACAO_CONVERSAS] Erro ao verificar conversa expirada:",
        error
      );
    }
  }
}

export async function encerrarConversaPor24h({
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

  if (!conversaAtual || conversaAtual.status === "encerrado_24h") {
    return;
  }

  const { error: conversaUpdateError } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "encerrado_24h",
      bot_ativo: false,
      aguardando_atendente: false,
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
      `Erro ao cancelar automacao expirada: ${execucaoError.message}`
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
      `Erro ao registrar mensagem de encerramento automatico: ${mensagemError.message}`
    );
  }
}
