import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { upsertConfiguracaoEmpresa } from "@/lib/configuracoes/configuracoes-empresa";

const supabaseAdmin = getSupabaseAdmin();

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

    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from("usuarios")
      .select(`
        id,
        nome,
        email,
        usuarios_perfis (
          perfis_empresa (
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

    const mapConfigUsuario = new Map(
      (configuracoesUsuario || []).map((item) => [item.usuario_id, item])
    );

    const usuariosFormatados = (usuarios || []).map((item: any) => ({
      id: item.id,
      nome: item.nome,
      email: item.email,
      perfis: Array.from(
        new Set(
          (item.usuarios_perfis || [])
            .map((p: any) => p.perfis_empresa?.nome)
            .filter(Boolean)
        )
      ),
      setores: Array.from(
        new Set(
          (item.usuarios_setores || [])
            .map((s: any) => s.setores?.nome)
            .filter(Boolean)
        )
      ),
      configuracao_usuario: {
        pode_transferir: mapConfigUsuario.get(item.id)?.pode_transferir ?? null,
        pode_atribuir: mapConfigUsuario.get(item.id)?.pode_atribuir ?? null,
        pode_assumir: mapConfigUsuario.get(item.id)?.pode_assumir ?? null,
        permitir_transferir_sem_assumir:
          mapConfigUsuario.get(item.id)?.permitir_transferir_sem_assumir ?? null,
        permitir_assumir_conversa_em_fila:
          mapConfigUsuario.get(item.id)?.permitir_assumir_conversa_em_fila ?? null,
        permitir_assumir_conversa_sem_responsavel:
          mapConfigUsuario.get(item.id)?.permitir_assumir_conversa_sem_responsavel ?? null,
        permitir_assumir_conversa_ja_atribuida:
          mapConfigUsuario.get(item.id)?.permitir_assumir_conversa_ja_atribuida ?? null,
      },
    }));

    return NextResponse.json({
      ok: true,
      empresa,
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