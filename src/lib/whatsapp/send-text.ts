import { supabaseAdmin } from "@/lib/supabase/admin";

type SendWhatsAppTextMessageParams = {
  integracaoId: string;
  to: string;
  text: string;
};

type IntegracaoWhatsApp = {
  id: string;
  token_acesso: string | null;
  phone_number_id: string | null;
  status: string | null;
};

type SendWhatsAppTextMessageResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  mensagemExternaId?: string | null;
};

async function getIntegracaoWhatsApp(
  integracaoId: string
): Promise<IntegracaoWhatsApp | null> {
  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, token_acesso, phone_number_id, status")
    .eq("id", integracaoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar integração WhatsApp: ${error.message}`);
  }

  return data;
}

export async function sendWhatsAppTextMessage(
  params: SendWhatsAppTextMessageParams
): Promise<SendWhatsAppTextMessageResult> {
  const integracao = await getIntegracaoWhatsApp(params.integracaoId);

  if (!integracao) {
    return {
      ok: false,
      error: "Integração WhatsApp não encontrada.",
      mensagemExternaId: null,
    };
  }

  if (!integracao.token_acesso || !integracao.phone_number_id) {
    return {
      ok: false,
      error: "Integração WhatsApp sem token_acesso ou phone_number_id.",
      mensagemExternaId: null,
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${integracao.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integracao.token_acesso}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: {
          body: params.text,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      error:
        data?.error?.message ||
        "Erro desconhecido ao enviar mensagem para o WhatsApp.",
      data,
      mensagemExternaId: null,
    };
  }

  return {
    ok: true,
    data,
    mensagemExternaId: data?.messages?.[0]?.id ?? null,
  };
}