import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import {
  encryptWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

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

    if (
      modoIntegracao === "coexistence" &&
      embeddedSignupEvent !==
        "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A Meta não concluiu o fluxo de Coexistência. Confirme que o número já está ativo no WhatsApp Business App e tente novamente.",
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
          onboarding_etapa: wabaId ? "waba_criada" : "meta_conectado",
          onboarding_status: "em_andamento",
          onboarding_erro: null,
          token_ref: "config_json.access_token_encrypted",
          waba_id: wabaId || integracao.waba_id,
          phone_number_id: phoneNumberId || integracao.phone_number_id,
          business_portfolio_id: businessPortfolioId || integracao.business_portfolio_id,
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
