import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

/**
 * Lista todas as permissões do usuário com base nos perfis vinculados
 */
export async function listarPermissoesDoUsuario(usuarioId: string) {
  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("usuarios_perfis")
    .select(`
      perfil_empresa_id,
      perfis_empresa!inner (
        id,
        empresa_id,
        nome,
        ativo
      )
    `)
    .eq("usuario_id", usuarioId)
    .eq("perfis_empresa.ativo", true);

  if (vinculosError) {
    throw new Error(
      `Erro ao listar vínculos de perfis do usuário: ${vinculosError.message}`
    );
  }

  const perfilEmpresaIds = [
    ...new Set(
      (vinculos ?? [])
        .map((item) => item.perfil_empresa_id)
        .filter(Boolean)
    ),
  ];

  if (perfilEmpresaIds.length === 0) {
    return [];
  }

  const { data: perfilPermissoes, error: permissoesError } = await supabaseAdmin
    .from("perfil_permissoes")
    .select("perfil_empresa_id, permissao_codigo")
    .in("perfil_empresa_id", perfilEmpresaIds);

  if (permissoesError) {
    throw new Error(
      `Erro ao listar permissões do usuário: ${permissoesError.message}`
    );
  }

  const permissoes = new Set<string>();

  for (const item of (perfilPermissoes ?? []) as PerfilPermissaoRow[]) {
    if (item?.permissao_codigo) {
      permissoes.add(item.permissao_codigo);
    }
  }

  return Array.from(permissoes);
}

/**
 * Verifica se o usuário possui uma permissão específica
 */
export async function can(usuarioId: string, permissaoCodigo: string) {
  const permissoes = await listarPermissoesDoUsuario(usuarioId);
  return permissoes.includes(permissaoCodigo);
}

/**
 * Lista os perfis dinâmicos do usuário
 */
export async function listarPerfisDoUsuario(usuarioId: string) {
  const { data, error } = await supabaseAdmin
    .from("usuarios_perfis")
    .select(`
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
    `)
    .eq("usuario_id", usuarioId)
    .returns<UsuarioPerfilRow[]>();

  if (error) {
    throw new Error(`Erro ao listar perfis do usuário: ${error.message}`);
  }

  return (data ?? []) as UsuarioPerfilRow[];
}