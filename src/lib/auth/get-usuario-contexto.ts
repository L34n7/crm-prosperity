import { createHash } from "crypto";
import { cookies } from "next/headers";
import {
  getOrSetTtlCache,
  getTtlCacheKey,
} from "@/lib/cache/ttl-cache";
import { createClient } from "@/lib/supabase/server";
import { listarSetoresDoUsuario } from "@/lib/usuarios/setores";
import {
  listarPermissoesDoUsuario,
  listarPerfisDoUsuario,
} from "@/lib/permissoes/can";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import { buscarAssinaturaEmpresa } from "@/lib/assinaturas/status";

const AUTH_USER_CACHE_TTL_MS = 30_000;
const USUARIO_BASE_CACHE_TTL_MS = 30_000;
const AUTH_USER_NOT_FOUND = "AUTH_USER_NOT_FOUND";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type UsuarioBase = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  email: string | null;
  avatar_url?: string | null;
  assinatura_whatsapp?: string | null;
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";
};

export type PerfilDinamicoContexto = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type UsuarioContexto = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  email: string | null;
  avatar_url?: string | null;
  assinatura_whatsapp?: string | null;
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";
  is_admin: boolean;
  assinatura: AssinaturaEmpresa | null;

  permissoes: string[];
  perfis_dinamicos: PerfilDinamicoContexto[];
  perfil_dinamico_principal: PerfilDinamicoContexto | null;
  setores_ids: string[];
  usuarios_setores: Array<{
    id?: string;
    usuario_id: string;
    setor_id: string;
    is_principal?: boolean;
    created_at?: string;
  }>;
  setor_principal_id: string | null;
};

export type ResultadoUsuarioContexto =
  | {
      ok: true;
      usuario: UsuarioContexto;
    }
  | {
      ok: false;
      error: string;
      status: 401 | 403 | 404 | 500;
    };

export type GetUsuarioContextoOptions = {
  sincronizarAssinatura?: boolean;
};

export type ResultadoUsuarioBasico =
  | {
      ok: true;
      usuario: UsuarioBase;
    }
  | {
      ok: false;
      error: string;
      status: 401 | 403 | 404 | 500;
    };

type UsuarioAutenticado = {
  id: string;
};

function gerarHash(valor: string) {
  return createHash("sha256").update(valor).digest("hex");
}

async function getAuthCookieFingerprint() {
  const cookieStore = await cookies();
  const authCookies = cookieStore
    .getAll()
    .filter(
      (cookie) =>
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("code-verifier")
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join(";");

  return authCookies ? gerarHash(authCookies) : null;
}

async function carregarUsuarioAutenticado(
  supabase: SupabaseServerClient
): Promise<UsuarioAutenticado | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return {
    id: user.id,
  };
}

