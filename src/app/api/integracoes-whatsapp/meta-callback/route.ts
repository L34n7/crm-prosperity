import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  encryptWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";
import { isWhatsAppEmbeddedSignupFinishEvent } from "@/lib/whatsapp/embedded-signup-v4";


type CoexistenceAssetResolution =
  | {
      ok: true;
      wabaId: string;
      phoneNumberId: string;
      businessPortfolioId: string | null;
      phone: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      metaStatus?: number;
    };

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function graphGet(path: string, accessToken: string) {
  const response = await fetch(getWhatsAppGraphUrl(path), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function metaErrorMessage(data: unknown, fallback: string) {
  const root = recordValue(data);
  const error = recordValue(root.error);
  const errorData = recordValue(error.error_data);

  return (
    textValue(errorData.details) ||
    textValue(error.message) ||
    fallback
  );
}

async function resolveCoexistenceAssetsFromGraph(params: {
  accessToken: string;
  appId: string;
  appSecret: string;
  preferredWabaId?: string | null;
  preferredPhoneNumberId?: string | null;
}): Promise<CoexistenceAssetResolution> {
  const preferredWabaId = textValue(params.preferredWabaId);
  const preferredPhoneNumberId = textValue(params.preferredPhoneNumberId);

  let businessPortfolioId: string | null = null;
  let wabas: Array<Record<string, unknown>> = [];

  if (preferredWabaId) {
    wabas = [{ id: preferredWabaId }];
  } else {
    const debugUrl = new URL(getWhatsAppGraphUrl("debug_token"));
    debugUrl.searchParams.set("input_token", params.accessToken);
    debugUrl.searchParams.set(
      "access_token",
      `${params.appId}|${params.appSecret}`
    );

    const debugResponse = await fetch(debugUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });
    const debugData = await debugResponse.json().catch(() => null);

    if (debugResponse.ok) {
      const debugRoot = recordValue(recordValue(debugData).data);
      const granularScopes = Array.isArray(debugRoot.granular_scopes)
        ? debugRoot.granular_scopes.map(recordValue)
        : [];

      const targetIds = new Set<string>();

      for (const scope of granularScopes) {
        const scopeName = textValue(scope.scope);
        if (
          scopeName !== "whatsapp_business_management" &&
          scopeName !== "whatsapp_business_messaging"
        ) {
          continue;
        }

        const targets = Array.isArray(scope.target_ids)
          ? scope.target_ids
          : [];
        for (const target of targets) {
          const targetId = textValue(target);
          if (targetId) targetIds.add(targetId);
        }
      }

      wabas = Array.from(targetIds).map((id) => ({ id }));
    }

    const me = await graphGet(
      "me?fields=id,client_business_id",
      params.accessToken
    );

    if (me.ok) {
      businessPortfolioId =
        textValue(recordValue(me.data).client_business_id) || null;
    }

    // Fallback para configurações antigas que ainda concedem business_management.
    if (!wabas.length && businessPortfolioId) {
      const wabasResult = await graphGet(
        `${businessPortfolioId}/owned_whatsapp_business_accounts?fields=id,name`,
        params.accessToken
      );

      if (wabasResult.ok) {
        const rows = recordValue(wabasResult.data).data;
        wabas = Array.isArray(rows)
          ? rows.map(recordValue).filter((item) => textValue(item.id))
          : [];
      } else {
        console.warn("[META CALLBACK] owned_whatsapp_business_accounts indisponível; usando granular scopes quando possível.", {
          status: wabasResult.status,
          error: metaErrorMessage(wabasResult.data, "Falha ao consultar WABAs."),
        });
      }
    }
  }

  if (!wabas.length) {
    return {
      ok: false,
      error:
        "A Meta não retornou nenhuma conta do WhatsApp disponível para esta autorização.",
    };
  }

  const candidates: Array<{
    wabaId: string;
    phoneNumberId: string;
    phone: Record<string, unknown>;
  }> = [];

  const phoneResults = await Promise.all(
    wabas.slice(0, 20).map(async (waba) => {
      const wabaId = textValue(waba.id);
      const result = await graphGet(
        `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status,is_on_biz_app,platform_type`,
        params.accessToken
      );

      return { wabaId, result };
    })
  );

  for (const { wabaId, result } of phoneResults) {
    if (!result.ok) continue;

    const rows = recordValue(result.data).data;
    if (!Array.isArray(rows)) continue;

    for (const rawPhone of rows) {
      const phone = recordValue(rawPhone);
      const phoneNumberId = textValue(phone.id);
      const isOnBizApp = phone.is_on_biz_app === true;
      const platformType = textValue(phone.platform_type).toUpperCase();

      if (
        phoneNumberId &&
        isOnBizApp &&
        platformType === "CLOUD_API"
      ) {
        candidates.push({
          wabaId,
          phoneNumberId,
          phone,
        });
      }
    }
  }

  const preferredCandidate = preferredPhoneNumberId
    ? candidates.find(
        (candidate) => candidate.phoneNumberId === preferredPhoneNumberId
      )
    : null;

  const selected =
    preferredCandidate || (candidates.length === 1 ? candidates[0] : null);

  if (!selected) {
    if (candidates.length > 1) {
      return {
        ok: false,
        error:
          "A autorização foi concluída, mas a Meta retornou mais de um número elegível para Coexistência. Reabra o Embedded Signup e selecione o número desejado.",
      };
    }

    return {
      ok: false,
      error:
        "A autorização foi concluída, mas a Meta ainda não confirmou nenhum número com Coexistência ativa no WhatsApp Business App.",
    };
  }

  return {
    ok: true,
    wabaId: selected.wabaId,
    phoneNumberId: selected.phoneNumberId,
    businessPortfolioId,
    phone: selected.phone,
  };
}

export async function POST(request: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

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

    const body = await request.json();
    const code = body?.code;
    const state = body?.state;
    const wabaId = body?.waba_id || null;
    const phoneNumberId = body?.phone_number_id || null;
    const businessPortfolioId = body?.business_portfolio_id || null;
    const embeddedSignup = body?.embedded_signup || null;

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Code não informado." },
        { status: 400 }
      );
    }

    if (!state) {
      return NextResponse.json(
        { ok: false, error: "State não informado." },
        { status: 400 }
      );
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { ok: false, error: "META_APP_ID ou META_APP_SECRET não configurado." },
        { status: 500 }
      );
    }

    const tokenUrl = new URL(getWhatsAppGraphUrl("oauth/access_token"));
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {

    console.error("[META TOKEN ERROR]", tokenData);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao trocar code por token.",
          meta_response: tokenData,
        },
        { status: tokenResponse.status }
      );
    }

    const accessToken = tokenData?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "A Meta não retornou access_token.",
          meta_response: tokenData,
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", state)
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
        {
          ok: false,
          error:
            "Integração não encontrada pelo state. O state precisa ser o ID da integração.",
        },
        { status: 404 }
      );
    }

    const modoIntegracao = normalizeWhatsAppIntegrationMode(
      integracao.modo_integracao
    );
    const embeddedSignupEvent = String(
      embeddedSignup?.event || ""
    ).trim();

    if (!integracao.modo_integracao_escolhido_em) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O modo de integração precisa ser escolhido antes da conexão com a Meta.",
        },
        { status: 409 }
      );
    }

    let effectiveWabaId = textValue(wabaId) || textValue(integracao.waba_id) || null;
    let effectivePhoneNumberId =
      textValue(phoneNumberId) || textValue(integracao.phone_number_id) || null;
    let effectiveBusinessPortfolioId =
      textValue(businessPortfolioId) ||
      textValue(integracao.business_portfolio_id) ||
      null;
    let coexistenceVerifiedByGraph = false;
    let coexistenceGraphPhone: Record<string, unknown> | null = null;

    if (
      modoIntegracao === "coexistence" &&
      (!isWhatsAppEmbeddedSignupFinishEvent(embeddedSignupEvent) ||
        !effectiveWabaId ||
        !effectivePhoneNumberId)
    ) {
      const graphResolution = await resolveCoexistenceAssetsFromGraph({
        accessToken,
        appId,
        appSecret,
        preferredWabaId: effectiveWabaId,
        preferredPhoneNumberId: effectivePhoneNumberId,
      });

      if (!graphResolution.ok) {
        console.warn("[META CALLBACK] Coexistência não confirmada após OAuth:", {
          integracaoId: integracao.id,
          embeddedSignupEvent: embeddedSignupEvent || null,
          possuiWabaId: Boolean(effectiveWabaId),
          possuiPhoneNumberId: Boolean(effectivePhoneNumberId),
          launcherVersion: embeddedSignup?.launcher_version || null,
          error: graphResolution.error,
        });

        return NextResponse.json(
          {
            ok: false,
            error: graphResolution.error,
          },
          { status: 400 }
        );
      }

      effectiveWabaId = graphResolution.wabaId;
      effectivePhoneNumberId = graphResolution.phoneNumberId;
      effectiveBusinessPortfolioId =
        effectiveBusinessPortfolioId || graphResolution.businessPortfolioId;
      coexistenceVerifiedByGraph = true;
      coexistenceGraphPhone = graphResolution.phone;
    }

    if (
      modoIntegracao === "coexistence" &&
      !isWhatsAppEmbeddedSignupFinishEvent(embeddedSignupEvent) &&
      !coexistenceVerifiedByGraph
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A Meta não confirmou a conclusão do Embedded Signup para Coexistência.",
        },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();

    const configJsonAtual =
      integracao.config_json && typeof integracao.config_json === "object"
        ? integracao.config_json
        : {};

    const { data: integracaoAtualizada, error: updateError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_etapa: effectiveWabaId ? "waba_criada" : "meta_conectado",
          onboarding_status: "em_andamento",
          onboarding_erro: null,
          token_ref: "config_json.access_token_encrypted",
          waba_id: effectiveWabaId,
          phone_number_id: effectivePhoneNumberId,
          business_portfolio_id: effectiveBusinessPortfolioId,
          ...(modoIntegracao === "coexistence"
            ? {
                coex_status: "onboarded",
                coex_onboarded_at: agora,
              }
            : {}),
          config_json: {
            ...configJsonAtual,
            access_token: undefined,
            access_token_encrypted:
              encryptWhatsAppAccessToken(accessToken),
            token_type: tokenData?.token_type ?? null,
            expires_in: tokenData?.expires_in ?? null,
            meta_token_response: {
              token_type: tokenData?.token_type ?? null,
              expires_in: tokenData?.expires_in ?? null,
            },
            meta_connected_at: agora,
            embedded_signup: embeddedSignup,
            embedded_signup_event:
              embeddedSignupEvent ||
              (coexistenceVerifiedByGraph ? "GRAPH_VERIFIED_COEXISTENCE" : null),
            embedded_signup_launcher_version:
              embeddedSignup?.launcher_version || null,
            embedded_signup_graph_recovery: coexistenceVerifiedByGraph
              ? {
                  recovered_at: agora,
                  waba_id: effectiveWabaId,
                  phone_number_id: effectivePhoneNumberId,
                  business_portfolio_id: effectiveBusinessPortfolioId,
                  phone: coexistenceGraphPhone,
                }
              : null,
          },
          ultimo_sync_at: agora,
          updated_at: agora,
        })
        .eq("id", integracao.id)
        .select("*")
        .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      integracao:
        sanitizeWhatsAppIntegrationForClient(integracaoAtualizada),
    });
  } catch (error) {
    console.error("[META CALLBACK] Erro interno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao processar callback da Meta." },
      { status: 500 }
    );
  }
}
