import { supabaseAdmin } from "@/lib/supabase/admin";

type CreateMensagemParams = {
  empresaId: string;
  conversaId: string;
  remetenteTipo: "contato" | "bot" | "ia" | "usuario" | "sistema";
  remetenteId?: string | null;
  conteudo: string;
  tipoMensagem?: "texto" | "imagem" | "audio" | "video" | "documento" | "template" | "botao" | "lista";
  origem: "recebida" | "enviada" | "automatica";
  statusEnvio?: "pendente" | "enviada" | "entregue" | "lida" | "falha";
  mensagemExternaId?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export async function createMensagem(params: CreateMensagemParams) {
  const payload = {
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    remetente_tipo: params.remetenteTipo,
    remetente_id: params.remetenteId ?? null,
    conteudo: params.conteudo,
    tipo_mensagem: params.tipoMensagem ?? "texto",
    origem: params.origem,
    status_envio: params.statusEnvio ?? "enviada",
    mensagem_externa_id: params.mensagemExternaId ?? null,
    metadata_json: params.metadataJson ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar mensagem: ${error.message}`);
  }

  return data;
}