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
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { data: usuarioSistema, error: usuarioError } = await supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("auth_user_id", user.id)
      .single();

    if (usuarioError || !usuarioSistema?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 403 }
      );
    }

    const { data: setores, error: setoresError } = await supabase
      .from("setores")
      .select("id, nome")
      .eq("empresa_id", usuarioSistema.empresa_id)
      .eq("ativo", true)
      .order("ordem_exibicao", { ascending: true })
      .order("nome", { ascending: true });

    if (setoresError) {
      throw setoresError;
    }

    return NextResponse.json({
      ok: true,
      setores: setores || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao carregar setores.",
      },
      { status: 500 }
    );
  }
}