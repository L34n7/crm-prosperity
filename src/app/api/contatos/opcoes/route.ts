import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[CONTATOS OPCOES] auth user:", user?.id || null);
    console.log("[CONTATOS OPCOES] auth error:", authError || null);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { data: usuarioSistema, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, empresa_id, status")
      .eq("auth_user_id", user.id)
      .single();

    console.log("[CONTATOS OPCOES] usuarioSistema:", usuarioSistema || null);
    console.log("[CONTATOS OPCOES] usuarioError:", usuarioError || null);

    if (usuarioError || !usuarioSistema) {
      return NextResponse.json(
        { ok: false, error: "Usuário do sistema não encontrado." },
        { status: 403 }
      );
    }

    if (usuarioSistema.status !== "ativo") {
      return NextResponse.json(
        { ok: false, error: "Usuário inativo ou bloqueado." },
        { status: 403 }
      );
    }

    console.log(
      "[CONTATOS OPCOES] empresa_id:",
      usuarioSistema.empresa_id
    );

    const { data, error } = await supabase
      .from("contatos")
      .select("origem")
      .eq("empresa_id", usuarioSistema.empresa_id)
      .not("origem", "is", null);

    console.log("[CONTATOS OPCOES] raw error:", error || null);
    console.log("[CONTATOS OPCOES] raw total:", data?.length || 0);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Erro ao buscar origens." },
        { status: 400 }
      );
    }

    // 🔥 Remove duplicados + limpa valores
    const origens = Array.from(
      new Set(
        (data || [])
          .map((item) => String(item.origem || "").trim())
          .filter((origem) => origem.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    console.log("[CONTATOS OPCOES] origens:", origens);

    return NextResponse.json({
      ok: true,
      origens,
    });
  } catch (error: any) {
    console.error("[CONTATOS OPCOES] erro interno:", error);

    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}