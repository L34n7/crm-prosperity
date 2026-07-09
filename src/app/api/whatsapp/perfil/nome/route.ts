import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  diagnosticarErroMetaWhatsapp,
  type WhatsAppMetaErrorDiagnostic,
} from "@/lib/whatsapp/meta-error-diagnostics";
import { aplicarBloqueioOperacionalWhatsappMeta } from "@/lib/whatsapp/meta-block";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";

const GRAPH_VERSION = "v23.0";

type IntegracaoWhatsapp = {
  id: string;
  empresa_id: string;
  nome_conexao: string;
  numero: string;
  status: string;
  modo_integracao?: string | null;
  phone_number_id: string | null;
  phone_number_status?: string | null;
  token_ref: string | null;
  verified_name?: string | null;
  config_json: any;
};

function extrairToken(integracao: IntegracaoWhatsapp) {
  return getWhatsAppAccessToken(integracao) || null;
}

function jsonErro(error: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error, extra }, { status });
}

function objetoConfig(configJson: any) {
  return configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? configJson
    : {};
}

function normalizarStatusIntegracaoWhatsapp(valor?: string | null) {
  const status = String(valor || "").trim().toLowerCase();
  return ["pendente", "ativa", "erro", "desconectada"].includes(status)
    ? status
    : null;
}

