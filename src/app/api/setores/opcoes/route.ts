import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

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

    const { data: usuarioSistema, error: usuarioError } = await supabaseAdmin
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

    const empresaId = usuarioSistema.empresa_id;
    const { data: setores, error: setoresError } = await supabaseAdmin
      .from("setores")
      .select("id, nome")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("ordem_exibicao", { ascending: true })
      .order("nome", { ascending: true });

    if (setoresError) {
      throw setoresError;
    }

    const setorIds = (setores || []).map((setor) => setor.id);
    let vinculos: Array<{ usuario_id: string; setor_id: string }> = [];

    if (setorIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("usuarios_setores")
        .select("usuario_id, setor_id")
        .in("setor_id", setorIds);

      if (error) throw error;
      vinculos = data || [];
    }

    const usuarioIds = Array.from(
      new Set(vinculos.map((item) => item.usuario_id).filter(Boolean))
    );
    let usuarios: Array<{ id: string; nome: string; email: string | null }> = [];

    if (usuarioIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("usuarios")
        .select("id, nome, email")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .in("id", usuarioIds)
        .order("nome", { ascending: true });

      if (error) throw error;
      usuarios = data || [];
    }

    const setoresPorUsuario = new Map<string, string[]>();
    for (const vinculo of vinculos) {
      setoresPorUsuario.set(vinculo.usuario_id, [
        ...(setoresPorUsuario.get(vinculo.usuario_id) || []),
        vinculo.setor_id,
      ]);
    }

    return NextResponse.json({
      ok: true,
      setores: setores || [],
      atendentes: usuarios.map((usuario) => ({
        ...usuario,
        setor_ids: Array.from(
          new Set(setoresPorUsuario.get(usuario.id) || [])
        ),
      })),
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
