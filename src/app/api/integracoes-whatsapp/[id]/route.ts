import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  pausarDisparosIntegracaoQstash,
  publicarDesconexaoIntegracaoQstash,
} from "@/lib/whatsapp/integracao-desconexao-fila";

export const maxDuration = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConfirmacaoDesconexao = {
  confirmar_desconexao?: boolean;
  confirmar_desconexao_coex_no_app?: boolean;
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
  setup_completed_at?: string | null;
  coex_sync_completed_at?: string | null;
  config_json?: Record<string, unknown> | null;
};

type SolicitacaoDesconexao = {
  job_id: string;
  backup_id: string | null;
  posicao_liberada: number | null;
  integracao_nome: string | null;
  numero_original: string | null;
  phone_number_id_original: string | null;
  ja_enfileirada: boolean;
};

function objetoJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function timestampMs(valor: unknown) {
  const data = new Date(String(valor || ""));
  const timestamp = data.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function metaJaRemoveuIntegracao(integracao: IntegracaoParaDesconexao) {
  if (integracao.modo_integracao !== "coexistence") return false;

  if (
    String(integracao.status || "").toLowerCase() === "desconectada" ||
    String(integracao.coex_status || "").toLowerCase() === "desconectado"
  ) {
    return true;
  }

  const config = objetoJson(integracao.config_json);
  const ultimaDesconexao = objetoJson(config.coex_last_disconnection);
  const evento = String(ultimaDesconexao.event || "").toUpperCase();

  if (evento !== "PARTNER_REMOVED") {
    return false;
  }

  const desconectadoEm = timestampMs(config.coex_last_disconnection_at);
  const saude = objetoJson(config.whatsapp_meta_health);
  const saudeRaw = objetoJson(saude.raw);
  const saudeConectada =
    String(saudeRaw.status || saude.phone_number_status || "").toUpperCase() ===
    "CONNECTED";
  const saudeConectadaEm = saudeConectada
    ? timestampMs(saude.checked_at)
    : 0;

  const conexaoConfirmadaEm = Math.max(
    timestampMs(integracao.setup_completed_at),
    timestampMs(integracao.coex_sync_completed_at),
    saudeConectadaEm
  );

  if (
    conexaoConfirmadaEm > 0 &&
    (!desconectadoEm || conexaoConfirmadaEm > desconectadoEm)
  ) {
    return false;
  }

  return true;
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
      "Você não tem permissão para remover integrações WhatsApp."
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
        "id, empresa_id, nome_conexao, numero, provider, status, phone_number_id, waba_id, modo_integracao, coex_status, setup_completed_at, coex_sync_completed_at, config_json"
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

    const { data: solicitacaoData, error: solicitacaoError } =
      await supabase.rpc("solicitar_desconexao_integracao_whatsapp", {
        p_integracao_id: id,
        p_empresa_id: usuario.empresa_id,
        p_usuario_id: usuario.id,
        p_meta_ja_desconectado: metaJaDesconectado,
      });

    if (solicitacaoError) {
      console.error(
        "[WHATSAPP] Erro ao colocar desconexão na fila:",
        solicitacaoError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            solicitacaoError.code === "55P03"
              ? "A integração está sendo atualizada por outro processo. Aguarde alguns segundos e tente novamente."
              : "Não foi possível iniciar a desconexão da integração.",
          retryable: ["55P03", "57014", "40001", "40P01"].includes(
            String(solicitacaoError.code || "")
          ),
        },
        { status: 409 }
      );
    }

    const solicitacao = (
      Array.isArray(solicitacaoData)
        ? solicitacaoData[0] || null
        : solicitacaoData || null
    ) as SolicitacaoDesconexao | null;

    if (!solicitacao?.job_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "A desconexão foi iniciada, mas o job de limpeza não foi criado.",
        },
        { status: 500 }
      );
    }

    // O bloqueio local e a liberação do slot já aconteceram atomicamente.
    // A partir daqui nenhuma falha de QStash volta a prender o usuário.
    const [publicacao] = await Promise.all([
      publicarDesconexaoIntegracaoQstash(solicitacao.job_id),
      pausarDisparosIntegracaoQstash(id),
    ]);

    if (!publicacao.ok) {
      console.warn(
        "[WHATSAPP] Desconexão liberada; limpeza seguirá pelo cron fallback:",
        {
          jobId: solicitacao.job_id,
          integracaoId: id,
          erro: publicacao.erro,
        }
      );
    }

    const { count: totalIntegracoesRestantes, error: totalError } =
      await supabase
        .from("integracoes_whatsapp")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", usuario.empresa_id)
        .eq("provider", "meta_official")
        .neq("status", "desconectada");

    if (totalError) {
      console.warn(
        "[WHATSAPP] Não foi possível contar integrações restantes:",
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
      acao: "integracao_whatsapp_desconexao_enfileirada",
      descricao:
        `Integração WhatsApp ${integracao.nome_conexao} bloqueada e enviada para limpeza em background`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: integracao,
      depois: {
        status: "desconectada",
        posicao: null,
        limpeza_pendente: true,
      },
      detalhes: {
        backup_id: solicitacao.backup_id,
        job_id: solicitacao.job_id,
        posicao_liberada: solicitacao.posicao_liberada,
        destino: redirectTo,
        meta_ja_desconectado: metaJaDesconectado,
        ja_enfileirada: solicitacao.ja_enfileirada,
        qstash_publicado: publicacao.ok,
        qstash_message_id: publicacao.messageId,
        qstash_erro: publicacao.erro,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        cleanup_job_id: solicitacao.job_id,
        cleanup_published: publicacao.ok,
        message:
          "Integração desconectada do uso do CRM. A limpeza do histórico operacional continuará em segundo plano.",
        meta_already_disconnected: metaJaDesconectado,
        redirect_to: redirectTo,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[WHATSAPP] Erro inesperado ao desconectar integração:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Não foi possível iniciar a desconexão da integração.",
      },
      { status: 500 }
    );
  }
}
