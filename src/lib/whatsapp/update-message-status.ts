import { getSupabaseAdmin } from "@/lib/supabase/admin";

type UpdateMessageStatusParams = {
  mensagemExternaId: string;
  status: "enviada" | "entregue" | "lida" | "falha";
  timestamp?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ORDEM_STATUS: Record<string, number> = {
  pendente: 0,
  enviada: 1,
  entregue: 2,
  lida: 3,
  falha: 99,
};

export async function updateWhatsAppMessageStatus({
  mensagemExternaId,
  status,
  timestamp = null,
  metadata = null,
}: UpdateMessageStatusParams) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!mensagemExternaId) {
    throw new Error("mensagemExternaId é obrigatório");
  }

  const { data: mensagemAtual, error: findError } = await supabaseAdmin
    .from("mensagens")
    .select("id, status_envio, metadata_json")
    .eq("mensagem_externa_id", mensagemExternaId)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Erro ao localizar mensagem: ${findError.message}`);
  }

  if (!mensagemAtual) {
    return {
      updated: false,
      found: false,
      reason: "Mensagem não encontrada pelo mensagem_externa_id",
    };
  }

  const statusAtual = mensagemAtual.status_envio || "pendente";
  const ordemAtual = ORDEM_STATUS[statusAtual] ?? 0;
  const ordemNova = ORDEM_STATUS[status] ?? 0;

  const deveAtualizar =
    status === "falha" || ordemNova >= ordemAtual;

  if (!deveAtualizar) {
    return {
      updated: false,
      found: true,
      reason: "Status recebido é anterior ao status atual",
      messageId: mensagemAtual.id,
    };
  }

    const metadataAtual: Record<string, unknown> =
        mensagemAtual.metadata_json &&
        typeof mensagemAtual.metadata_json === "object"
            ? (mensagemAtual.metadata_json as Record<string, unknown>)
            : {};

    const whatsappStatusAnterior =
    metadataAtual &&
    typeof metadataAtual === "object" &&
    "whatsapp_status" in metadataAtual &&
    metadataAtual.whatsapp_status &&
    typeof metadataAtual.whatsapp_status === "object"
        ? metadataAtual.whatsapp_status
        : {};

    const metadataFinal = {
    ...metadataAtual,
    whatsapp_status: {
        ...whatsappStatusAnterior,
        ultimo_status: status,
        atualizado_em_webhook: new Date().toISOString(),
        timestamp_evento_whatsapp: timestamp,
        ...(metadata ?? {}),
    },
    };

  const { error: updateError } = await supabaseAdmin
    .from("mensagens")
    .update({
      status_envio: status,
      metadata_json: metadataFinal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mensagemAtual.id);

  if (updateError) {
    throw new Error(`Erro ao atualizar status da mensagem: ${updateError.message}`);
  }

  return {
    updated: true,
    found: true,
    messageId: mensagemAtual.id,
    status,
  };
}