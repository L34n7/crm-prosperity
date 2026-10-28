import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import {
  destinoHttpSeguro,
  validarAssinaturaLink,
} from "@/lib/email-marketing/rastreamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token") || "";
  const rawDestino = params.get("url") || "";
  const assinatura = params.get("sig") || "";
  const destino = destinoHttpSeguro(rawDestino);

  if (
    !UUID_REGEX.test(token) ||
    !destino ||
    destino !== rawDestino ||
    !validarAssinaturaLink(token, destino, assinatura)
  ) {
    return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  }

  try {
    const { data: destinatario, error } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .select("id, campanha_id, email, status, enviado_em, clicado_em, provider_message_id")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (!error && destinatario && !destinatario.clicado_em) {
      const envioMs = Date.parse(String(destinatario.enviado_em || ""));
      const diferencaMs = Date.now() - envioMs;
      const proposito = [
        request.headers.get("purpose"),
        request.headers.get("sec-purpose"),
      ].filter(Boolean).join(" ").toLowerCase();
      const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
      const provavelmenteScanner =
        (Number.isFinite(diferencaMs) &&
          diferencaMs >= 0 &&
          diferencaMs < 15_000) ||
        /prefetch|prerender|preview/.test(proposito) ||
        /(?:bot|crawler|scanner|linkpreview|safelinks|proofpoint|barracuda)/.test(userAgent);

      if (!provavelmenteScanner && destinatario.status !== "suprimido") {
        const agora = new Date().toISOString();
        const status = ["enviado", "entregue", "aberto"].includes(destinatario.status)
          ? "clicado"
          : destinatario.status;

        const { data: atualizados, error: updateError } = await supabaseAdmin
          .from("email_campanha_destinatarios")
          .update({ clicado_em: agora, status, updated_at: agora })
          .eq("id", destinatario.id)
          .is("clicado_em", null)
          .select("id");

        if (!updateError && atualizados?.length) {
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
            provider_event_id: "crm-click-" + destinatario.id,
            provider_message_id: destinatario.provider_message_id || null,
            tipo: "email.clicked",
            destinatario_email: String(destinatario.email || "").toLowerCase(),
            ocorrido_em: agora,
            payload_json: { origem: "link_crm", url: destino },
          });
          await recalcularMetricasCampanhaEmail(destinatario.campanha_id);
        }
      }
    }
  } catch (error) {
    // Se a métrica falhar, o destinatário ainda acessa o link legítimo.
    console.error("[EMAIL MARKETING] Erro ao rastrear clique:", error);
  }

  return NextResponse.redirect(destino, {
    status: 302,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
