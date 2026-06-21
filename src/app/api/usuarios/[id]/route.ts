import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  podeEditarUsuarios,
  podeRemoverUsuarios,
} from "@/lib/auth/authorization";
import { can } from "@/lib/permissoes/frontend";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  buscarSetorPrincipalDoUsuario,
  definirSetoresDoUsuario,
  listarIdsSetoresDoUsuario,
} from "@/lib/usuarios/setores";
import { definirPerfilDinamicoPorIdDoUsuario } from "@/lib/permissoes/sync-usuarios-perfis";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioPayload = {
  nome?: string;
  perfil_empresa_id?: string | null;
  setor_ids?: string[] | null;
  setor_principal_id?: string | null;
  telefone?: string | null;
  status?: "ativo" | "inativo" | "bloqueado";
};

type PerfilAuditoria = {
  id: string;
  nome: string;
};

type SetorAuditoria = {
  id: string;
  nome: string;
};

async function buscarPerfisDoUsuarioParaAuditoria(usuarioId: string) {
  const { data, error } = await supabaseAdmin
    .from("usuarios_perfis")
    .select(
      `
      perfil_empresa_id,
      perfis_empresa (
        id,
        nome
      )
    `
    )
    .eq("usuario_id", usuarioId);

  if (error) {
    throw new Error(`Erro ao buscar perfis do usuario: ${error.message}`);
  }

  return (data || []).map((item) => {
    const perfilRaw = Array.isArray(item.perfis_empresa)
      ? item.perfis_empresa[0]
      : item.perfis_empresa;

    return {
      id: item.perfil_empresa_id,
      nome: perfilRaw?.nome || item.perfil_empresa_id,
    };
  }) as PerfilAuditoria[];
}