async function marcarIntegracaoComDiagnosticoMeta(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  integracao: IntegracaoWhatsapp;
  empresaId: string;
  diagnostico: WhatsAppMetaErrorDiagnostic;
  metaResponse: unknown;
}) {
  const { supabase, integracao, empresaId, diagnostico, metaResponse } = params;
  const agora = new Date().toISOString();

  const payload: Record<string, unknown> = {
    onboarding_status: "erro",
    onboarding_erro: diagnostico.descricao,
    ultimo_sync_at: agora,
    updated_at: agora,
    config_json: {
      ...objetoConfig(integracao.config_json),
      whatsapp_meta_diagnostic: diagnostico,
      whatsapp_last_meta_error: metaResponse,
      whatsapp_last_meta_error_at: agora,
    },
  };

  const statusIntegracao = normalizarStatusIntegracaoWhatsapp(
    diagnostico.statusIntegracao
  );

  if (statusIntegracao) {
    payload.status = statusIntegracao;
  }

  if (diagnostico.statusNumeroMeta) {
    payload.phone_number_status = diagnostico.statusNumeroMeta;
  }

  const { error } = await supabase
    .from("integracoes_whatsapp")
    .update(payload)
    .eq("id", integracao.id)
    .eq("empresa_id", empresaId);

  if (error) {
    console.warn("[WHATSAPP ALTERAR NOME DIAGNOSTICO UPDATE ERROR]", error);
  }

  if (diagnostico.motivo === "business_account_locked") {
    await aplicarBloqueioOperacionalWhatsappMeta({
      empresaId,
      integracaoId: integracao.id,
      motivo: diagnostico.descricao,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return jsonErro(contexto.error, contexto.status);
    }

    const empresaId = contexto.usuario.empresa_id;

    if (!empresaId) {
      return jsonErro("Usuário sem empresa vinculada.", 403);
    }

    const body = await req.json();

    const integracaoId = String(body.integracao_id || "");
    const novoNome = String(body.novo_nome || "").trim();

    if (!integracaoId) {
      return jsonErro("Selecione uma integração.", 400);
    }

    if (novoNome.length < 3 || novoNome.length > 150) {
      return jsonErro("O nome precisa ter entre 3 e 150 caracteres.", 400);
    }

    const supabase = await createClient();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao, error } = await supabase
      .from("integracoes_whatsapp")
      .select(
        "id, empresa_id, nome_conexao, numero, status, modo_integracao, phone_number_id, phone_number_status, token_ref, verified_name, config_json"
      )
      .eq("id", integracaoId)
      .eq("empresa_id", empresaId)
      .maybeSingle<IntegracaoWhatsapp>();

    if (error) {
      return jsonErro("Erro ao buscar integração.", 500, error);
    }

    if (!integracao) {
      return jsonErro("Integração não encontrada.", 404);
    }

    if (!integracao.phone_number_id) {
      return jsonErro("Essa integração não possui phone_number_id.", 400);
    }

    if (integracao.modo_integracao === "coexistence") {
      return jsonErro(
        "Este número está conectado por coexistência. Solicite a alteração do nome diretamente no Gerenciador do WhatsApp da Meta ou no WhatsApp Business App.",
        409
      );
    }

    const token = extrairToken(integracao);

    if (!token) {
      return jsonErro(
        "Token da Meta não encontrado. Verifique token_ref e Environment Variables.",
        400
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracao.phone_number_id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          new_display_name: novoNome,
        }),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      const diagnostico = diagnosticarErroMetaWhatsapp(
        metaJson,
        "Erro ao solicitar alteracao do nome de exibicao."
      );

      if (diagnostico.bloqueiaOperacao) {
        await marcarIntegracaoComDiagnosticoMeta({
          supabase,
          integracao,
          empresaId,
          diagnostico,
          metaResponse: metaJson,
        });

        return NextResponse.json(
          {
            ok: false,
            error: diagnostico.descricao,
            diagnostico,
            meta: metaJson,
          },
          { status: metaRes.status }
        );
      }

      return jsonErro(
        metaJson?.error?.message ||
          "Erro ao solicitar alteração do nome de exibição.",
        metaRes.status,
        metaJson
      );
    }

    const agora = new Date();
    const agoraIso = agora.toISOString();
    const proximaVerificacao = new Date(agora.getTime() + 3 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("whatsapp_display_name_changes")
      .update({
        status: "cancelado",
        cancelado_em: agoraIso,
        updated_at: agoraIso,
      })
      .eq("integracao_whatsapp_id", integracao.id)
      .in("status", [
        "solicitado",
        "em_analise",
        "aguardando_liberacao_meta",
        "pronto_para_registro",
        "aprovado_pendente_pin",
        "erro_verificacao",
        "erro_ao_aplicar",
      ]);

    const { error: insertChangeError } = await supabaseAdmin
      .from("whatsapp_display_name_changes")
      .insert({
        empresa_id: empresaId,
        integracao_whatsapp_id: integracao.id,
        phone_number_id: integracao.phone_number_id,
        display_phone_number: integracao.numero,
        nome_antigo:
          integracao.verified_name ||
          integracao.nome_conexao ||
          null,
        nome_atual_meta:
          integracao.verified_name ||
          integracao.nome_conexao ||
          null,
        nome_solicitado: novoNome,
        status: "solicitado",
        precisa_registro: true,
        auto_aplicar: true,
        tentativas_verificacao: 0,
        proxima_verificacao_em: proximaVerificacao,
        solicitado_em: agoraIso,
        meta_response: metaJson,
        created_at: agoraIso,
        updated_at: agoraIso,
      });

    if (insertChangeError) {
      console.warn("[WHATSAPP ALTERAR NOME INSERT CHANGE ERROR]", insertChangeError);

      return jsonErro(
        "A solicitação foi enviada para a Meta, mas não foi possível registrar o acompanhamento no CRM.",
        500,
        insertChangeError
      );
    }

    await supabase
      .from("integracoes_whatsapp")
      .update({
        updated_at: agoraIso,
        ultimo_sync_at: agoraIso,
        config_json: {
          ...objetoConfig(integracao.config_json),
          display_name_change_requested: {
            novo_nome: novoNome,
            solicitado_em: agoraIso,
            status: "solicitado",
            precisa_registro: true,
            auto_aplicar: true,
            proxima_verificacao_em: proximaVerificacao,
            meta_response: metaJson,
          },
        },
      })
      .eq("id", integracao.id)
      .eq("empresa_id", empresaId);

    return NextResponse.json({
      ok: true,
      message:
        "Solicitação enviada ao Meta. O novo nome pode passar por revisão.",
      meta: metaJson,
    });
  } catch (error: any) {
    console.error("[WHATSAPP ALTERAR NOME ERROR]", error);

    return jsonErro(
      error?.message || "Erro interno ao solicitar alteração do nome.",
      500
    );
  }
}
