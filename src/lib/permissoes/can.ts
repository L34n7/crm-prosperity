import {
  getOrSetTtlCache,
  getTtlCacheKey,
  invalidateTtlCache,
  invalidateTtlCachePrefix,
} from "@/lib/cache/ttl-cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type AssinaturaEmpresa,
  buscarAssinaturaEmpresa,
  filtrarPermissoesPorAssinatura,
} from "@/lib/assinaturas/status";

const supabaseAdmin = getSupabaseAdmin();
const USUARIO_EMPRESA_CACHE_TTL_MS = 30_000;
const USUARIO_PERFIS_CACHE_TTL_MS = 30_000;
const PERFIL_PERMISSOES_CACHE_TTL_MS = 30_000;
const USUARIO_PERMISSOES_CACHE_TTL_MS = 30_000;

type PerfilEmpresaRow = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type UsuarioPerfilRow = {
  perfil_empresa_id: string;
  perfis_empresa?: PerfilEmpresaRow | PerfilEmpresaRow[] | null;
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
  perfis?: UsuarioPerfilRow[] | null;
};

export function invalidarCachePermissoesUsuario(usuarioId: string) {
  invalidateTtlCache(getTtlCacheKey("usuario-empresa", [usuarioId]));
  invalidateTtlCache(getTtlCacheKey("usuario-perfis", [usuarioId]));
  invalidateTtlCache(getTtlCacheKey("usuario-perfis-ativos", [usuarioId]));
  invalidateTtlCachePrefix(getTtlCacheKey("usuario-permissoes", [usuarioId]));
}

export function invalidarCachePermissoesPerfis() {
  invalidateTtlCachePrefix(getTtlCacheKey("perfil-permissoes"));
}

function normalizarPerfilEmpresa(
  perfil: UsuarioPerfilRow["perfis_empresa"]
) {
  return Array.isArray(perfil) ? perfil[0] : perfil;
}

async function buscarEmpresaIdDoUsuario(usuarioId: string) {
  return await getOrSetTtlCache(
    getTtlCacheKey("usuario-empresa", [usuarioId]),
    USUARIO_EMPRESA_CACHE_TTL_MS,
    async () => {
      const { data: usuarioBase, error: usuarioError } = await supabaseAdmin
        .from("usuarios")
        .select("id, empresa_id")
        .eq("id", usuarioId)
        .maybeSingle<{ id: string; empresa_id: string | null }>();

      if (usuarioError) {
        throw new Error(
          `Erro ao buscar usuario para permissoes: ${usuarioError.message}`
        );
      }

      return usuarioBase?.empresa_id ?? null;
    }
  );
}

async function listarPerfisAtivosDoUsuario(usuarioId: string) {
  return await getOrSetTtlCache(
    getTtlCacheKey("usuario-perfis-ativos", [usuarioId]),
    USUARIO_PERFIS_CACHE_TTL_MS,
    async () => {
      const { data, error } = await supabaseAdmin
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
        .eq("perfis_empresa.ativo", true)
        .returns<UsuarioPerfilRow[]>();

      if (error) {
        throw new Error(
          `Erro ao listar vinculos de perfis do usuario: ${error.message}`
        );
      }

      return (data ?? []) as UsuarioPerfilRow[];
    }
  );
}

async function listarPermissoesDosPerfis(perfilEmpresaIds: string[]) {
  const idsOrdenados = Array.from(new Set(perfilEmpresaIds.filter(Boolean))).sort();

  if (idsOrdenados.length === 0) {
    return [];
  }

  return await getOrSetTtlCache(
    getTtlCacheKey("perfil-permissoes", [idsOrdenados.join(",")]),
    PERFIL_PERMISSOES_CACHE_TTL_MS,
    async () => {
      const { data, error } = await supabaseAdmin
        .from("perfil_permissoes")
        .select("perfil_empresa_id, permissao_codigo")
        .in("perfil_empresa_id", idsOrdenados);

      if (error) {
        throw new Error(`Erro ao listar permissoes do usuario: ${error.message}`);
      }

      return (data ?? []) as PerfilPermissaoRow[];
    }
  );
}

async function listarPermissoesIndividuaisDoUsuario(
  usuarioId: string,
  empresaId: string | null
) {
  return await getOrSetTtlCache(
    getTtlCacheKey("usuario-permissoes", [usuarioId, empresaId ?? "todas"]),
    USUARIO_PERMISSOES_CACHE_TTL_MS,
    async () => {
      let query = supabaseAdmin
        .from("usuario_permissoes")
        .select("permissao_codigo, efeito")
        .eq("usuario_id", usuarioId);

      if (empresaId) {
        query = query.eq("empresa_id", empresaId);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(
          `Erro ao listar excecoes de permissao do usuario: ${error.message}`
        );
      }

      return (data ?? []) as UsuarioPermissaoRow[];
    }
  );
}

/**
 * Lista todas as permissoes finais do usuario:
 * permissoes herdadas dos perfis + excecoes individuais.
 */
export async function listarPermissoesDoUsuario(
  usuarioId: string,
  options: ListarPermissoesOptions = {}
) {
  const empresaId =
    options.empresaId === undefined
      ? await buscarEmpresaIdDoUsuario(usuarioId)
      : options.empresaId;

  const vinculosFonte =
    options.perfis ?? (await listarPerfisAtivosDoUsuario(usuarioId));
  const vinculos = (vinculosFonte ?? []).filter((item) => {
    const perfil = normalizarPerfilEmpresa(item.perfis_empresa);
    return !!perfil && perfil.ativo !== false;
  });

  const perfilEmpresaIds = [
    ...new Set(vinculos.map((item) => item.perfil_empresa_id).filter(Boolean)),
  ];
  const isAdmin = vinculos.some((item) => {
    const perfil = normalizarPerfilEmpresa(item.perfis_empresa);
    return perfil?.nome === "Administrador";
  });

  const [perfilPermissoes, usuarioPermissoes] = await Promise.all([
    listarPermissoesDosPerfis(perfilEmpresaIds),
    listarPermissoesIndividuaisDoUsuario(usuarioId, empresaId ?? null),
  ]);

  const permissoes = new Set<string>();

  for (const item of perfilPermissoes) {
    if (item?.permissao_codigo) {
      permissoes.add(item.permissao_codigo);
    }
  }

  for (const item of usuarioPermissoes) {
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
  return await getOrSetTtlCache(
    getTtlCacheKey("usuario-perfis", [usuarioId]),
    USUARIO_PERFIS_CACHE_TTL_MS,
    async () => {
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
  );
}
