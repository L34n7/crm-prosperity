import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CanSendMessageParams = {
  conversaId: string;
};

export type CanSendMessageResult = {
  podeEnviarMensagemLivre: boolean;
  ultimaMensagemRecebidaEm: string | null;
  janelaExpiraEm: string | null;
  motivoBloqueio: string | null;
};

const JANELA_24H_EM_MS = 24 * 60 * 60 * 1000;

export async function canSendFreeformWhatsAppMessage({
  conversaId,
}: CanSendMessageParams): Promise<CanSendMessageResult> {
  const supabaseAdmin = getSupabaseAdmin();

  if (!conversaId) {
    throw new Error("conversaId é obrigatório");
  }

  const { data: ultimaRecebida, error } = await supabaseAdmin
    .from("mensagens")
    .select("created_at")
    .eq("conversa_id", conversaId)
    .eq("origem", "recebida")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar janela de 24h: ${error.message}`
    );
  }

  if (!ultimaRecebida?.created_at) {
    return {
      podeEnviarMensagemLivre: false,
      ultimaMensagemRecebidaEm: null,
      janelaExpiraEm: null,
      motivoBloqueio:
        "Esta conversa não possui mensagem recebida do cliente para abrir a janela de 24 horas.",
    };
  }

  const ultimaMensagemRecebidaEm = ultimaRecebida.created_at;
  const ultimaMensagemMs = new Date(ultimaMensagemRecebidaEm).getTime();
  const agoraMs = Date.now();

  const janelaExpiraMs = ultimaMensagemMs + JANELA_24H_EM_MS;
  const janelaExpiraEm = new Date(janelaExpiraMs).toISOString();

  const podeEnviarMensagemLivre = agoraMs <= janelaExpiraMs;

  return {
    podeEnviarMensagemLivre,
    ultimaMensagemRecebidaEm,
    janelaExpiraEm,
    motivoBloqueio: podeEnviarMensagemLivre
      ? null
      : "A janela de 24 horas foi encerrada. Para continuar, será necessário usar template do WhatsApp.",
  };
}