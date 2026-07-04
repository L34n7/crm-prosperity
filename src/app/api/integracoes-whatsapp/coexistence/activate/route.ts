import { NextRequest, NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

type SyncType = "contacts" | "history";

const META_SYNC_TYPE: Record<SyncType, string> = {
  contacts: "smb_app_state_sync",
  history: "history",
};

async function metaRequest(params: {
  path: string;
  accessToken: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}) {
  const response = await fetch(getWhatsAppGraphUrl(params.path), {
    method: params.method || "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      ...(params.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(params.body ? { body: JSON.stringify(params.body) } : {}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metaErrorMessage(data: unknown, fallback: string) {
  const root = recordValue(data);
  const error = recordValue(root.error);
  const errorData = recordValue(error.error_data);

  return (
    String(errorData.details || "").trim() ||
    String(error.message || "").trim() ||
    fallback
  );
}

async function solicitarSincronizacao(params: {
  empresaId: string;
  integracaoId: string;
  phoneNumberId: string;
  accessToken: string;
  tipo: SyncType;
  force?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const { data: existingJob, error: existingError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .select("*")
    .eq("integracao_whatsapp_id", params.integracaoId)
    .eq("tipo", params.tipo)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Erro ao consultar sincronização ${params.tipo}: ${existingError.message}`
    );
  }

  if (
    !params.force &&
    existingJob &&
    ["solicitado", "processando", "concluido", "recusado_usuario"].includes(
      existingJob.status
    )
  ) {
    return existingJob;
  }

  const agora = new Date().toISOString();
  const { data: pendingJob, error: pendingError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .upsert(
      {
        empresa_id: params.empresaId,
        integracao_whatsapp_id: params.integracaoId,
        tipo: params.tipo,
        status: "pendente",
        progresso: 0,
        fase: null,
        chunk_order: null,
        erro_codigo: null,
        erro_mensagem: null,
        concluido_em: null,
        ...(params.tipo === "history"
          ? {
              meta_concluido: false,
              worker_qstash_message_id: null,
              worker_agendado_em: null,
              worker_erro: null,
            }
          : {}),
        updated_at: agora,
      },
      {
        onConflict: "integracao_whatsapp_id,tipo",
      }
    )
    .select("*")
    .single();

  if (pendingError) {
    throw new Error(
      `Erro ao preparar sincronização ${params.tipo}: ${pendingError.message}`
    );
  }

  const result = await metaRequest({
    path: `${params.phoneNumberId}/smb_app_data`,
    accessToken: params.accessToken,
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      sync_type: META_SYNC_TYPE[params.tipo],
    },
  });

  if (!result.ok) {
    const message = metaErrorMessage(
      result.data,
      `A Meta recusou a sincronização ${params.tipo}.`
    );

    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status: "erro",
        erro_codigo: String(result.data?.error?.code || result.status),
        erro_mensagem: message,
        metadata_json: {
          meta_response: result.data,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", pendingJob.id);

    throw new Error(message);
  }

  const requestId =
    result.data?.request_id ||
    result.data?.messages?.[0]?.id ||
    result.data?.id ||
    null;
  const { data: requestedJob, error: requestedError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .update({
      status: "solicitado",
      request_id: requestId,
      solicitado_em: agora,
      metadata_json: {
        meta_response: result.data,
      },
      updated_at: agora,
    })
    .eq("id", pendingJob.id)
    .select("*")
    .single();

  if (requestedError) {
    throw new Error(
      `A Meta aceitou a sincronização ${params.tipo}, mas não foi possível registrar o pedido: ${requestedError.message}`
    );
  }

  return requestedJob;
}

export async function POST(request: NextRequest) {
  try {
    const contexto = await getUsuarioBasico();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    if (!contexto.usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const integracaoId = String(body?.integracao_id || "").trim();
    const reprocessarSync = body?.reprocessar_sync === true;

    if (!integracaoId) {
      return NextResponse.json(
        { ok: false, error: "integracao_id não informado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: integracao, error: integracaoError } = await supabase
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracaoId)
      .eq("empresa_id", contexto.usuario.empresa_id)
      .eq("provider", "meta_official")
      .maybeSingle();

    if (integracaoError) {
      return NextResponse.json(
        { ok: false, error: integracaoError.message },
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
      normalizeWhatsAppIntegrationMode(integracao.modo_integracao) !==
      "coexistence"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta integração não usa o modo Coexistência.",
        },
        { status: 409 }
      );
    }

    if (!integracao.phone_number_id || !integracao.waba_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A Meta ainda não retornou o WABA e o número do WhatsApp. Atualize os dados da conexão e tente novamente.",
        },
        { status: 400 }
      );
    }

    const accessToken = getWhatsAppAccessToken(integracao, {
      allowGlobalFallback: false,
    });

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Token da Meta não encontrado na integração." },
        { status: 400 }
      );
    }

    const phoneResult = await metaRequest({
      path: `${integracao.phone_number_id}?fields=id,display_phone_number,verified_name,status,is_on_biz_app,platform_type`,
      accessToken,
    });

    if (!phoneResult.ok) {
      const message = metaErrorMessage(
        phoneResult.data,
        "Não foi possível validar o número na Meta."
      );
      await supabase
        .from("integracoes_whatsapp")
        .update({
          coex_status: "erro",
          onboarding_status: "erro",
          onboarding_erro: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integracao.id)
        .eq("empresa_id", contexto.usuario.empresa_id);

      return NextResponse.json(
        { ok: false, error: message, meta_response: phoneResult.data },
        { status: phoneResult.status }
      );
    }

    const isOnBizApp = phoneResult.data?.is_on_biz_app === true;
    const platformType = String(
      phoneResult.data?.platform_type || ""
    ).toUpperCase();

    if (!isOnBizApp || platformType !== "CLOUD_API") {
      const message =
        "A Meta não confirmou este número como elegível para uso simultâneo no WhatsApp Business App e na Cloud API.";

      await supabase
        .from("integracoes_whatsapp")
        .update({
          is_on_biz_app: isOnBizApp,
          platform_type: phoneResult.data?.platform_type || null,
          coex_status: "erro",
          onboarding_status: "erro",
          onboarding_erro: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integracao.id)
        .eq("empresa_id", contexto.usuario.empresa_id);

      return NextResponse.json(
        { ok: false, error: message, meta_response: phoneResult.data },
        { status: 409 }
      );
    }

    const subscribeResult = await metaRequest({
      path: `${integracao.waba_id}/subscribed_apps`,
      accessToken,
      method: "POST",
    });

    if (!subscribeResult.ok) {
      const message = metaErrorMessage(
        subscribeResult.data,
        "Não foi possível inscrever o webhook da WABA."
      );

      return NextResponse.json(
        { ok: false, error: message, meta_response: subscribeResult.data },
        { status: subscribeResult.status }
      );
    }

    const agora = new Date().toISOString();
    await supabase
      .from("integracoes_whatsapp")
      .update({
        is_on_biz_app: true,
        platform_type: phoneResult.data?.platform_type || "CLOUD_API",
        coex_status: "sincronizando",
        webhook_verificado: true,
        app_assigned: true,
        onboarding_etapa: "coex_sincronizando",
        onboarding_status: "em_andamento",
        onboarding_erro: null,
        coex_sync_started_at:
          integracao.coex_sync_started_at || agora,
        updated_at: agora,
      })
      .eq("id", integracao.id)
      .eq("empresa_id", contexto.usuario.empresa_id);

    const contactsJob = await solicitarSincronizacao({
      empresaId: contexto.usuario.empresa_id,
      integracaoId: integracao.id,
      phoneNumberId: integracao.phone_number_id,
      accessToken,
      tipo: "contacts",
      force: reprocessarSync,
    });
    const historyJob = await solicitarSincronizacao({
      empresaId: contexto.usuario.empresa_id,
      integracaoId: integracao.id,
      phoneNumberId: integracao.phone_number_id,
      accessToken,
      tipo: "history",
      force: reprocessarSync,
    });

    const { data: atualizada, error: updateError } = await supabase
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracao.id)
      .eq("empresa_id", contexto.usuario.empresa_id)
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      integracao: sanitizeWhatsAppIntegrationForClient(atualizada),
      sync: {
        contacts: contactsJob,
        history: historyJob,
      },
    });
  } catch (error) {
    console.error("[WHATSAPP COEX] Erro ao ativar:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao ativar a Coexistência.",
      },
      { status: 500 }
    );
  }
}
