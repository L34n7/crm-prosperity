import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarPermissoesDoUsuario } from "@/lib/permissoes/can";
import { can } from "@/lib/permissoes/frontend";
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
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Não autenticado", status: 401 as const };
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id, empresa_id, status")
    .eq("auth_user_id", user.id)
    .single<UsuarioSistema>();

  if (usuarioError || !usuario) {
    return { error: "Usuário do sistema não encontrado.", status: 404 as const };
  }

  if (usuario.status !== "ativo") {
    return { error: "Usuário inativo.", status: 403 as const };
  }

  const permissoes = await listarPermissoesDoUsuario(usuario.id);

  return { usuario, permissoes };
}

export async function GET() {
  try {
    const auth = await getUsuarioLogado();

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario, permissoes } = auth;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (
      !can(permissoes, "whatsapp_templates.visualizar") &&
      !can(permissoes, "whatsapp_templates.criar")
    ) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para visualizar integrações WhatsApp." },
        { status: 403 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, nome_conexao, numero, status, waba_id")
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Erro ao listar integrações WhatsApp:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar integrações WhatsApp." },
      { status: 500 }
    );
  }
}