async function getUsuarioAutenticado(supabase: SupabaseServerClient) {
  const fingerprint = await getAuthCookieFingerprint();

  if (!fingerprint) {
    return await carregarUsuarioAutenticado(supabase);
  }

  try {
    return await getOrSetTtlCache(
      getTtlCacheKey("auth-user", [fingerprint]),
      AUTH_USER_CACHE_TTL_MS,
      async () => {
        const usuarioAutenticado = await carregarUsuarioAutenticado(supabase);

        if (!usuarioAutenticado) {
          throw new Error(AUTH_USER_NOT_FOUND);
        }

        return usuarioAutenticado;
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === AUTH_USER_NOT_FOUND) {
      return null;
    }

    throw error;
  }
}

async function buscarUsuarioBasePorAuthId(
  supabase: SupabaseServerClient,
  authUserId: string
) {
  return await getOrSetTtlCache(
    getTtlCacheKey("usuario-base-auth", [authUserId]),
    USUARIO_BASE_CACHE_TTL_MS,
    async () => {
      const { data: usuarioBase, error: usuarioError } = await supabase
        .from("usuarios")
        .select(
          "id, auth_user_id, nome, email, avatar_url, assinatura_whatsapp, empresa_id, status"
        )
        .eq("auth_user_id", authUserId)
        .maybeSingle<UsuarioBase>();

      if (usuarioError) {
        throw new Error(
          `Erro ao buscar usuario do sistema: ${usuarioError.message}`
        );
      }

      return usuarioBase ?? null;
    }
  );
}

export async function getUsuarioBasico(): Promise<ResultadoUsuarioBasico> {
  try {
    const supabase = await createClient();
    const usuarioAutenticado = await getUsuarioAutenticado(supabase);

    if (!usuarioAutenticado) {
      return {
        ok: false,
        error: "Nao autenticado",
        status: 401,
      };
    }

    const usuarioBase = await buscarUsuarioBasePorAuthId(
      supabase,
      usuarioAutenticado.id
    );

    if (!usuarioBase) {
      return {
        ok: false,
        error: "Usuario nao encontrado na tabela usuarios",
        status: 404,
      };
    }

    if (usuarioBase.status !== "ativo") {
      return {
        ok: false,
        error: "Usuario inativo ou bloqueado",
        status: 403,
      };
    }

    return {
      ok: true,
      usuario: usuarioBase,
    };
  } catch (error) {
    console.error("Erro em getUsuarioBasico:", error);

    return {
      ok: false,
      error: "Erro interno ao buscar usuario",
      status: 500,
    };
  }
}

export async function getUsuarioContexto(
  options: GetUsuarioContextoOptions = {}
): Promise<ResultadoUsuarioContexto> {
  try {
    const supabase = await createClient();
    const usuarioAutenticado = await getUsuarioAutenticado(supabase);

    if (!usuarioAutenticado) {
      return {
        ok: false,
        error: "Nao autenticado",
        status: 401,
      };
    }

    const usuarioBase = await buscarUsuarioBasePorAuthId(
      supabase,
      usuarioAutenticado.id
    );

    if (!usuarioBase) {
      return {
        ok: false,
        error: "Usuario nao encontrado na tabela usuarios",
        status: 404,
      };
    }

    if (usuarioBase.status !== "ativo") {
      return {
        ok: false,
        error: "Usuario inativo ou bloqueado",
        status: 403,
      };
    }

    const [perfisRaw, vinculosSetores, assinatura] = await Promise.all([
      listarPerfisDoUsuario(usuarioBase.id),
      listarSetoresDoUsuario(usuarioBase.id),
      usuarioBase.empresa_id
        ? buscarAssinaturaEmpresa(usuarioBase.empresa_id, {
            sincronizar: options.sincronizarAssinatura,
          })
        : null,
    ]);

    const permissoes = await listarPermissoesDoUsuario(usuarioBase.id, {
      empresaId: usuarioBase.empresa_id,
      assinatura,
      perfis: perfisRaw,
    });

    const perfis_dinamicos = (perfisRaw ?? [])
      .map((item) => {
        const perfil = Array.isArray(item.perfis_empresa)
          ? item.perfis_empresa[0]
          : item.perfis_empresa;

        if (!perfil) return null;

        return {
          id: perfil.id,
          empresa_id: perfil.empresa_id,
          nome: perfil.nome,
          descricao: perfil.descricao ?? null,
          ativo: perfil.ativo,
          created_at: perfil.created_at,
          updated_at: perfil.updated_at,
        };
      })
      .filter(Boolean) as PerfilDinamicoContexto[];

    const perfil_dinamico_principal = perfis_dinamicos[0] ?? null;
    const isAdmin = perfis_dinamicos.some(
      (perfil) => perfil.nome === "Administrador"
    );
    const setorPrincipal =
      vinculosSetores.find((item) => item.is_principal)?.setor_id ?? null;
    const setoresIds = vinculosSetores.map((item) => item.setor_id);

    return {
      ok: true,
      usuario: {
        id: usuarioBase.id,
        auth_user_id: usuarioBase.auth_user_id,
        nome: usuarioBase.nome,
        email: usuarioBase.email,
        avatar_url: usuarioBase.avatar_url,
        assinatura_whatsapp: usuarioBase.assinatura_whatsapp,
        empresa_id: usuarioBase.empresa_id,
        status: usuarioBase.status,
        is_admin: isAdmin,
        assinatura,
        permissoes,
        perfis_dinamicos,
        perfil_dinamico_principal,
        setores_ids: setoresIds,
        usuarios_setores: vinculosSetores,
        setor_principal_id: setorPrincipal,
      },
    };
  } catch (error) {
    console.error("Erro em getUsuarioContexto:", error);

    return {
      ok: false,
      error: "Erro interno ao buscar contexto do usuario",
      status: 500,
    };
  }
}
