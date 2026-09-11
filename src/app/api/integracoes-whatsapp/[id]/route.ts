import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const MAX_TENTATIVAS_DESCONEXAO = 3;
const MAX_TENTATIVAS_DESCONEXAO_META_JA_REMOVIDA = 5;
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

type IntegracaoParaDesconexao = {
  id: string;
  empresa_id: string;
  nome_conexao: string;
  numero?: string | null;
  provider: string;
  status?: string | null;
  phone_number_id?: string | null;
  waba_id?: string | null;
  modo_integracao?: string | null;
  coex_status?: string | null;
  config_json?: Record<string, unknown> | null;
};

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroTransitorioDesconexao(error: ErroBanco | null | undefined) {
  return ERROS_TRANSITORIOS_DESCONEXAO.has(String(error?.code || ""));
}

function objetoJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function metaJaRemoveuIntegracao(integracao: IntegracaoParaDesconexao) {
  if (integracao.modo_integracao !== "coexistence") return false;

  const config = objetoJson(integracao.config_json);
  const ultimaDesconexao = objetoJson(config.coex_last_disconnection);
  const evento = String(ultimaDesconexao.event || "").toUpperCase();

  return (
    String(integracao.status || "").toLowerCase() === "desconectada" ||
    String(integracao.coex_status || "").toLowerCase() === "desconectado" ||
    evento === "PARTNER_REMOVED"
  );
}

async function integracaoAindaExiste(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  integracaoId: string;
  empresaId: string;
}) {
  const { data, error } = await params.supabase
    .from("integracoes_whatsapp")
    .select("id")
    .eq("id", params.integracaoId)
    .eq("empresa_id", params.empresaId)
    .eq("provider", "meta_official")
    .maybeSingle();

  if (error) {
    console.warn(
      "[WHATSAPP] Não foi possível reconciliar a integração após conflito de desconexão",
      {
        integracaoId: params.integracaoId,
        codigo: error.code,
        mensagem: error.message,
      }
    );
    return null;
  }

  return Boolean(data);
}

async function executarDesconexaoComRetentativa(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  integracaoId: string;
  empresaId: string;
  usuarioId: string;
  metaJaDesconectado: boolean;
}) {
  let ultimoErro: ErroBanco | null = null;
  let tentativasRealizadas = 0;
  const inicioTotal = Date.now();
  const maxTentativas = params.metaJaDesconectado
    ? MAX_TENTATIVAS_DESCONEXAO_META_JA_REMOVIDA
    : MAX_TENTATIVAS_DESCONEXAO;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    tentativasRealizadas = tentativa;

    if (tentativa > 1) {
      // Quando a Meta já removeu o parceiro, ainda pode haver um webhook/status
      // encerrando a atualização local. Damos uma janela curta para esse lock sair
      // e repetimos a operação atômica sem exigir nova ação do usuário.
      await aguardar(500 * tentativa);
    }

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
        duracaoMs: Date.now() - inicioTotal,
        jaRemovida: false,
      };
    }

    ultimoErro = error;

    // Se outra tentativa/processo terminou a exclusão enquanto esta requisição
    // aguardava, o objetivo já foi atingido. DELETE deve ser idempotente.
    if (String(error.code || "") === "P0002") {
      const aindaExiste = await integracaoAindaExiste(params);
      if (aindaExiste === false) {
        return {
          backupId: null,
          error: null,
          tentativas: tentativa,
          duracaoMs: Date.now() - inicioTotal,
          jaRemovida: true,
        };
      }
    }

    if (!erroTransitorioDesconexao(error)) {
      break;
    }

    const aindaExiste = await integracaoAindaExiste(params);
    if (aindaExiste === false) {
      return {
        backupId: null,
        error: null,
        tentativas: tentativa,
        duracaoMs: Date.now() - inicioTotal,
        jaRemovida: true,
      };
    }

    console.warn("[WHATSAPP] Conflito transitório ao desconectar integração", {
      integracaoId: params.integracaoId,
      tentativa,
      maxTentativas,
      codigo: error.code,
      metaJaDesconectado: params.metaJaDesconectado,
      duracaoMs: Date.now() - inicioTotal,
    });
  }

  return {
    backupId: null,
    error: ultimoErro,
    tentativas: tentativasRealizadas,
    duracaoMs: Date.now() - inicioTotal,
    jaRemovida: false,
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
        "id, empresa_id, nome_conexao, numero, provider, status, phone_number_id, waba_id, modo_integracao, coex_status, config_json"
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

    const integracaoTipada = integracao as IntegracaoParaDesconexao;
    const metaJaDesconectado = metaJaRemoveuIntegracao(integracaoTipada);

    if (
      integracao.modo_integracao === "coexistence" &&
      !metaJaDesconectado &&
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

    if (metaJaDesconectado) {
      console.info(
        "[WHATSAPP] Meta já removeu a integração; reconciliando limpeza local",
        {
          integracaoId: id,
          empresaId: usuario.empresa_id,
          status: integracao.status,
          coexStatus: integracao.coex_status,
        }
      );
    }

    const resultadoExclusao = await executarDesconexaoComRetentativa({
      supabase,
      integracaoId: id,
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      metaJaDesconectado,
    });

    if (resultadoExclusao.error) {
      const transitorio = erroTransitorioDesconexao(resultadoExclusao.error);

      console.error(
        "[WHATSAPP] Erro ao criar backup e excluir integração:",
        {
          ...resultadoExclusao.error,
          tentativas: resultadoExclusao.tentativas,
          transitorio,
          metaJaDesconectado,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error: transitorio
            ? metaJaDesconectado
              ? "A Meta já desconectou este número, mas o CRM ainda está finalizando a limpeza local. Tente novamente em alguns segundos."
              : "A integração está sendo atualizada por outro processo. Aguarde alguns segundos e tente novamente."
            : "Não foi possível desconectar a integração. Nenhum dado foi excluído.",
          retryable: transitorio,
          meta_already_disconnected: metaJaDesconectado,
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
        meta_ja_desconectado: metaJaDesconectado,
        remocao_idempotente: resultadoExclusao.jaRemovida,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: metaJaDesconectado
        ? "A conexão já estava removida na Meta e foi limpa do CRM com sucesso."
        : "Integração desconectada com sucesso.",
      meta_already_disconnected: metaJaDesconectado,
      already_removed: resultadoExclusao.jaRemovida,
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
