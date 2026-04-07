import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FluxoEtapa } from "@/lib/chatbot/types";

export type WhatsAppConversation = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status:
    | "aberta"
    | "bot"
    | "fila"
    | "em_atendimento"
    | "aguardando_cliente"
    | "encerrada"
    | null;
  canal: string | null;
  origem_atendimento: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente" | null;
  assunto: string | null;
  started_at: string | null;
  last_message_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;

  bot_ativo: boolean;
  fluxo_etapa: FluxoEtapa;
  menu_aguardando_resposta: boolean;
  ultima_opcao_escolhida: string | null;
  tentativas_invalidas: number;
  ultima_interacao_bot_em: string | null;
  automacao_id: string | null;
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

  if (!integracaoWhatsappId) {
    throw new Error(
      "integracaoWhatsappId é obrigatório para localizar/criar conversa"
    );
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
      setor_id: null,
      responsavel_id: null,
      integracao_whatsapp_id: integracaoWhatsappId,
      status: "aberta",
      canal: "whatsapp",
      origem_atendimento: "entrada_cliente",
      prioridade: "media",
      assunto: "Atendimento iniciado via WhatsApp",
      started_at: now,
      last_message_at: now,
      closed_at: null,

      bot_ativo: false,
      fluxo_etapa: null,
      menu_aguardando_resposta: false,
      ultima_opcao_escolhida: null,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: null,
      automacao_id: null,
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