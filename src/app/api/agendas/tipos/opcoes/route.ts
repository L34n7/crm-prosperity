import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;
    const bloqueio = bloquearSemPermissao(usuario, "agendas.visualizar");
    if (bloqueio) return bloqueio;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agenda_tipos")
      .select("id, nome, cor, padrao")
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar tipos de agendamento: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tipos: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar tipos de agendamento.",
      },
      { status: 500 }
    );
  }
}
