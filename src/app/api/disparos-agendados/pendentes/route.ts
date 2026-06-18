import { NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const POLLING_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};

export async function GET() {
  try {
    const resultado = await getUsuarioBasico();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { count, error } = await supabase
      .from("automacao_agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_agendamento", "disparo_template")
      .eq("status", "pendente");

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Erro ao contar disparos pendentes." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        quantidade: count || 0,
      },
      { headers: POLLING_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao contar disparos pendentes.",
      },
      { status: 500 }
    );
  }
}
