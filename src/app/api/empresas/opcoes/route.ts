import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioSistema = {
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
  status: "ativo" | "inativo" | "bloqueado";
  empresa_id: string | null;
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "Não autenticado" },
      { status: 401 }
    );
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("perfil, status, empresa_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<UsuarioSistema>();

  if (!usuario || usuario.status !== "ativo") {
    return NextResponse.json(
      { ok: false, error: "Usuário inválido" },
      { status: 403 }
    );
  }

  if (usuario.perfil === "super_admin") {
    const { data, error } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia")
      .order("nome_fantasia", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      empresas: data ?? [],
    });
  }

  if (usuario.empresa_id) {
    const { data, error } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      empresas: data ? [data] : [],
    });
  }

  return NextResponse.json({
    ok: true,
    empresas: [],
  });
}