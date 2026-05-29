import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { upsertConfiguracaoEmpresa } from "@/lib/configuracoes/configuracoes-empresa";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export async function PUT(request: Request) {
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
        { ok: false, error: "Apenas administradores podem alterar essa configuração" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const auditMeta = getRequestAuditMetadata(request);

    const data = await upsertConfiguracaoEmpresa({
      empresa_id: usuario.empresa_id,
      permitir_transferir_sem_assumir: !!body.permitir_transferir_sem_assumir,
      permitir_transferir_para_mesmo_setor:
        !!body.permitir_transferir_para_mesmo_setor,
      limpar_responsavel_ao_transferir:
        !!body.limpar_responsavel_ao_transferir,
      voltar_fila_ao_transferir: !!body.voltar_fila_ao_transferir,

      atendente_pode_transferir: !!body.atendente_pode_transferir,
      supervisor_pode_transferir: !!body.supervisor_pode_transferir,
      administrador_pode_transferir: !!body.administrador_pode_transferir,

      atendente_pode_atribuir: !!body.atendente_pode_atribuir,
      supervisor_pode_atribuir: !!body.supervisor_pode_atribuir,
      administrador_pode_atribuir: !!body.administrador_pode_atribuir,

      atendente_pode_assumir: !!body.atendente_pode_assumir,
      supervisor_pode_assumir: !!body.supervisor_pode_assumir,
      administrador_pode_assumir: !!body.administrador_pode_assumir,

      permitir_assumir_conversa_em_fila:
        !!body.permitir_assumir_conversa_em_fila,
      permitir_assumir_conversa_sem_responsavel:
        !!body.permitir_assumir_conversa_sem_responsavel,
      permitir_assumir_conversa_ja_atribuida:
        !!body.permitir_assumir_conversa_ja_atribuida,

      atendente_pode_reatribuir: !!body.atendente_pode_reatribuir,
      supervisor_pode_reatribuir: !!body.supervisor_pode_reatribuir,
      administrador_pode_reatribuir: !!body.administrador_pode_reatribuir,

      exigir_mesmo_setor_para_reatribuicao:
        !!body.exigir_mesmo_setor_para_reatribuicao,
    });

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "permissoes",
      entidade: "politica_empresa",
      entidade_id: usuario.empresa_id,
      acao: "politica_atendimento_atualizada",
      descricao: "Política de atendimento da empresa atualizada",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: data,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Configuração da empresa salva com sucesso",
      empresa: data,
    });
  } catch (error) {
    console.error("Erro ao salvar configuração da empresa:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao salvar configuração da empresa" },
      { status: 500 }
    );
  }
}
