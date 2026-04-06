import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SaveIncomingMessageParams = {
  empresaId: string;
  conversaId: string;
  conteudo: string;
  tipoMensagem?: string;
  statusEnvio?: string;
  mensagemExternaId?: string | null;
  timestamp?: string | null;
};

export async function saveIncomingWhatsAppMessage({
  empresaId,
  conversaId,
  conteudo,
  tipoMensagem = "texto",
  statusEnvio = "recebida",
  mensagemExternaId = null,
  timestamp = null,
}: SaveIncomingMessageParams) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!empresaId) {
    throw new Error("empresaId é obrigatório para salvar mensagem");
  }

  if (!conversaId) {
    throw new Error("conversaId é obrigatório para salvar mensagem");
  }

  const textoFinal = (conteudo ?? "").trim();

  if (!textoFinal) {
    throw new Error("Conteúdo da mensagem está vazio");
  }

  if (mensagemExternaId) {
    const { data: existingMessage, error: existingError } = await supabaseAdmin
      .from("mensagens")
      .select("id")
      .eq("mensagem_externa_id", mensagemExternaId)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Erro ao verificar duplicidade de mensagem: ${existingError.message}`
      );
    }

    if (existingMessage) {
      return {
        duplicated: true,
        messageId: existingMessage.id,
      };
    }
  }

  const createdAt =
    timestamp && !Number.isNaN(Number(timestamp))
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString();

  const { data: insertedMessage, error: insertError } = await supabaseAdmin
    .from("mensagens")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      remetente_tipo: "contato",
      remetente_id: null,
      conteudo: textoFinal,
      tipo_mensagem: tipoMensagem,
      origem: "recebida",
      status_envio: statusEnvio,
      mensagem_externa_id: mensagemExternaId,
      created_at: createdAt,
    })
    .select("id")
    .single();

  if (insertError || !insertedMessage) {
    throw new Error(
      `Erro ao inserir mensagem: ${
        insertError?.message ?? "sem retorno do banco"
      }`
    );
  }

  const { error: updateConversationError } = await supabaseAdmin
    .from("conversas")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversaId);

  if (updateConversationError) {
    throw new Error(
      `Mensagem salva, mas houve erro ao atualizar a conversa: ${updateConversationError.message}`
    );
  }

  return {
    duplicated: false,
    messageId: insertedMessage.id,
  };
}