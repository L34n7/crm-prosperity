import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, nicho_id")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (empresaError) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar empresa: ${empresaError.message}` },
        { status: 500 }
      );
    }

    let nicho: {
      codigo: string;
      nome: string;
      grupo: string;
      rotulo_cadastro_singular: string | null;
      rotulo_cadastro_plural: string | null;
    } | null = null;

    if (empresa?.nicho_id) {
      const { data: nichoEncontrado, error: nichoError } = await supabase
        .from("nichos")
        .select(
          "codigo, nome, grupo, rotulo_cadastro_singular, rotulo_cadastro_plural"
        )
        .eq("id", empresa.nicho_id)
        .maybeSingle();

      if (!nichoError && nichoEncontrado) {
        nicho = nichoEncontrado;
      }
    }

    return NextResponse.json({
      ok: true,
      empresa_id: usuario.empresa_id,
      nicho,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar contexto da agenda.",
      },
      { status: 500 }
    );
  }
}
