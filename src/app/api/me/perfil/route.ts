// C:\Users\leand\Desktop\crm\src\app\api\me\perfil\route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPerfisDoUsuario } from "@/lib/permissoes/can";
import { listarSetoresDoUsuario } from "@/lib/usuarios/setores";

type PerfilBruto = {
  perfil_empresa_id?: string;
  perfis_empresa?: {
    id?: string;
    nome?: string;
  } | null;
};

type SetorVinculoBruto = {
  id?: string;
  setor_id?: string;
};

type EmpresaBruta = {
  id: string;
  nome_fantasia: string | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const supabaseAdmin = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Usuário não autenticado" },
        { status: 401 }
      );
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (usuarioError || !usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    let empresa: { id: string; nome: string | null } | null = null;

    if (usuario.empresa_id) {
      const { data: empresaData, error: empresaError } = await supabaseAdmin
        .from("empresas")
        .select("id, nome_fantasia")
        .eq("id", usuario.empresa_id)
        .maybeSingle<EmpresaBruta>();

      if (empresaError) {
        console.error("[API /me/perfil] erro ao buscar empresa:", empresaError);

        return NextResponse.json(
          { ok: false, error: empresaError.message },
          { status: 500 }
        );
      }

      empresa = empresaData
        ? {
            id: empresaData.id,
            nome: empresaData.nome_fantasia,
          }
        : null;
    }

    const perfisBrutos = (await listarPerfisDoUsuario(
      usuario.id
    )) as PerfilBruto[];

    const perfis = (perfisBrutos ?? [])
      .map((item) => ({
        id: item.perfis_empresa?.id || item.perfil_empresa_id || "",
        nome: item.perfis_empresa?.nome || "",
      }))
      .filter((item) => item.id && item.nome);

    const setoresBrutos = (await listarSetoresDoUsuario(
      usuario.id
    )) as SetorVinculoBruto[];

    const setorIds = Array.from(
      new Set(
        (setoresBrutos ?? [])
          .map((item) => item.setor_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    let setores: Array<{ id: string; nome: string }> = [];

    if (setorIds.length > 0) {
      const { data: setoresData, error: setoresError } = await supabaseAdmin
        .from("setores")
        .select("id, nome")
        .in("id", setorIds);

      if (setoresError) {
        console.error("[API /me/perfil] erro ao buscar setores:", setoresError);

        return NextResponse.json(
          { ok: false, error: setoresError.message },
          { status: 500 }
        );
      }

      setores = (setoresData ?? []).map((setor) => ({
        id: setor.id,
        nome: setor.nome,
      }));
    }

    return NextResponse.json({
      ok: true,
      data: {
        usuario,
        empresa,
        perfis,
        setores,
      },
    });
  } catch (error) {
    console.error("[API /me/perfil] erro:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar perfil" },
      { status: 500 }
    );
  }
}