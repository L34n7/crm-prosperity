import { NextRequest, NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";
import {
  classifyCoexistenceSyncError,
  getCoexistenceSyncWindow,
  isCoexistenceSyncJobFromCurrentOnboarding,
  shouldReuseCoexistenceSyncJob,
} from "@/lib/whatsapp/coexistence-sync-policy";
import { finishCoexistenceIntegrationIfReady } from "@/lib/whatsapp/coexistence-history-queue";

type SyncType = "contacts" | "history";

type SyncJobRecord = {
  id: string;
  status: string;
  erro_mensagem?: string | null;
  metadata_json?: unknown;
  solicitado_em?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

type SyncRequestOutcome = {
  tipo: SyncType;
  job: SyncJobRecord;
  requested: boolean;
  skipped: boolean;
  warning: string | null;
};

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
  coexOnboardedAt?: string | null;
}): Promise<SyncRequestOutcome> {
  const supabase = getSupabaseAdmin();
  const { data: existingJobOriginal, error: existingError } = await supabase
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

  const existingJob = existingJobOriginal as SyncJobRecord | null;

  async function reuseExistingJob(
    job: SyncJobRecord
  ): Promise<SyncRequestOutcome> {
    let warning: string | null = null;

    if (job.status === "erro") {
      const classified = classifyCoexistenceSyncError({
        data: {
          error: {
            message: job.erro_mensagem,
          },
        },
        fallback: `A sincronização ${params.tipo} não foi concluída.`,
      });
      warning = classified.userMessage;

      const metadata = recordValue(job.metadata_json);
      if (!recordValue(metadata.sync_error).classification) {
        const { data: normalizedJob } = await supabase
          .from("whatsapp_coex_sync_jobs")
          .update({
            metadata_json: {
              ...metadata,
              coex_onboarded_at: params.coexOnboardedAt || null,
              external_request_made: true,
              retryable: false,
              sync_error: classified,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .select("*")
          .maybeSingle();

        if (normalizedJob) job = normalizedJob;
      }
    }

    return {
      tipo: params.tipo,
      job,
      requested: false,
      skipped: true,
      warning,
    };
  }

  if (
    existingJob &&
    shouldReuseCoexistenceSyncJob(existingJob, params.coexOnboardedAt)
  ) {
    return reuseExistingJob(existingJob);
  }

  const agora = new Date().toISOString();
  const syncWindow = getCoexistenceSyncWindow({
    onboardedAt: params.coexOnboardedAt,
  });
  const resetPayload = {
    empresa_id: params.empresaId,
    integracao_whatsapp_id: params.integracaoId,
    tipo: params.tipo,
    progresso: 0,
    processamento_progresso: 0,
    itens_recebidos: 0,
    itens_processados: 0,
    itens_ignorados: 0,
    itens_com_erro: 0,
    fase: null,
    chunk_order: null,
    request_id: null,
    erro_codigo: null,
    erro_mensagem: null,
    solicitado_em: null,
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
  };

  async function prepareJobForCurrentOnboarding(
    payload: Record<string, unknown>
  ): Promise<SyncJobRecord> {
    let observedJob = existingJob;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (
        observedJob &&
        isCoexistenceSyncJobFromCurrentOnboarding(
          observedJob,
          params.coexOnboardedAt
        )
      ) {
        // Outro request já pode ter preparado ou reservado este mesmo job.
        // Nesse caso, nunca sobrescrevemos o marcador da chamada externa.
        const desiredStatus = String(payload.status || "");
        if (
          shouldReuseCoexistenceSyncJob(
            observedJob,
            params.coexOnboardedAt
          ) ||
          (observedJob.status === "pendente" && desiredStatus === "pendente")
        ) {
          return observedJob;
        }
      }

      if (observedJob) {
        let updateQuery = supabase
          .from("whatsapp_coex_sync_jobs")
          .update(payload)
          .eq("id", observedJob.id);

        updateQuery = observedJob.updated_at
          ? updateQuery.eq("updated_at", observedJob.updated_at)
          : updateQuery.is("updated_at", null);

        const { data: updatedJob, error: updateError } = await updateQuery
          .select("*")
          .maybeSingle();

        if (updateError) {
          throw new Error(
            `Erro ao preparar sincronização ${params.tipo}: ${updateError.message}`
          );
        }

        if (updatedJob) return updatedJob as SyncJobRecord;
      } else {
        const { data: insertedJob, error: insertError } = await supabase
          .from("whatsapp_coex_sync_jobs")
          .upsert(payload, {
            onConflict: "integracao_whatsapp_id,tipo",
            ignoreDuplicates: true,
          })
          .select("*")
          .maybeSingle();

        if (insertError) {
          throw new Error(
            `Erro ao preparar sincronização ${params.tipo}: ${insertError.message}`
          );
        }

        if (insertedJob) return insertedJob as SyncJobRecord;
      }

      const { data: currentJob, error: currentError } = await supabase
        .from("whatsapp_coex_sync_jobs")
        .select("*")
        .eq("integracao_whatsapp_id", params.integracaoId)
        .eq("tipo", params.tipo)
        .maybeSingle();

      if (currentError) {
        throw new Error(
          `Erro ao recuperar sincronização concorrente ${params.tipo}: ${currentError.message}`
        );
      }

      observedJob = currentJob as SyncJobRecord | null;
    }

    throw new Error(
      `Não foi possível reservar com segurança a sincronização ${params.tipo}.`
    );
  }

  if (!syncWindow.allowed) {
    const missingOnboarding = syncWindow.reason === "missing_onboarding";
    const warning = missingOnboarding
      ? "A data do onboarding da Meta não foi encontrada. Reconecte o número para liberar uma nova janela de sincronização."
      : "A janela de 24 horas da Meta para importar os dados anteriores terminou.";
    const unavailableJob = await prepareJobForCurrentOnboarding({
      ...resetPayload,
      status: "erro",
      erro_codigo: missingOnboarding
        ? "SYNC_ONBOARDING_MISSING"
        : "SYNC_WINDOW_EXPIRED",
      erro_mensagem: warning,
      metadata_json: {
        coex_onboarded_at: params.coexOnboardedAt || null,
        sync_window_expires_at: syncWindow.expiresAt,
        external_request_made: false,
        retryable: false,
        sync_error: {
          classification: missingOnboarding
            ? "meta_rejected"
            : "window_expired",
          userMessage: warning,
        },
      },
    });

    if (
      shouldReuseCoexistenceSyncJob(
        unavailableJob,
        params.coexOnboardedAt
      ) &&
      unavailableJob.erro_mensagem !== warning
    ) {
      return reuseExistingJob(unavailableJob);
    }

    return {
      tipo: params.tipo,
      job: unavailableJob,
      requested: false,
      skipped: true,
      warning,
    };
  }

  const pendingJob = await prepareJobForCurrentOnboarding({
    ...resetPayload,
    status: "pendente",
    metadata_json: {
      coex_onboarded_at: params.coexOnboardedAt || null,
      sync_window_expires_at: syncWindow.expiresAt,
      external_request_made: false,
      retryable: false,
    },
  });

  if (
    shouldReuseCoexistenceSyncJob(pendingJob, params.coexOnboardedAt)
  ) {
    return reuseExistingJob(pendingJob);
  }

  const requestMetadata = {
    ...recordValue(pendingJob.metadata_json),
    request_started_at: agora,
    external_request_made: true,
    retryable: false,
  };
  const { data: claimedJob, error: claimError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .update({
      status: "solicitado",
      solicitado_em: agora,
      metadata_json: requestMetadata,
      updated_at: agora,
    })
    .eq("id", pendingJob.id)
    .eq("status", "pendente")
    .is("solicitado_em", null)
    .select("*")
    .maybeSingle();

  if (claimError) {
    throw new Error(
      `Erro ao reservar a sincronização ${params.tipo}: ${claimError.message}`
    );
  }

  if (!claimedJob) {
    const { data: concurrentJob, error: concurrentError } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .select("*")
      .eq("id", pendingJob.id)
      .single();

    if (concurrentError) {
      throw new Error(
        `Erro ao recuperar sincronização concorrente ${params.tipo}: ${concurrentError.message}`
      );
    }

    return {
      tipo: params.tipo,
      job: concurrentJob,
      requested: false,
      skipped: true,
      warning: null,
    };
  }

  let result: Awaited<ReturnType<typeof metaRequest>>;

  try {
    result = await metaRequest({
      path: `${params.phoneNumberId}/smb_app_data`,
      accessToken: params.accessToken,
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        sync_type: META_SYNC_TYPE[params.tipo],
      },
    });
  } catch (error) {
    const classified = classifyCoexistenceSyncError({
      fallback:
        error instanceof Error
          ? error.message
          : `Não foi possível solicitar a sincronização ${params.tipo}.`,
      unknownResult: true,
    });
    const { data: failedJob } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status: "erro",
        erro_codigo: "SYNC_RESULT_UNKNOWN",
        erro_mensagem: classified.userMessage,
        metadata_json: {
          ...requestMetadata,
          sync_error: classified,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimedJob.id)
      .eq("status", "solicitado")
      .select("*")
      .maybeSingle();

    return {
      tipo: params.tipo,
      job: failedJob || claimedJob,
      requested: true,
      skipped: false,
      warning: classified.userMessage,
    };
  }

  if (!result.ok) {
    const classified = classifyCoexistenceSyncError({
      data: result.data,
      fallback: `A Meta recusou a sincronização ${params.tipo}.`,
    });
    const { data: failedJob } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status: "erro",
        erro_codigo: String(result.data?.error?.code || result.status),
        erro_mensagem: classified.userMessage,
        metadata_json: {
          ...requestMetadata,
          meta_response: result.data,
          sync_error: classified,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimedJob.id)
      .eq("status", "solicitado")
      .select("*")
      .maybeSingle();

    return {
      tipo: params.tipo,
      job: failedJob || claimedJob,
      requested: true,
      skipped: false,
      warning: classified.userMessage,
    };
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
      metadata_json: {
        ...requestMetadata,
        meta_response: result.data,
        accepted_by_meta: true,
      },
      updated_at: agora,
    })
    .eq("id", claimedJob.id)
    .eq("status", "solicitado")
    .select("*")
    .maybeSingle();

  if (requestedError) {
    throw new Error(
      `A Meta aceitou a sincronização ${params.tipo}, mas não foi possível registrar o pedido: ${requestedError.message}`
    );
  }

  return {
    tipo: params.tipo,
    job: requestedJob || claimedJob,
    requested: true,
    skipped: false,
    warning: null,
  };
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
    const displayPhoneNumber = String(
      phoneResult.data?.display_phone_number || ""
    ).trim();
    const verifiedName = String(
      phoneResult.data?.verified_name || ""
    ).trim();
    const phoneStatus = String(phoneResult.data?.status || "").trim();
    const { error: operationalUpdateError } = await supabase
      .from("integracoes_whatsapp")
      .update({
        ...(displayPhoneNumber
          ? {
              numero: displayPhoneNumber,
              phone_number_display_name: displayPhoneNumber,
            }
          : {}),
        ...(verifiedName ? { verified_name: verifiedName } : {}),
        ...(phoneStatus ? { phone_number_status: phoneStatus } : {}),
        is_on_biz_app: true,
        platform_type: phoneResult.data?.platform_type || "CLOUD_API",
        coex_status: "ativo",
        webhook_verificado: true,
        app_assigned: true,
        onboarding_etapa: "numero_registrado",
        onboarding_status: "em_andamento",
        onboarding_erro: null,
        coex_sync_started_at: null,
        coex_sync_completed_at: null,
        ultimo_sync_at: agora,
        updated_at: agora,
      })
      .eq("id", integracao.id)
      .eq("empresa_id", contexto.usuario.empresa_id);

    if (operationalUpdateError) {
      throw new Error(
        `A coexistência foi validada, mas não foi possível salvar o estado operacional: ${operationalUpdateError.message}`
      );
    }

    const syncResults = await Promise.allSettled(
      (["contacts", "history"] as const).map((tipo) =>
        solicitarSincronizacao({
          empresaId: contexto.usuario.empresa_id!,
          integracaoId: integracao.id,
          phoneNumberId: integracao.phone_number_id,
          accessToken,
          tipo,
          coexOnboardedAt: integracao.coex_onboarded_at,
        })
      )
    );
    const syncOutcomes: SyncRequestOutcome[] = [];
    const syncWarnings: string[] = [];

    for (const result of syncResults) {
      if (result.status === "fulfilled") {
        syncOutcomes.push(result.value);
        if (result.value.warning) syncWarnings.push(result.value.warning);
        continue;
      }

      syncWarnings.push(
        result.reason instanceof Error
          ? result.reason.message
          : "Não foi possível preparar uma das importações iniciais."
      );
    }

    const syncStartedAt = syncOutcomes
      .map((outcome) => outcome.job?.solicitado_em)
      .filter(Boolean)
      .sort()[0];

    if (syncStartedAt) {
      await supabase
        .from("integracoes_whatsapp")
        .update({
          coex_sync_started_at: syncStartedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integracao.id)
        .eq("empresa_id", contexto.usuario.empresa_id);
    }

    await finishCoexistenceIntegrationIfReady(integracao.id);

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
      operational: true,
      integracao: sanitizeWhatsAppIntegrationForClient(atualizada),
      sync: {
        jobs: syncOutcomes.map((outcome) => outcome.job),
        outcomes: syncOutcomes,
        warnings: [...new Set(syncWarnings)],
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
