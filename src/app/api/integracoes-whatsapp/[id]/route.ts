import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConfirmacaoDesconexao = {
  confirmar_desconexao?: boolean;
};

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { id } = await context.params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { ok: false, error: "Integração inválida." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as ConfirmacaoDesconexao;

    if (body.confirmar_desconexao !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Confirme a desconexão antes de excluir a integração.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: integracao, error: integracaoError } = await supabase
      .from("integracoes_whatsapp")
      .select(
        "id, empresa_id, nome_conexao, numero, provider, status, phone_number_id, waba_id"
      )
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("provider", "meta_official")
      .maybeSingle();

    if (integracaoError) {
      console.error(
        "[WHATSAPP] Erro ao buscar integração para desconexão:",
        integracaoError
      );
      return NextResponse.json(
        { ok: false, error: "Não foi possível validar a integração." },
        { status: 500 }
      );
    }

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    const { data: backupId, error: exclusaoError } = await supabase.rpc(
      "backup_e_excluir_integracao_whatsapp",
      {
        p_integracao_id: id,
        p_empresa_id: usuario.empresa_id,
        p_usuario_id: usuario.id,
      }
    );

    if (exclusaoError) {
      console.error(
        "[WHATSAPP] Erro ao criar backup e excluir integração:",
        exclusaoError
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível desconectar a integração. Nenhum dado foi excluído.",
        },
        { status: 500 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "sistema",
      entidade: "integracao_whatsapp",
      entidade_id: id,
      acao: "integracao_whatsapp_desconectada",
      descricao: `Integração WhatsApp ${integracao.nome_conexao} desconectada do CRM`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: integracao,
      depois: null,
      detalhes: {
        backup_id: backupId,
        destino: "/configurar-ambiente",
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Integração desconectada com sucesso.",
      redirect_to: "/configurar-ambiente",
    });
  } catch (error) {
    console.error("[WHATSAPP] Erro inesperado ao desconectar integração:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível desconectar a integração. Nenhum dado foi excluído.",
      },
      { status: 500 }
    );
  }
}
