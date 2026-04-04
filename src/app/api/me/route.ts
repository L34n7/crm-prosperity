import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          ok: false,
          etapa: "auth",
          message: "Usuário não autenticado",
          authError: authError?.message ?? null,
        },
        { status: 401 }
      );
    }

    const consulta = await supabase
      .from("usuarios")
      .select("id, nome, email, auth_user_id, perfil, empresa_id, status")
      .eq("auth_user_id", user.id);

    return NextResponse.json({
      ok: true,
      etapa: "debug",
      authUser: {
        id: user.id,
        email: user.email,
      },
      resultadoConsulta: consulta,
    });
  } catch (error) {
    console.error("Erro em /api/me:", error);

    return NextResponse.json(
      {
        ok: false,
        etapa: "catch",
        message: "Erro interno",
      },
      { status: 500 }
    );
  }
}