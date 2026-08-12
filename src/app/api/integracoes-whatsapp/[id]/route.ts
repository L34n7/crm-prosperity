import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_TENTATIVAS_DESCONEXAO = 3;
const ERROS_TRANSITORIOS_DESCONEXAO = new Set([
  "55P03",
  "57014",
  "40001",
  "40P01",
]);

type ConfirmacaoDesconexao = {
  confirmar_desconexao?: boolean;
  confirmar_desconexao_coex_no_app?: boolean;
};

type ErroBanco = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroTransitorioDesconexao(error: ErroBanco | null | undefined) {
  return ERROS_TRANSITORIOS_DESCONEXAO.has(String(error?.code || ""));
}

async function executarDesconexaoComRetentativa(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  integracaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  let ultimoErro: ErroBanco | null = null;
  let tentativasRealizadas = 0;

  for (
    let tentativa = 1;
    tentativa <= MAX_TENTATIVAS_DESCONEXAO;
    tentativa += 1
  ) {
    tentativasRealizadas = tentativa;

    if (tentativa > 1) {
      await aguardar(500 * tentativa);
    }

    const inicio = Date.now();
    const { data, error } = await params.supabase.rpc(
      "backup_e_excluir_integracao_whatsapp",
      {
        p_integracao_id: params.integracaoId,
        p_empresa_id: params.empresaId,
        p_usuario_id: params.usuarioId,
      }
    );

    if (!error) {
      return {
        backupId: data,
        error: null,
        tentativas: tentativa,
        duracaoMs: Date.now() - inicio,
      };
    }

    ultimoErro = error;

    if (!erroTransitorioDesconexao(error)) {
      break;
    }

    console.warn("[WHATSAPP] Conflito transitório ao desconectar integração", {
      integracaoId: params.integracaoId,
      tentativa,
      codigo: error.code,
      duracaoMs: Date.now() - inicio,
    });
  }

  return {
    backupId: null,
    error: ultimoErro,
    tentativas: tentativasRealizadas,
    duracaoMs: null,
  };
}

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
    const bloqueio = bloquearSemPermissao(
      usuario,
      "whatsapp.integracao.configurar",
      "Você não tem permissão para remover integrações WhatsApp.",
    );
    if (bloqueio) return bloqueio;

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

    const body = (await request
      .json()
      .catch(() => ({}))) as ConfirmacaoDesconexao;

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
        "id, empresa_id, nome_conexao, numero, provider, status, phone_number_id, waba_id, modo_integracao, coex_status"
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

    if (
      integracao.modo_integracao === "coexistence" &&
      body.confirmar_desconexao_coex_no_app !== true
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Antes de remover a integração do CRM, desconecte a plataforma no WhatsApp Business App em Configurações > Conta > Plataforma de negócios.",
          requires_coex_app_disconnect: true,
        },
        { status: 409 }
      );
    }

    const resultadoExclusao = await executarDesconexaoComRetentativa({
      supabase,
      integracaoId: id,
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
    });

    if (resultadoExclusao.error) {
      const transitorio = erroTransitorioDesconexao(resultadoExclusao.error);

      console.error(
        "[WHATSAPP] Erro ao criar backup e excluir integração:",
        {
          ...resultadoExclusao.error,
          tentativas: resultadoExclusao.tentativas,
          transitorio,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error: transitorio
            ? "A integração está sendo atualizada por outro processo. Aguarde alguns segundos e tente novamente."
            : "Não foi possível desconectar a integração. Nenhum dado foi excluído.",
          retryable: transitorio,
        },
        { status: transitorio ? 409 : 500 }
      );
    }

    const backupId = resultadoExclusao.backupId;

    const { count: totalIntegracoesRestantes, error: totalError } =
      await supabase
        .from("integracoes_whatsapp")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", usuario.empresa_id)
        .eq("provider", "meta_official");

    if (totalError) {
      console.warn(
        "[WHATSAPP] Nao foi possivel contar integracoes restantes apos desconexao:",
        totalError
      );
    }

    const redirectTo =
      !totalError && (totalIntegracoesRestantes || 0) > 0
        ? "/perfil-whatsapp"
        : "/configurar-ambiente";

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
        destino: redirectTo,
        tentativas: resultadoExclusao.tentativas,
        duracao_ms: resultadoExclusao.duracaoMs,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Integração desconectada com sucesso.",
      redirect_to: redirectTo,
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
