import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SaveIncomingMessageParams = {
  empresaId: string;
  conversaId: string;
  conversaProtocoloId?: string | null;
  conteudo?: string | null;
  tipoMensagem?: string;
  statusEnvio?: "pendente" | "enviada" | "entregue" | "lida" | "falha";
  mensagemExternaId?: string | null;
  timestamp?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

function getConteudoPadraoPorTipo(tipoMensagem: string) {
  switch (tipoMensagem) {
    case "imagem":
      return "📷 Imagem";
    case "audio":
      return "🎵 Áudio";
    case "video":
      return "🎥 Vídeo";
    case "documento":
      return "📄 Documento";
    case "contato":
      return "👤 Contato compartilhado";
    case "botao":
      return "🔘 Botão";
    case "lista":
      return "📋 Interação de lista";
    default:
      return "Mensagem recebida";
  }
}

export async function saveIncomingWhatsAppMessage({
  empresaId,
  conversaId,
  conversaProtocoloId = null,
  conteudo = null,
  tipoMensagem = "texto",
  statusEnvio = "entregue",
  mensagemExternaId = null,
  timestamp = null,
  metadataJson = null,
}: SaveIncomingMessageParams) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!empresaId) {
    throw new Error("empresaId é obrigatório para salvar mensagem");
  }

  if (!conversaId) {
    throw new Error("conversaId é obrigatório para salvar mensagem");
  }

  const textoNormalizado = (conteudo ?? "").trim();
  const conteudoFinal =
    textoNormalizado || getConteudoPadraoPorTipo(tipoMensagem);

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
      conversa_protocolo_id: conversaProtocoloId,
      remetente_tipo: "contato",
      remetente_id: null,
      conteudo: conteudoFinal,
      tipo_mensagem: tipoMensagem,
      origem: "recebida",
      status_envio: statusEnvio,
      mensagem_externa_id: mensagemExternaId,
      metadata_json: metadataJson,
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
      last_message_at: createdAt,
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