import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  podeCriarUsuarios,
  podeEditarUsuarios,
  podeVisualizarUsuarios,
} from "@/lib/auth/authorization";
import {
  buscarSetorPrincipalDoUsuario,
  definirSetoresDoUsuario,
  listarIdsSetoresDoUsuario,
} from "@/lib/usuarios/setores";
import { definirPerfilDinamicoPorIdDoUsuario } from "@/lib/permissoes/sync-usuarios-perfis";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioPayload = {
  nome?: string;
  email?: string;
  perfil_empresa_id?: string | null;
  nivel?: "basico" | "avancado" | null;
  setor_ids?: string[] | null;
  setor_principal_id?: string | null;
  telefone?: string | null;
};

type PerfilDinamicoRow = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioPerfilRow = {
  perfil_empresa_id: string;
  perfis_empresa: PerfilDinamicoRow | PerfilDinamicoRow[] | null;
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

async function validarSetoresDaEmpresa(empresaId: string, setorIds: string[]) {
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

function normalizarPerfisDinamicos(rows: UsuarioPerfilRow[] | null | undefined) {
  return (rows ?? [])
    .map((item) => {
      const perfil = Array.isArray(item.perfis_empresa)
        ? item.perfis_empresa[0]
        : item.perfis_empresa;

      if (!perfil) return null;

      return {
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao ?? null,
        ativo: perfil.ativo,
      };
    })
    .filter(Boolean);
}

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  

  if (!(await podeVisualizarUsuarios(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar usuários" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      nivel,
      status,
      telefone,
      avatar_url,
      ultimo_acesso,
      empresa_id,
      created_at,
      updated_at
    `)
    .eq("status", "ativo")
    .eq("empresa_id", usuario.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const usuariosBase = data ?? [];

  const usuariosEnriquecidos = await Promise.all(
    usuariosBase.map(async (item) => {
      const [setoresIds, setorPrincipal, perfisUsuarioResult] = await Promise.all([
        listarIdsSetoresDoUsuario(item.id),
        buscarSetorPrincipalDoUsuario(item.id),
        supabaseAdmin
          .from("usuarios_perfis")
          .select(`
            perfil_empresa_id,
            perfis_empresa (
              id,
              nome,
              descricao,
              ativo
            )
          `)
          .eq("usuario_id", item.id),
      ]);

      const perfis_dinamicos = normalizarPerfisDinamicos(
        (perfisUsuarioResult.data ?? []) as UsuarioPerfilRow[]
      );

      return {
        ...item,
        setor_principal_id: setorPrincipal?.setor_id ?? null,
        setor_ids: setoresIds,
        usuarios_setores: setoresIds.map((setorId) => ({
          usuario_id: item.id,
          setor_id: setorId,
        })),
        perfis_dinamicos,
        perfil_dinamico_principal: perfis_dinamicos[0] ?? null,
      };
    })
  );

  const usuarioPodeEditarOutros = await podeEditarUsuarios(usuario);

  const usuariosFiltrados = usuarioPodeEditarOutros
    ? usuariosEnriquecidos
    : usuariosEnriquecidos.filter((item) => item.id === usuario.id);

  return NextResponse.json({
    ok: true,
    usuarios: usuariosFiltrados,
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeCriarUsuarios(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar usuários" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as UsuarioPayload;

  const nome = body?.nome?.trim();
  const email = body?.email?.trim()?.toLowerCase();
  const perfil_empresa_id = body?.perfil_empresa_id || null;
  const nivel = body?.nivel || null;
  const telefone = body?.telefone?.trim() || null;

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

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", usuario.empresa_id)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  const { setorIds, setorPrincipalId } = normalizarSetoresEntrada(body);

  const validacaoSetores = await validarSetoresDaEmpresa(
    usuario.empresa_id,
    setorIds
  );

  if (!validacaoSetores.ok) {
    return NextResponse.json(
      { ok: false, error: validacaoSetores.error },
      { status: validacaoSetores.status }
    );
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/login`;

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
      {
        ok: false,
        error: "Convite enviado, mas o auth_user_id não foi retornado",
      },
      { status: 500 }
    );
  }

  const setorPrincipalFinal = setorPrincipalId ?? null;

  const { data: novoUsuario, error } = await supabaseAdmin
    .from("usuarios")
    .insert([
      {
        empresa_id: usuario.empresa_id,
        auth_user_id: authUserId,
        nome,
        email,
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
      nivel,
      status,
      telefone,
      empresa_id
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

  await definirSetoresDoUsuario(novoUsuario.id, setorIds, setorPrincipalFinal);

  await definirPerfilDinamicoPorIdDoUsuario({
    usuarioId: novoUsuario.id,
    empresaId: usuario.empresa_id,
    perfilEmpresaId: perfil_empresa_id,
  });

  const setorIdsSalvos = await listarIdsSetoresDoUsuario(novoUsuario.id);

  return NextResponse.json({
    ok: true,
    message: "Usuário convidado com sucesso. O email de convite foi enviado.",
    usuario: {
      ...novoUsuario,
      setor_ids: setorIdsSalvos,
      setor_principal_id: setorPrincipalFinal,
    },
  });
}