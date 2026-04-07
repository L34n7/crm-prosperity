import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assumeConversation } from "@/lib/chatbot/route-conversation";

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

function usuarioPodeAssumirConversa(
  usuario: UsuarioSistema,
  conversa: {
    empresa_id: string;
    setor_id: string | null;
    responsavel_id: string | null;
    status: string | null;
  }
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (!usuario.setor_id || conversa.setor_id !== usuario.setor_id) {
    return false;
  }

  if (conversa.status === "encerrada") {
    return false;
  }

  if (usuario.perfil === "super_admin") return true;
  if (usuario.perfil === "admin_empresa") return true;
  if (usuario.perfil === "supervisor") return true;
  if (usuario.perfil === "atendente") return true;

  return false;
}

export async function POST(
  _request: Request,
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

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, setor_id, responsavel_id, status")
    .eq("id", id)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (!conversa) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  if (!usuarioPodeAssumirConversa(usuario, conversa)) {
    return NextResponse.json(
      { ok: false, error: "Você não pode assumir esta conversa" },
      { status: 403 }
    );
  }

  const conversaAtualizada = await assumeConversation({
    conversaId: conversa.id,
    usuarioId: usuario.id,
    empresaId: conversa.empresa_id,
    setorId: conversa.setor_id,
  });

  return NextResponse.json({
    ok: true,
    message: "Conversa assumida com sucesso",
    conversa: conversaAtualizada,
  });
}