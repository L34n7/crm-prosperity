import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { upsertConfiguracaoEmpresa } from "@/lib/configuracoes/configuracoes-empresa";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioPerfilPermissoesRow = {
  perfil_empresa_id: string;
  perfis_empresa?: {
    nome?: string | null;
  } | null;
};

type UsuarioSetorPermissoesRow = {
  setores?: {
    nome?: string | null;
  } | null;
};

type UsuarioPermissoesRow = {
  id: string;
  nome: string | null;
  email: string | null;
  usuarios_perfis?: UsuarioPerfilPermissoesRow[] | null;
  usuarios_setores?: UsuarioSetorPermissoesRow[] | null;
};

type PerfilPermissaoRow = {
  perfil_empresa_id: string;
  permissao_codigo: string;
};

type UsuarioPermissaoRow = {
  usuario_id: string;
  permissao_codigo: string;
  efeito: "permitir" | "bloquear";
};

type PermissaoOverride = {
  permissao_codigo: string;
  efeito: "permitir" | "bloquear";
};

function defaultEmpresa(empresaId: string) {
  return {
    empresa_id: empresaId,
    permitir_transferir_sem_assumir: true,
    permitir_transferir_para_mesmo_setor: false,
    limpar_responsavel_ao_transferir: true,
    voltar_fila_ao_transferir: true,

    atendente_pode_transferir: true,
    supervisor_pode_transferir: true,
    administrador_pode_transferir: true,

    atendente_pode_atribuir: false,
    supervisor_pode_atribuir: true,
    administrador_pode_atribuir: true,

    atendente_pode_assumir: true,
    supervisor_pode_assumir: true,
    administrador_pode_assumir: true,

    permitir_assumir_conversa_em_fila: true,
    permitir_assumir_conversa_sem_responsavel: true,
    permitir_assumir_conversa_ja_atribuida: false,

    atendente_pode_reatribuir: false,
    supervisor_pode_reatribuir: true,
    administrador_pode_reatribuir: true,

    exigir_mesmo_setor_para_reatribuicao: true,
  };
}

