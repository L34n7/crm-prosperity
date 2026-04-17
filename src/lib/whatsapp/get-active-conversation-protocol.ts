import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ActiveConversationProtocol = {
  id: string;
  empresa_id: string;
  conversa_id: string;
  protocolo: string;
  tipo: string | null;
  ativo: boolean;
  started_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function getActiveConversationProtocol(conversaId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!conversaId) {
    throw new Error("conversaId é obrigatório para buscar protocolo ativo");
  }

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("*")
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar protocolo ativo da conversa: ${error.message}`
    );
  }

  if (!data) {
    throw new Error("Nenhum protocolo ativo encontrado para a conversa");
  }

  return data as ActiveConversationProtocol;
}