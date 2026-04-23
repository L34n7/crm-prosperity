import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";
};

async function getUsuarioLogado() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "Não autenticado", status: 401 as const };
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, empresa_id, status")
    .eq("auth_user_id", user.id)
    .single<UsuarioSistema>();

  if (!usuario || usuario.status !== "ativo") {
    return { error: "Usuário inválido", status: 403 as const };
  }

  return { usuario };
}

export async function POST() {
  try {
    const auth = await getUsuarioLogado();

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("provider", "meta_official")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração não encontrada." },
        { status: 404 }
      );
    }

    // 🔥 Atualiza etapa
    const { error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update({
        onboarding_etapa: "meta_conectado",
        onboarding_status: "em_andamento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integracao.id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Meta conectado (simulado com sucesso)",
    });
  } catch (error) {
    console.error("Erro conectar meta:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}