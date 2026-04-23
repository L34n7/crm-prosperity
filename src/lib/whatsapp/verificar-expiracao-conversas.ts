import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function encerrarConversasExpiradas(empresaId: string) {
  const agora = new Date();

  // pega conversas abertas
  const { data: conversas } = await supabaseAdmin
    .from("conversas")
    .select("id, last_message_at, status, closed_at")
    .eq("empresa_id", empresaId)
    .is("closed_at", null);

  if (!conversas?.length) return;

  for (const conversa of conversas) {
    if (!conversa.last_message_at) continue;

    const ultimaMsg = new Date(conversa.last_message_at);
    const diffHoras =
      (agora.getTime() - ultimaMsg.getTime()) / (1000 * 60 * 60);

    // 🔥 regra da Meta (24h)
    if (diffHoras > 24) {
      const agoraISO = new Date().toISOString();

      // encerra conversa
      await supabaseAdmin
        .from("conversas")
        .update({
          status: "encerrada",
          closed_at: agoraISO,
          updated_at: agoraISO,
        })
        .eq("id", conversa.id);

      // fecha protocolo
      await supabaseAdmin
        .from("conversa_protocolos")
        .update({
          ativo: false,
          closed_at: agoraISO,
          updated_at: agoraISO,
        })
        .eq("conversa_id", conversa.id)
        .eq("ativo", true);
    }
  }
}