import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type WhatsAppConversation = {
  id: string;
  empresa_id: string;
  contato_id: string;
  integracao_whatsapp_id: string | null;
  setor_id?: string | null;
  responsavel_id?: string | null;
  status: string;
  canal: string;
  origem_atendimento: string | null;
  prioridade?: string | null;
  assunto?: string | null;
  started_at?: string | null;
  closed_at?: string | null;
  last_message_at?: string | null;
};

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
};

export async function findOrCreateWhatsAppConversation({
  empresaId,
  contatoId,
  integracaoWhatsappId,
}: FindOrCreateConversationParams): Promise<WhatsAppConversation> {
  const supabaseAdmin = getSupabaseAdmin();

  if (!empresaId) {
    throw new Error("empresaId é obrigatório para localizar/criar conversa");
  }

  if (!contatoId) {
    throw new Error("contatoId é obrigatório para localizar/criar conversa");
  }

  const { data: existingConversation, error: findError } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("contato_id", contatoId)
    .neq("status", "encerrada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `Erro ao buscar conversa existente: ${findError.message}`
    );
  }

  if (existingConversation) {
    return existingConversation as WhatsAppConversation;
  }

  const now = new Date().toISOString();

  const { data: newConversation, error: insertError } = await supabaseAdmin
    .from("conversas")
    .insert({
      empresa_id: empresaId,
      contato_id: contatoId,
      integracao_whatsapp_id: integracaoWhatsappId,
      status: "aberta",
      canal: "whatsapp",
      origem_atendimento: "entrada_cliente",
      assunto: "Atendimento iniciado via WhatsApp",
      started_at: now,
      last_message_at: now,
    })
    .select("*")
    .single();

  if (insertError || !newConversation) {
    throw new Error(
      `Erro ao criar conversa automaticamente: ${
        insertError?.message ?? "sem retorno do banco"
      }`
    );
  }

  return newConversation as WhatsAppConversation;
}