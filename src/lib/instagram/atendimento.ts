import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { EMPRESA_PILOTO_INSTAGRAM_ID } from "@/lib/instagram/config";

type InstagramWebhookEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
};
type InstagramWebhookEntry = {
  id?: string;
  messaging?: InstagramWebhookEvent[];
};

export type InstagramWebhookPayload = {
  object?: string;
  entry?: InstagramWebhookEntry[];
};

export async function processarWebhookInstagram(payload: InstagramWebhookPayload) {
  const db = getSupabaseAdmin();
  let recebidas = 0;
  let ignoradas = 0;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!entry.id) continue;
    const { data: integracao, error } = await db
      .from("integracoes_instagram")
      .select("id,empresa_id,status")
      .eq("instagram_user_id", entry.id)
      .eq("empresa_id", EMPRESA_PILOTO_INSTAGRAM_ID)
      .eq("status", "ativa")
      .maybeSingle();
    if (error) throw error;
    if (!integracao) continue;

    for (const item of entry.messaging || []) {
      const message = item.message;
      if (message?.is_echo || !item.sender?.id || !message?.mid) {
        ignoradas++;
        continue;
      }
      const tipoAnexo = message.attachments?.[0]?.type;
      const tipo = ["image", "video", "audio", "file"].includes(tipoAnexo || "")
        ? ({ image: "imagem", video: "video", audio: "audio", file: "documento" } as Record<string,string>)[tipoAnexo!]
        : message.text ? "texto" : "unsupported";
      const conteudo = message.text || message.attachments?.[0]?.payload?.url || "[Mensagem do Instagram]";
      const rawTimestamp = Number(item.timestamp);
      const timestampMs = Number.isFinite(rawTimestamp) && rawTimestamp > 0
        ? (rawTimestamp < 100_000_000_000 ? rawTimestamp * 1000 : rawTimestamp)
        : Date.now();
      const ts = new Date(timestampMs).toISOString();
      const { error: registrarError } = await db.rpc("instagram_registrar_mensagem", {
        p_integracao_id: integracao.id,
        p_sender_id: item.sender.id,
        p_mid: message.mid,
        p_conteudo: conteudo,
        p_tipo: tipo,
        p_username: null,
        p_ocorrido_em: ts,
      });
      if (registrarError) throw registrarError;
      recebidas++;
    }
  }
  return { recebidas, ignoradas };
}