export async function GET() {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!isAdministrador(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Apenas administradores podem acessar esta página" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    let { data: empresa } = await supabaseAdmin
      .from("configuracoes_empresa")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (!empresa) {
      empresa = await upsertConfiguracaoEmpresa(defaultEmpresa(usuario.empresa_id));
    }

    const { data: catalogoPermissoes, error: catalogoPermissoesError } =
      await supabaseAdmin
        .from("permissoes")
        .select("codigo, descricao")
        .order("codigo");

    if (catalogoPermissoesError) {
      return NextResponse.json(
        { ok: false, error: catalogoPermissoesError.message },
        { status: 500 }
      );
    }

    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from("usuarios")
      .select(`
        id,
        nome,
        email,
        usuarios_perfis (
          perfil_empresa_id,
          perfis_empresa (
            id,
            nome
          )
        ),
        usuarios_setores (
          setores (
            nome
          )
        )
      `)
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "ativo")
      .order("nome", { ascending: true });

    if (usuariosError) {
      return NextResponse.json(
        { ok: false, error: usuariosError.message },
        { status: 500 }
      );
    }

    const { data: configuracoesUsuario, error: configUsuarioError } =
      await supabaseAdmin
        .from("configuracoes_usuario")
        .select("*")
        .eq("empresa_id", usuario.empresa_id);

    if (configUsuarioError) {
      return NextResponse.json(
        { ok: false, error: configUsuarioError.message },
        { status: 500 }
      );
    }

    const usuariosRows = (usuarios || []) as UsuarioPermissoesRow[];

    const perfilEmpresaIds = Array.from(
      new Set(
        usuariosRows
          .flatMap((item) =>
            (item.usuarios_perfis || []).map((p) => p.perfil_empresa_id)
          )
          .filter(Boolean)
      )
    );

    let perfilPermissoes: PerfilPermissaoRow[] = [];

    if (perfilEmpresaIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("perfil_permissoes")
        .select("perfil_empresa_id, permissao_codigo")
        .in("perfil_empresa_id", perfilEmpresaIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      perfilPermissoes = (data || []) as PerfilPermissaoRow[];
    }

    const usuarioIds = usuariosRows.map((item) => item.id);
    let permissoesUsuario: UsuarioPermissaoRow[] = [];

    if (usuarioIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("usuario_permissoes")
        .select("usuario_id, permissao_codigo, efeito")
        .eq("empresa_id", usuario.empresa_id)
        .in("usuario_id", usuarioIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      permissoesUsuario = (data || []) as UsuarioPermissaoRow[];
    }

    const permissoesPorPerfil = new Map<string, string[]>();

    for (const item of perfilPermissoes) {
      const lista = permissoesPorPerfil.get(item.perfil_empresa_id) || [];
      lista.push(item.permissao_codigo);
      permissoesPorPerfil.set(item.perfil_empresa_id, lista);
    }

    const overridesPorUsuario = new Map<string, PermissaoOverride[]>();

    for (const item of permissoesUsuario) {
      const lista = overridesPorUsuario.get(item.usuario_id) || [];
      lista.push({
        permissao_codigo: item.permissao_codigo,
        efeito: item.efeito,
      });
      overridesPorUsuario.set(item.usuario_id, lista);
    }

    const mapConfigUsuario = new Map(
      (configuracoesUsuario || []).map((item) => [item.usuario_id, item])
    );

    const usuariosFormatados = usuariosRows.map((item) => ({
      id: item.id,
      nome: item.nome,
      email: item.email,
      perfis: Array.from(
        new Set(
          (item.usuarios_perfis || [])
            .map((p) => p.perfis_empresa?.nome)
            .filter(Boolean)
        )
      ),
      setores: Array.from(
        new Set(
          (item.usuarios_setores || [])
            .map((s) => s.setores?.nome)
            .filter(Boolean)
        )
      ),
      configuracao_usuario: {
        pode_transferir: mapConfigUsuario.get(item.id)?.pode_transferir ?? null,
        pode_atribuir: mapConfigUsuario.get(item.id)?.pode_atribuir ?? null,
        pode_reatribuir: mapConfigUsuario.get(item.id)?.pode_reatribuir ?? null,
        pode_assumir: mapConfigUsuario.get(item.id)?.pode_assumir ?? null,
        permitir_transferir_sem_assumir:
          mapConfigUsuario.get(item.id)?.permitir_transferir_sem_assumir ?? null,
        permitir_assumir_conversa_em_fila:
          mapConfigUsuario.get(item.id)?.permitir_assumir_conversa_em_fila ?? null,
        permitir_assumir_conversa_sem_responsavel:
          mapConfigUsuario.get(item.id)?.permitir_assumir_conversa_sem_responsavel ?? null,
        permitir_assumir_conversa_ja_atribuida:
          mapConfigUsuario.get(item.id)?.permitir_assumir_conversa_ja_atribuida ?? null,
        exigir_mesmo_setor_para_reatribuicao:
          mapConfigUsuario.get(item.id)?.exigir_mesmo_setor_para_reatribuicao ?? null,
      },
      permissoes_herdadas: Array.from(
        new Set(
          (item.usuarios_perfis || [])
            .flatMap((p) => permissoesPorPerfil.get(p.perfil_empresa_id) || [])
            .filter(Boolean)
        )
      ),
      permissoes_usuario: overridesPorUsuario.get(item.id) || [],
    }));

    return NextResponse.json({
      ok: true,
      empresa,
      permissoes_catalogo: catalogoPermissoes || [],
      usuarios: usuariosFormatados,
    });
  } catch (error) {
    console.error("Erro ao carregar página de permissões:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar permissões" },
      { status: 500 }
    );
  }
}
