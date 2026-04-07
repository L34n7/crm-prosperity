import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ConversaAutomacaoEstado } from "@/lib/chatbot/types";

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string | null;
};

type ConversaRow = ConversaAutomacaoEstado & {
  contato_id?: string;
  integracao_whatsapp_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function findConversationByContato(params: {
  empresaId: string;
  contatoId: string;
}): Promise<ConversaRow | null> {
  const { data, error } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar conversa: ${error.message}`);
  }

  return data as ConversaRow | null;
}

export async function createConversation(
  params: FindOrCreateConversationParams
): Promise<ConversaRow> {
  const payload = {
    empresa_id: params.empresaId,
    contato_id: params.contatoId,
    integracao_whatsapp_id: params.integracaoWhatsappId,
    setor_id: null,
    responsavel_id: null,
    status: "bot",
    canal: "whatsapp",
    origem_atendimento: "entrada_cliente",
    prioridade: "media",
    assunto: null,
    started_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
    closed_at: null,
    bot_ativo: false,
    fluxo_etapa: null,
    menu_aguardando_resposta: false,
    ultima_opcao_escolhida: null,
    tentativas_invalidas: 0,
    ultima_interacao_bot_em: null,
    automacao_id: null,
  };

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao criar conversa: ${error.message}`);
  }

  return data as ConversaRow;
}

export async function findOrCreateConversation(
  params: FindOrCreateConversationParams
): Promise<{ conversa: ConversaRow; isNovaConversa: boolean }> {
  const conversaExistente = await findConversationByContato({
    empresaId: params.empresaId,
    contatoId: params.contatoId,
  });

  if (conversaExistente) {
    return {
      conversa: conversaExistente,
      isNovaConversa: false,
    };
  }

  const conversaNova = await createConversation(params);

  return {
    conversa: conversaNova,
    isNovaConversa: true,
  };
}

export async function updateConversationAutomationState(params: {
  conversaId: string;
  updates: Partial<ConversaAutomacaoEstado> & {
    status?: "aberta" | "bot" | "fila" | "em_atendimento" | "aguardando_cliente" | "encerrada" | null;
    setor_id?: string | null;
    responsavel_id?: string | null;
  };
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("conversas")
    .update(params.updates)
    .eq("id", params.conversaId);

  if (error) {
    throw new Error(`Erro ao atualizar conversa: ${error.message}`);
  }
}