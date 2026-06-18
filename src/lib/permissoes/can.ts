import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type AssinaturaEmpresa,
  buscarAssinaturaEmpresa,
  filtrarPermissoesPorAssinatura,
} from "@/lib/assinaturas/status";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioPerfilRow = {
  perfil_empresa_id: string;
  perfis_empresa?: {
    id: string;
    empresa_id: string;
    nome: string;
    descricao?: string | null;
    ativo?: boolean;
    created_at?: string;
    updated_at?: string;
  } | null;
};

type PerfilPermissaoRow = {
  perfil_empresa_id: string;
  permissao_codigo: string;
};

type UsuarioPermissaoRow = {
  permissao_codigo: string;
  efeito: "permitir" | "bloquear";
};

type ListarPermissoesOptions = {
  empresaId?: string | null;
  assinatura?: AssinaturaEmpresa | null;
};

/**
 * Lista todas as permissoes finais do usuario:
 * permissoes herdadas dos perfis + excecoes individuais.
 */
export async function listarPermissoesDoUsuario(
  usuarioId: string,
  options: ListarPermissoesOptions = {}
) {
  let empresaId = options.empresaId;

  if (empresaId === undefined) {
    const { data: usuarioBase, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("id", usuarioId)
      .maybeSingle();

    if (usuarioError) {
      throw new Error(
        `Erro ao buscar usuario para permissoes: ${usuarioError.message}`
      );
    }

    empresaId = usuarioBase?.empresa_id ?? null;
  }

  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("usuarios_perfis")
    .select(
      `
      perfil_empresa_id,
      perfis_empresa!inner (
        id,
        empresa_id,
        nome,
        ativo
      )
    `
    )
    .eq("usuario_id", usuarioId)
    .eq("perfis_empresa.ativo", true);

  if (vinculosError) {
    throw new Error(
      `Erro ao listar vinculos de perfis do usuario: ${vinculosError.message}`
    );
  }

  const perfilEmpresaIds = [
    ...new Set(
      (vinculos ?? [])
        .map((item) => item.perfil_empresa_id)
        .filter(Boolean)
    ),
  ];
  const isAdmin = (vinculos ?? []).some((item) => {
    const perfil = Array.isArray(item.perfis_empresa)
      ? item.perfis_empresa[0]
      : item.perfis_empresa;

    return perfil?.nome === "Administrador";
  });

  const permissoes = new Set<string>();

  if (perfilEmpresaIds.length > 0) {
    const { data: perfilPermissoes, error: permissoesError } =
      await supabaseAdmin
        .from("perfil_permissoes")
        .select("perfil_empresa_id, permissao_codigo")
        .in("perfil_empresa_id", perfilEmpresaIds);

    if (permissoesError) {
      throw new Error(
        `Erro ao listar permissoes do usuario: ${permissoesError.message}`
      );
    }

    for (const item of (perfilPermissoes ?? []) as PerfilPermissaoRow[]) {
      if (item?.permissao_codigo) {
        permissoes.add(item.permissao_codigo);
      }
    }
  }

  let overrideQuery = supabaseAdmin
    .from("usuario_permissoes")
    .select("permissao_codigo, efeito")
    .eq("usuario_id", usuarioId);

  if (empresaId) {
    overrideQuery = overrideQuery.eq("empresa_id", empresaId);
  }

  const { data: usuarioPermissoes, error: usuarioPermissoesError } =
    await overrideQuery;

  if (usuarioPermissoesError) {
    throw new Error(
      `Erro ao listar excecoes de permissao do usuario: ${usuarioPermissoesError.message}`
    );
  }

  for (const item of (usuarioPermissoes ?? []) as UsuarioPermissaoRow[]) {
    if (!item?.permissao_codigo) continue;

    if (item.efeito === "permitir") {
      permissoes.add(item.permissao_codigo);
    }

    if (item.efeito === "bloquear") {
      permissoes.delete(item.permissao_codigo);
    }
  }

  const permissoesFinais = Array.from(permissoes);

  if (!empresaId) {
    return permissoesFinais;
  }

  const assinatura = Object.prototype.hasOwnProperty.call(options, "assinatura")
    ? options.assinatura ?? null
    : await buscarAssinaturaEmpresa(empresaId);

  return filtrarPermissoesPorAssinatura({
    permissoes: permissoesFinais,
    isAdmin,
    assinatura,
  });
}

/**
 * Verifica se o usuario possui uma permissao especifica.
 */
export async function can(usuarioId: string, permissaoCodigo: string) {
  const permissoes = await listarPermissoesDoUsuario(usuarioId);
  return permissoes.includes(permissaoCodigo);
}

/**
 * Lista os perfis dinamicos do usuario.
 */
export async function listarPerfisDoUsuario(usuarioId: string) {
  const { data, error } = await supabaseAdmin
    .from("usuarios_perfis")
    .select(
      `
      perfil_empresa_id,
      perfis_empresa (
        id,
        empresa_id,
        nome,
        descricao,
        ativo,
        created_at,
        updated_at
      )
    `
    )
    .eq("usuario_id", usuarioId)
    .returns<UsuarioPerfilRow[]>();

  if (error) {
    throw new Error(`Erro ao listar perfis do usuario: ${error.message}`);
  }

  return (data ?? []) as UsuarioPerfilRow[];
}
