import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export async function GET(request: Request) {
  const auth = validarChamadaCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const limite = Math.min(500, Math.max(1, Number(params.get("limit") || 200)));
  const idadeMinutos = Math.max(60, Number(params.get("idade_minutos") || 1560));

  try {
    const { data, error } = await supabase.rpc("atomopay_reconciliar_pix_pendentes", {
      p_limite: limite,
      p_idade_minutos: idadeMinutos,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, resultado: data });
  } catch (error) {
    console.error("[CRON ATOMOPAY RECONCILIAR PIX]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao reconciliar PIX." },
      { status: 500 },
    );
  }
}
