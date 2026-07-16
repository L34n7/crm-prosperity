import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarAvisosAssinatura } from "@/lib/assinaturas/processar-avisos";

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await processarAvisosAssinatura()) }); }
  catch (error) { const mensagem = error instanceof Error ? error.message : "Erro no cron de assinaturas."; console.error("[CRON ASSINATURAS]", error); return NextResponse.json({ ok: false, error: mensagem }, { status: 500 }); }
}
