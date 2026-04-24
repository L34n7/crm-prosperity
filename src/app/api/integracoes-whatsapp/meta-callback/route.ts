import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const REDIRECT_URI = "https://crm-prosperity.vercel.app/configuracao-meta-callback";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = body?.code;
    const state = body?.state;

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

    const tokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
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

    const agora = new Date().toISOString();

    const configJsonAtual =
      integracao.config_json && typeof integracao.config_json === "object"
        ? integracao.config_json
        : {};

    const { data: integracaoAtualizada, error: updateError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_etapa: "meta_conectado",
          onboarding_status: "em_andamento",
          onboarding_erro: null,
          token_ref: "config_json.access_token",
          config_json: {
            ...configJsonAtual,
            access_token: accessToken,
            token_type: tokenData?.token_type ?? null,
            expires_in: tokenData?.expires_in ?? null,
            meta_token_response: tokenData,
            meta_connected_at: agora,
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
      integracao: integracaoAtualizada,
    });
  } catch (error) {
    console.error("[META CALLBACK] Erro interno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao processar callback da Meta." },
      { status: 500 }
    );
  }
}