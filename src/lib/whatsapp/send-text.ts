import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SendWhatsAppTextMessageParams = {
  integracaoId: string;
  to: string;
  text: string;
};

type IntegracaoWhatsAppRow = {
  id: string;
  phone_number_id: string | null;
  status: string | null;
  token_ref: string | null;
};

type SendWhatsAppTextMessageResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  mensagemExternaId?: string | null;
};

async function getIntegracaoWhatsApp(
  integracaoId: string
): Promise<IntegracaoWhatsAppRow | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, phone_number_id, status, token_ref")
    .eq("id", integracaoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar integração WhatsApp: ${error.message}`);
  }

  return data as IntegracaoWhatsAppRow | null;
}

function getAccessTokenFromEnv(tokenRef: string | null): string | null {
  if (!tokenRef) return null;

  const token = process.env[tokenRef];
  return token ?? null;
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

  const token = getAccessTokenFromEnv(integracao.token_ref);

  if (!token) {
    return {
      ok: false,
      error: `Token não encontrado nas variáveis de ambiente para token_ref=${integracao.token_ref}`,
      mensagemExternaId: null,
    };
  }

  if (!integracao.phone_number_id) {
    return {
      ok: false,
      error: "Integração WhatsApp sem phone_number_id.",
      mensagemExternaId: null,
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${integracao.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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