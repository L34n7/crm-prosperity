import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

  const supabaseAdmin = getSupabaseAdmin();

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
  status: "ativo" | "inativo" | "bloqueado";
  setor_id?: string | null;
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
    .select("id, empresa_id, perfil, status, setor_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<UsuarioSistema>();

  if (usuarioError) {
    return {
      error: "Erro ao buscar usuário do sistema",
      status: 500 as const,
    };
  }

  if (!usuario) {
    return {
      error: "Usuário não encontrado na tabela usuarios",
      status: 404 as const,
    };
  }

  if (usuario.status !== "ativo") {
    return {
      error: "Usuário inativo ou bloqueado",
      status: 403 as const,
    };
  }

  return { usuario };
}

function usuarioPodeAcessarConversa(
  usuario: UsuarioSistema,
  conversa: {
    empresa_id: string;
    setor_id: string | null;
    responsavel_id: string | null;
  }
) {
  if (usuario.perfil === "super_admin") return true;

  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (usuario.perfil === "admin_empresa") return true;

  if (usuario.perfil === "supervisor") {
    if (!usuario.setor_id) return false;
    return conversa.setor_id === usuario.setor_id;
  }

  if (usuario.perfil === "atendente") {
    return conversa.responsavel_id === usuario.id;
  }

  return false;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  const { data: mensagemAtual, error: mensagemAtualError } = await supabaseAdmin
    .from("mensagens")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (mensagemAtualError) {
    return NextResponse.json(
      { ok: false, error: mensagemAtualError.message },
      { status: 500 }
    );
  }

  if (!mensagemAtual) {
    return NextResponse.json(
      { ok: false, error: "Mensagem não encontrada" },
      { status: 404 }
    );
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, setor_id, responsavel_id")
    .eq("id", mensagemAtual.conversa_id)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (!conversa) {
    return NextResponse.json(
      { ok: false, error: "Conversa da mensagem não encontrada" },
      { status: 404 }
    );
  }

  if (!usuarioPodeAcessarConversa(usuario, conversa)) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar esta mensagem" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const conteudo = body?.conteudo?.trim();

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteúdo é obrigatório" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .update({
      conteudo,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Mensagem atualizada com sucesso",
    mensagem: data,
  });
}