async function buscarSetoresParaAuditoria(setorIds: string[]) {
  if (setorIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("setores")
    .select("id, nome")
    .in("id", setorIds);

  if (error) {
    throw new Error(`Erro ao buscar setores: ${error.message}`);
  }

  const setoresPorId = new Map((data || []).map((setor) => [setor.id, setor]));

  return setorIds.map((setorId) => ({
    id: setorId,
    nome: setoresPorId.get(setorId)?.nome || setorId,
  })) as SetorAuditoria[];
}

function normalizarSetoresEntrada(body: UsuarioPayload) {
  const setorIdsBrutos = Array.isArray(body?.setor_ids) ? body.setor_ids : [];
  const setorPrincipalInformado = body?.setor_principal_id ?? null;

  const setorIds = Array.from(
    new Set(
      setorIdsBrutos
        .filter(Boolean)
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );

  const setorPrincipalId =
    setorPrincipalInformado && setorIds.includes(setorPrincipalInformado)
      ? setorPrincipalInformado
      : setorIds[0] ?? null;

  return {
    setorIds,
    setorPrincipalId,
  };
}

async function validarSetoresDaEmpresa(
  empresaId: string,
  setorIds: string[]
) {
  if (setorIds.length === 0) {
    return { ok: true as const };
  }

  const { data, error } = await supabaseAdmin
    .from("setores")
    .select("id, empresa_id")
    .in("id", setorIds);

  if (error) {
    return {
      ok: false as const,
      error: `Erro ao validar setores: ${error.message}`,
      status: 500 as const,
    };
  }

  const setores = data ?? [];

  if (setores.length !== setorIds.length) {
    return {
      ok: false as const,
      error: "Um ou mais setores não foram encontrados",
      status: 404 as const,
    };
  }

  const existeSetorDeOutraEmpresa = setores.some(
    (setor) => setor.empresa_id !== empresaId
  );

  if (existeSetorDeOutraEmpresa) {
    return {
      ok: false as const,
      error: "Um ou mais setores não pertencem à empresa selecionada",
      status: 400 as const,
    };
  }

  return { ok: true as const };
}

async function perfilEhAdministrador(params: {
  empresaId: string;
  perfilEmpresaId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id, nome")
    .eq("id", params.perfilEmpresaId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar perfil: ${error.message}`);
  }

  return data?.nome === "Administrador";
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeEditarUsuarios(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar usuários" },
      { status: 403 }
    );
  }

  const { data: usuarioAlvo, error: usuarioAlvoError } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id, auth_user_id, nome, email, status, telefone")
    .eq("id", id)
    .maybeSingle();

  if (usuarioAlvoError) {
    return NextResponse.json(
      { ok: false, error: usuarioAlvoError.message },
      { status: 500 }
    );
  }

  if (!usuarioAlvo) {
    return NextResponse.json(
      { ok: false, error: "Usuário não encontrado" },
      { status: 404 }
    );
  }

  if (!usuario.empresa_id || usuarioAlvo.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar este usuário" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as UsuarioPayload;
  const auditMeta = getRequestAuditMetadata(request);
  const [setoresIdsAntes, setorPrincipalAntes, perfisAntes] = await Promise.all([
    listarIdsSetoresDoUsuario(id),
    buscarSetorPrincipalDoUsuario(id),
    buscarPerfisDoUsuarioParaAuditoria(id),
  ]);

  const nome = body?.nome?.trim();
  const perfil_empresa_id = body?.perfil_empresa_id || null;
  const telefone = body?.telefone?.trim() || null;
  const status = body?.status;

  const empresa_id = usuarioAlvo.empresa_id;

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome é obrigatório" },
      { status: 400 }
    );
  }

  if (!perfil_empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Perfil dinâmico é obrigatório" },
      { status: 400 }
    );
  }

  const promovendoAdministrador = await perfilEhAdministrador({
    empresaId: empresa_id,
    perfilEmpresaId: perfil_empresa_id,
  });

  if (
    promovendoAdministrador &&
    !can(usuario.permissoes, "usuarios.promover_admin")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem permissao para promover usuario a administrador" },
      { status: 403 }
    );
  }

  if (!["ativo", "inativo", "bloqueado"].includes(status || "")) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  if (!empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Empresa é obrigatória" },
      { status: 400 }
    );
  }

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

  const setoresEntrada = normalizarSetoresEntrada(body);
  const setorIds = promovendoAdministrador ? [] : setoresEntrada.setorIds;
  const setorPrincipalId = promovendoAdministrador
    ? null
    : setoresEntrada.setorPrincipalId;

  const validacaoSetores = await validarSetoresDaEmpresa(empresa_id, setorIds);

  if (!validacaoSetores.ok) {
    return NextResponse.json(
      { ok: false, error: validacaoSetores.error },
      { status: validacaoSetores.status }
    );
  }

  const setorPrincipalFinal = setorPrincipalId ?? null;

  const { data: usuarioAtualizado, error } = await supabaseAdmin
    .from("usuarios")
    .update({
      nome,
      telefone,
      status,
      empresa_id,
    })
    .eq("id", id)
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      status,
      telefone,
      empresa_id
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await definirSetoresDoUsuario(id, setorIds, setorPrincipalFinal);

  await definirPerfilDinamicoPorIdDoUsuario({
    usuarioId: id,
    empresaId: empresa_id,
    perfilEmpresaId: perfil_empresa_id,
  });

  const setorPrincipal = await buscarSetorPrincipalDoUsuario(id);
  const setoresIdsSalvos = await listarIdsSetoresDoUsuario(id);
  const [setoresAntes, setoresDepois, perfisDepois] = await Promise.all([
    buscarSetoresParaAuditoria(setoresIdsAntes),
    buscarSetoresParaAuditoria(setoresIdsSalvos),
    buscarPerfisDoUsuarioParaAuditoria(id),
  ]);

  await registrarLogAuditoriaSeguro({
    empresa_id,
    categoria: "usuarios",
    entidade: "usuario",
    entidade_id: id,
    acao: promovendoAdministrador
      ? "usuario_atualizado_com_perfil_admin"
      : "usuario_atualizado",
    descricao: `Usuario ${nome} atualizado`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: {
      id: usuarioAlvo.id,
      nome: usuarioAlvo.nome,
      status: usuarioAlvo.status,
      telefone: usuarioAlvo.telefone,
      perfis: perfisAntes,
      setor_principal_id: setorPrincipalAntes?.setor_id ?? null,
      setores: setoresAntes,
    },
    depois: {
      id,
      nome,
      perfis: perfisDepois,
      setor_principal_id: setorPrincipal?.setor_id ?? null,
      setores: setoresDepois,
      status,
      telefone,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: "Usuário atualizado com sucesso",
    usuario: {
      ...usuarioAtualizado,
      setor_principal_id: setorPrincipal?.setor_id ?? null,
      setor_ids: setoresIdsSalvos,
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!(await podeRemoverUsuarios(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para remover usuários" },
        { status: 403 }
      );
    }

    if (usuario.id === id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode excluir sua própria conta" },
        { status: 400 }
      );
    }

    const { data: usuarioAlvo, error: usuarioAlvoError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id, auth_user_id, nome, email, status, telefone")
      .eq("id", id)
      .maybeSingle();

    if (usuarioAlvoError) {
      return NextResponse.json(
        { ok: false, error: usuarioAlvoError.message },
        { status: 500 }
      );
    }

    if (!usuarioAlvo) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (!usuario.empresa_id || usuarioAlvo.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode excluir este usuário" },
        { status: 403 }
      );
    }

    const [setorIds, perfis] = await Promise.all([
      listarIdsSetoresDoUsuario(id),
      buscarPerfisDoUsuarioParaAuditoria(id),
    ]);
    const setores = await buscarSetoresParaAuditoria(setorIds);

    const { error: excluirUsuarioError } = await supabaseAdmin
      .from("usuarios")
      .delete()
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (excluirUsuarioError) {
      return NextResponse.json(
        { ok: false, error: `Erro ao excluir usuário: ${excluirUsuarioError.message}` },
        { status: 500 }
      );
    }

    if (usuarioAlvo.auth_user_id) {
      const { error: excluirAuthError } =
        await supabaseAdmin.auth.admin.deleteUser(usuarioAlvo.auth_user_id);

      if (excluirAuthError) {
        console.error("Erro ao excluir acesso de autenticação do usuário:", excluirAuthError);
      }
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "usuarios",
      entidade: "usuario",
      entidade_id: id,
      acao: "usuario_excluido",
      descricao: `Usuário ${usuarioAlvo.nome} excluído`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        ...usuarioAlvo,
        perfis,
        setores,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Usuário excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao excluir usuário." },
      { status: 500 }
    );
  }
}
