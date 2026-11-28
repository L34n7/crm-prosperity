import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CanSendMessageResult } from "@/lib/whatsapp/can-send-message";

const LIMITE_MS = 24 * 60 * 60 * 1000;

export async function verificarJanelaInstagram(conversaId: string): Promise<CanSendMessageResult> {
  const { data, error } = await getSupabaseAdmin().from("mensagens")
    .select("created_at").eq("conversa_id", conversaId)
    .eq("origem", "recebida").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a janela de Direct do Instagram.");
  const ultima = data?.created_at || null;
  const expira = ultima ? new Date(new Date(ultima).getTime() + LIMITE_MS).toISOString() : null;
  const aberta = !!expira && Date.now() <= new Date(expira).getTime();
  return {
    podeEnviarMensagemLivre: aberta,
    ultimaMensagemRecebidaEm: ultima,
    janelaExpiraEm: expira,
    motivoBloqueio: aberta ? null : "Não é possível enviar Direct fora da janela de atendimento do Instagram.",
  };
}
