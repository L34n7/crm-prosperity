import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  findOrCreateWhatsAppConversation as findOrCreateWhatsAppConversationCore,
  type WhatsAppConversation,
} from "./find-or-create-conversation-core";

export type { WhatsAppConversation } from "./find-or-create-conversation-core";

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
};

const STATUS_ENCERRADOS = new Set([
  "encerrada",
  "encerrado_manual",
  "encerrado_24h",
  "encerrado_aut",
]);

async function buscarAtendimentoBusinessAppEncerrado(
  params: FindOrCreateConversationParams
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("conversas")
    .select(
      "id, status, setor_id, escopo_fila, responsavel_id, origem_atendimento"
    )
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .eq("canal", "whatsapp")
    .eq("origem_atendimento", "whatsapp_business_app")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar atendimento do WhatsApp Business: ${error.message}`
    );
  }

  if (!data || !STATUS_ENCERRADOS.has(String(data.status || ""))) return null;
  return data;
}

export async function findOrCreateWhatsAppConversation(
  params: FindOrCreateConversationParams
): Promise<WhatsAppConversation> {
  const atendimentoBusinessApp =
    await buscarAtendimentoBusinessAppEncerrado(params);

  const conversa = await findOrCreateWhatsAppConversationCore(params);
  if (!atendimentoBusinessApp || conversa.id !== atendimentoBusinessApp.id) {
    return conversa;
  }

  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();
  const { data: conversaHumana, error } = await supabase
    .from("conversas")
    .update({
      setor_id: atendimentoBusinessApp.setor_id || null,
      escopo_fila: atendimentoBusinessApp.escopo_fila || "geral",
      responsavel_id: atendimentoBusinessApp.responsavel_id || null,
      status: "em_atendimento",
      origem_atendimento: "whatsapp_business_app",
      bot_ativo: false,
      aguardando_atendente: false,
      agente_ia_id: null,
      agente_ia_protocolo_id: null,
      agente_ia_fallback_ativo: false,
      closed_at: null,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", conversa.id)
    .select("*")
    .single();

  if (error || !conversaHumana) {
    throw new Error(
      `Erro ao preservar atendimento do WhatsApp Business na reabertura: ${
        error?.message || "sem retorno do banco"
      }`
    );
  }

  return conversaHumana as WhatsAppConversation;
}
