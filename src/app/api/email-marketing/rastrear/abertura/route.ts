import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PIXEL_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0,
  255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

function respostaPixel() {
  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "content-length": String(PIXEL_GIF.byteLength),
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";

  if (!UUID_REGEX.test(token)) {
    return respostaPixel();
  }

  try {
    const { data: destinatario, error } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .select(
        "id, campanha_id, email, status, aberto_em, enviado_em, provider_message_id"
      )
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (error || !destinatario || destinatario.aberto_em) {
      return respostaPixel();
    }

    const agora = new Date().toISOString();
    const instanteEnvio = Date.parse(String(destinatario.enviado_em || ""));
    const intervaloDesdeEnvio = Date.now() - instanteEnvio;
    const proposito = [
      request.headers.get("purpose"),
      request.headers.get("sec-purpose"),
      request.headers.get("x-purpose"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
    // Gate conservador: leitores e ferramentas de segurança carregam imagens
    // antes que o destinatário abra a mensagem. Não trate essa prévia como leitura.
    const carregamentoAntecipado =
      (Number.isFinite(intervaloDesdeEnvio) &&
        intervaloDesdeEnvio >= 0 &&
        intervaloDesdeEnvio < 20_000) ||
      /prefetch|prerender|preview/.test(proposito) ||
      /(?:bot|crawler|scanner|linkpreview|safelinks|proofpoint|barracuda)/.test(userAgent);

    if (carregamentoAntecipado) {
      return respostaPixel();
    }

    const statusAtual = String(destinatario.status || "");
    const novoStatus = ["enviado", "entregue"].includes(statusAtual)
      ? "aberto"
      : statusAtual;

    const { error: updateError } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .update({
        aberto_em: agora,
        status: novoStatus,
        updated_at: agora,
      })
      .eq("id", destinatario.id)
      .is("aberto_em", null);

    if (updateError) {
      console.error("[EMAIL MARKETING] Falha ao registrar abertura:", updateError);
      return respostaPixel();
    }

    const { data: campanha } = await supabaseAdmin
      .from("email_campanhas")
      .select("empresa_id")
      .eq("id", destinatario.campanha_id)
      .maybeSingle();

    await supabaseAdmin.from("email_eventos").insert({
      empresa_id: campanha?.empresa_id || null,
      campanha_id: destinatario.campanha_id,
      destinatario_id: destinatario.id,
      provider: "crm",
      provider_event_id: "crm-open-" + destinatario.id,
      provider_message_id: destinatario.provider_message_id || null,
      tipo: "email.opened",
      destinatario_email: String(destinatario.email || "").toLowerCase(),
      ocorrido_em: agora,
      payload_json: {
        origem: "pixel_crm",
      },
    });

    await recalcularMetricasCampanhaEmail(destinatario.campanha_id);
  } catch (error) {
    console.error("[EMAIL MARKETING] Erro no pixel de abertura:", error);
  }

  return respostaPixel();
}
