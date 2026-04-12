import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeEditarUsuarios } from "@/lib/auth/authorization";
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
  nivel?: "basico" | "avancado" | null;
  setor_ids?: string[] | null;
  setor_principal_id?: string | null;
  telefone?: string | null;
  status?: "ativo" | "inativo" | "bloqueado";
  empresa_id?: string | null;
};

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
    .select("id, empresa_id, auth_user_id")
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

  const nome = body?.nome?.trim();
  const perfil_empresa_id = body?.perfil_empresa_id || null;
  const nivel = body?.nivel || null;
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

  if (nivel && !["basico", "avancado"].includes(nivel)) {
    return NextResponse.json(
      { ok: false, error: "Nível inválido" },
      { status: 400 }
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

  const { setorIds, setorPrincipalId } = normalizarSetoresEntrada(body);

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
      nivel,
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
      nivel,
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