import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status },
      );
    }

    const { usuario } = resultado;
    const bloqueio = bloquearSemPermissao(usuario, "agendas.visualizar");
    if (bloqueio) return bloqueio;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, email, status")
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "ativo")
      .order("nome", { ascending: true, nullsFirst: false })
      .order("email", { ascending: true, nullsFirst: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar usuários da empresa: ${error.message}`,
        },
        { status: 500 },
      );
    }

    const responsaveis = (data || []).map((item) => ({
      id: item.id,
      nome:
        String(item.nome || "").trim() ||
        String(item.email || "").trim() ||
        "Usuário",
      email: item.email || null,
    }));

    return NextResponse.json(
      {
        ok: true,
        responsaveis,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar responsáveis.",
      },
      { status: 500 },
    );
  }
}
