import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type UsuarioSistema = {
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
  status: "ativo" | "inativo" | "bloqueado";
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("perfil, status")
    .eq("auth_user_id", user.id)
    .maybeSingle<UsuarioSistema>();

  if (!usuario || usuario.status !== "ativo") {
    return NextResponse.json({ ok: false, error: "Usuário inválido" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("planos")
    .select("id, nome, slug")
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    planos: data ?? [],
  });
}