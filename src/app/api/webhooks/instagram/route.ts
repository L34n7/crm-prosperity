import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processarWebhookInstagram, type InstagramWebhookPayload } from "@/lib/instagram/atendimento";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("hub.mode") !== "subscribe" || !params.get("hub.challenge")) {
    return new NextResponse("Parâmetros de assinatura inválidos", { status: 400 });
  }
  const verify = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!verify || params.get("hub.verify_token") !== verify) {
    return new NextResponse("Verificação não autorizada", { status: 403 });
  }
  return new NextResponse(params.get("hub.challenge"), { status: 200 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const provided = Buffer.from(signature);
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(raw).digest("hex"));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 403 });
  }
  let payload: InstagramWebhookPayload;
  try { payload = JSON.parse(raw) as InstagramWebhookPayload; }
  catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  if (payload.object !== "instagram") return NextResponse.json({ ok: true, ignorado: true });
  try {
    const dados = await processarWebhookInstagram(payload);
    return NextResponse.json({ ok: true, ...dados });
  } catch (error) {
    console.error("[INSTAGRAM] Webhook não processado:", error);
    return NextResponse.json({ ok: false, error: "Falha temporária ao processar evento." }, { status: 503 });
  }
}
