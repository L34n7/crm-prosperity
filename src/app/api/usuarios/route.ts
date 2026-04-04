import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
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
    .select("id, empresa_id, perfil, status")
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

function podeGerenciarUsuarios(perfil: UsuarioSistema["perfil"]) {
  return perfil === "super_admin" || perfil === "admin_empresa";
}

export async function GET() {
  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarUsuarios(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar usuários" },
      { status: 403 }
    );
  }

  let query = supabaseAdmin
    .from("usuarios")
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      perfil,
      nivel,
      status,
      telefone,
      avatar_url,
      ultimo_acesso,
      empresa_id,
      setor_id,
      created_at,
      updated_at,
      setores (
        id,
        nome
      )
    `)
    .order("created_at", { ascending: false });

  if (usuario.perfil !== "super_admin") {
    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    query = query.eq("empresa_id", usuario.empresa_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    usuarios: data ?? [],
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarUsuarios(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar usuários" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const nome = body?.nome?.trim();
  const email = body?.email?.trim()?.toLowerCase();
  const perfil = body?.perfil;
  const nivel = body?.nivel || null;
  const setor_id = body?.setor_id || null;
  const telefone = body?.telefone?.trim() || null;
  const empresa_id =
    usuario.perfil === "super_admin"
      ? body?.empresa_id || usuario.empresa_id || null
      : usuario.empresa_id;

  if (usuario.perfil === "super_admin" && !empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Selecione uma empresa" },
      { status: 400 }
    );
  }

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome é obrigatório" },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Email é obrigatório" },
      { status: 400 }
    );
  }

  if (!["admin_empresa", "supervisor", "atendente"].includes(perfil)) {
    return NextResponse.json(
      { ok: false, error: "Perfil inválido" },
      { status: 400 }
    );
  }

  if (nivel && !["basico", "avancado"].includes(nivel)) {
    return NextResponse.json(
      { ok: false, error: "Nível inválido" },
      { status: 400 }
    );
  }

  if (!empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Empresa é obrigatória para criar usuário" },
      { status: 400 }
    );
  }

  if (usuario.perfil === "admin_empresa" && perfil === "admin_empresa") {
    return NextResponse.json(
      { ok: false, error: "Admin da empresa não pode criar outro admin da empresa nesta versão" },
      { status: 403 }
    );
  }

  const { data: usuarioExistente } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (usuarioExistente) {
    return NextResponse.json(
      { ok: false, error: "Já existe um usuário com esse email" },
      { status: 409 }
    );
  }

  if (setor_id) {
    const { data: setor } = await supabaseAdmin
      .from("setores")
      .select("id, empresa_id")
      .eq("id", setor_id)
      .maybeSingle();

    if (!setor) {
      return NextResponse.json(
        { ok: false, error: "Setor não encontrado" },
        { status: 404 }
      );
    }

    if (setor.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O setor não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/login`;

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        nome,
      },
    });

  if (inviteError) {
    return NextResponse.json(
      { ok: false, error: inviteError.message },
      { status: 500 }
    );
  }

  const authUserId = inviteData.user?.id;

  if (!authUserId) {
    return NextResponse.json(
      { ok: false, error: "Convite enviado, mas o auth_user_id não foi retornado" },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .insert([
      {
        empresa_id,
        setor_id,
        auth_user_id: authUserId,
        nome,
        email,
        perfil,
        nivel,
        status: "ativo",
        telefone,
      },
    ])
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      perfil,
      nivel,
      status,
      telefone,
      empresa_id,
      setor_id
    `)
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Usuário convidado com sucesso. O email de convite foi enviado.",
    usuario: data,
  });
}