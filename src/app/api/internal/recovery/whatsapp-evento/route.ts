import { NextResponse } from "next/server";
import { processarWebhookWhatsappPorId } from "@/lib/whatsapp/webhook-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECOVERY_TOKEN = "Cgdru9jY08pREVrDUGe47sMzBpsizJVFw_nHwe64DHU";
const EVENTO_ID = "26119078-5804-404e-928c-32235279af54";

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("token") !== RECOVERY_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resultado = await processarWebhookWhatsappPorId(EVENTO_ID);
    return NextResponse.json({ ok: true, eventoId: EVENTO_ID, resultado });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        eventoId: EVENTO_ID,
        error: error instanceof Error ? error.message : "Erro de recuperação",
      },
      { status: 500 }
    );
  }
}
