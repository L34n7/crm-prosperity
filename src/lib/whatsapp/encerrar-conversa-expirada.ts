import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type EncerrarConversaExpiradaParams = {
  conversaId: string;
  motivo?: string;
};

export async function encerrarConversaExpirada({
  conversaId,
  motivo = "janela_24h_expirada",
}: EncerrarConversaExpiradaParams) {
  const agora = new Date().toISOString();

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, status, closed_at")
    .eq("id", conversaId)
    .maybeSingle();

  if (conversaError) {
    throw new Error(conversaError.message);
  }

  if (!conversa) {
    throw new Error("Conversa não encontrada.");
  }

  if (conversa.status === "encerrado_24h" && conversa.closed_at) {
    return;
  }

  const { error: conversaUpdateError } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "encerrado_24h",
      closed_at: agora,
      updated_at: agora,
    })
    .eq("id", conversaId);

  if (conversaUpdateError) {
    throw new Error(conversaUpdateError.message);
  }

  const { error: protocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      closed_at: agora,
      updated_at: agora,
    })
    .eq("conversa_id", conversaId)
    .eq("ativo", true);

  if (protocoloError) {
    throw new Error(protocoloError.message);
  }

  await supabaseAdmin.from("mensagens").insert([
    {
      empresa_id: conversa.empresa_id,
      conversa_id: conversaId,
      conteudo: `Conversa encerrada automaticamente: ${motivo}.`,
      tipo_mensagem: "texto",
      origem: "automatica",
      remetente_tipo: "sistema",
      status_envio: "lida",
    },
  ]);
}