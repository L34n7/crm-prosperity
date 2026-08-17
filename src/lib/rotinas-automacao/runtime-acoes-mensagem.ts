import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";

const supabase = getSupabaseAdmin();

export async function enviarMensagemRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  acaoId: string;
  config: Record<string, unknown>;
}) {
  const conteudo = String(params.config.mensagem || "").trim();
  if (!conteudo) {
    throw new Error("A ação Enviar mensagem precisa de um texto.");
  }

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id,contato_id,integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (conversaError) throw conversaError;
  if (!conversa) {
    throw new Error("Conversa não encontrada para envio da mensagem.");
  }
  if (!conversa.contato_id) {
    throw new Error("A conversa não possui contato vinculado.");
  }
  if (!conversa.integracao_whatsapp_id) {
    throw new Error("A conversa não possui integração WhatsApp vinculada.");
  }

  const [protocoloResult, contatoResult, integracaoResult] = await Promise.all([
    supabase
      .from("conversa_protocolos")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("ativo", true)
      .maybeSingle(),
    supabase
      .from("contatos")
      .select("id,telefone")
      .eq("empresa_id", params.empresaId)
      .eq("id", conversa.contato_id)
      .maybeSingle(),
    supabase
      .from("integracoes_whatsapp")
      .select("id,status,phone_number_id,token_ref,config_json")
      .eq("empresa_id", params.empresaId)
      .eq("id", conversa.integracao_whatsapp_id)
      .maybeSingle(),
  ]);

  if (protocoloResult.error) throw protocoloResult.error;
  if (contatoResult.error) throw contatoResult.error;
  if (integracaoResult.error) throw integracaoResult.error;

  const protocolo = protocoloResult.data;
  const contato = contatoResult.data;
  const integracao = integracaoResult.data;

  if (!protocolo) {
    throw new Error("Nenhum protocolo ativo encontrado para esta conversa.");
  }
  if (!contato?.telefone) throw new Error("Contato sem telefone válido.");
  if (!integracao) throw new Error("Integração WhatsApp não encontrada.");
  if (integracao.status !== "ativa") {
    throw new Error("A integração WhatsApp está inativa.");
  }

  const phoneNumberId = String(
    integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  ).trim();
  const accessToken = getWhatsAppAccessToken(integracao);
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado.");
  }
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");

  const janela24h = await canSendFreeformWhatsAppMessage({
    conversaId: params.conversaId,
  });
  if (!janela24h.podeEnviarMensagemLivre) {
    throw new Error(
      janela24h.motivoBloqueio ||
        "A janela de 24h do WhatsApp está fechada.",
    );
  }

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId,
    accessToken,
    to: contato.telefone,
    body: conteudo,
  });
  if (!envio.ok) {
    throw new Error(envio.error || "Falha ao enviar mensagem ao WhatsApp.");
  }

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({
      empresa_id: params.empresaId,
      conversa_id: params.conversaId,
      conversa_protocolo_id: protocolo.id,
      remetente_tipo: "bot",
      remetente_id: null,
      conteudo,
      tipo_mensagem: "texto",
      tipo_original_meta: "text",
      origem: "automatica",
      status_envio: "enviada",
      mensagem_externa_id: envio.messageId,
      metadata_json: {
        tipo_original_whatsapp: "text",
        rotina_automacao: {
          automacao_id: params.automacaoId,
          execucao_id: params.execucaoId,
          acao_id: params.acaoId,
        },
        whatsapp: {
          phone_number_id: phoneNumberId,
          destino: contato.telefone,
          janela_24h: {
            ultima_mensagem_recebida_em: janela24h.ultimaMensagemRecebidaEm,
            expira_em: janela24h.janelaExpiraEm,
          },
          envio_meta: envio.raw,
        },
      },
      automacao_execucao_id: null,
      automacao_no_id: null,
    })
    .select("id,status_envio,mensagem_externa_id")
    .single();
  if (mensagemError) throw mensagemError;

  const { error: conversaUpdateError } = await supabase
    .from("conversas")
    .update({ last_message_at: new Date().toISOString() })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);
  if (conversaUpdateError) throw conversaUpdateError;

  return {
    mensagem_id: mensagem.id,
    mensagem_externa_id: mensagem.mensagem_externa_id,
    status_envio: mensagem.status_envio,
  };
}
