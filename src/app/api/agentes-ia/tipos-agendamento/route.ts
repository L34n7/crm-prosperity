import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  try {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const empresaId = resultado.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("agenda_tipos")
      .select("id, nome, cor, padrao")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .order("nome", { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      tipos: data || [],
    });
  } catch (error) {
    console.error("[AGENTES_IA_TIPOS_AGENDAMENTO] GET:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar tipos de agendamento.",
      },
      { status: 500 }
    );
  }
}
