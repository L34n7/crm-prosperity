import { createClient } from "@/lib/supabase/server";
import {
  listarIdsSetoresDoUsuario,
  listarSetoresDoUsuario,
} from "@/lib/usuarios/setores";
import {
  listarPermissoesDoUsuario,
  listarPerfisDoUsuario,
} from "@/lib/permissoes/can";

export type UsuarioBase = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  email: string | null;
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
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";

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

export async function getUsuarioContexto(): Promise<ResultadoUsuarioContexto> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        error: "Não autenticado",
        status: 401,
      };
    }

    const { data: usuarioBase, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, auth_user_id, nome, email, empresa_id, status")
      .eq("auth_user_id", user.id)
      .maybeSingle<UsuarioBase>();

    if (usuarioError) {
      return {
        ok: false,
        error: "Erro ao buscar usuário do sistema",
        status: 500,
      };
    }

    if (!usuarioBase) {
      return {
        ok: false,
        error: "Usuário não encontrado na tabela usuarios",
        status: 404,
      };
    }

    if (usuarioBase.status !== "ativo") {
      return {
        ok: false,
        error: "Usuário inativo ou bloqueado",
        status: 403,
      };
    }

    const [permissoes, perfisRaw, vinculosSetores, setoresIds] =
      await Promise.all([
        listarPermissoesDoUsuario(usuarioBase.id),
        listarPerfisDoUsuario(usuarioBase.id),
        listarSetoresDoUsuario(usuarioBase.id),
        listarIdsSetoresDoUsuario(usuarioBase.id),
      ]);

    const perfis_dinamicos = (perfisRaw ?? [])
      .map((item) => {
        const perfil = item.perfis_empresa;

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

    const setorPrincipal =
      vinculosSetores.find((item) => item.is_principal)?.setor_id ?? null;

    return {
      ok: true,
      usuario: {
        id: usuarioBase.id,
        auth_user_id: usuarioBase.auth_user_id,
        nome: usuarioBase.nome,
        email: usuarioBase.email,
        empresa_id: usuarioBase.empresa_id,
        status: usuarioBase.status,
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
      error: "Erro interno ao buscar contexto do usuário",
      status: 500,
    };
  }
}