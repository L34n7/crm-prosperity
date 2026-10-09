import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const integracaoId = textValue(body?.integracao_id);
    const phoneNumberId = textValue(body?.phone_number_id);

    if (!integracaoId || !phoneNumberId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Integração e número precisam ser informados.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracaoId)
      .eq("empresa_id", empresaId)
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
        { ok: false, error: "Integração não encontrada." },
        { status: 404 }
      );
    }

    if (integracao.modo_integracao !== "coexistence") {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta seleção é exclusiva para conexões de Coexistência.",
        },
        { status: 409 }
      );
    }

    const configJson = recordValue(integracao.config_json);
    const pendingSelection = recordValue(
      configJson.coexistence_phone_selection
    );
    const rawCandidates = Array.isArray(pendingSelection.candidates)
      ? pendingSelection.candidates
      : [];
    const candidates = rawCandidates.map(recordValue);

    if (pendingSelection.required !== true || !candidates.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Não existe uma seleção de número pendente para esta conexão.",
        },
        { status: 409 }
      );
    }

    const candidate = candidates.find(
      (item) => textValue(item.phone_number_id) === phoneNumberId
    );

    if (!candidate) {
      return NextResponse.json(
        {
          ok: false,
          error: "O número selecionado não pertence à autorização atual da Meta.",
        },
        { status: 403 }
      );
    }

    const wabaId = textValue(candidate.waba_id);
    if (!wabaId) {
      return NextResponse.json(
        {
          ok: false,
          error: "A WABA do número selecionado não foi identificada.",
        },
        { status: 400 }
      );
    }

    const accessToken = getWhatsAppAccessToken(integracao, {
      allowGlobalFallback: false,
    });

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A autorização da Meta expirou ou não foi salva. Conecte novamente a conta Meta.",
        },
        { status: 409 }
      );
    }

    const phoneResponse = await fetch(
      getWhatsAppGraphUrl(
        `${phoneNumberId}?fields=id,display_phone_number,verified_name,status,is_on_biz_app,platform_type`
      ),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );
    const phoneData = await phoneResponse.json().catch(() => null);

    if (!phoneResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            recordValue(phoneData).error &&
            typeof recordValue(phoneData).error === "object"
              ? textValue(recordValue(recordValue(phoneData).error).message) ||
                "Não foi possível validar o número na Meta."
              : "Não foi possível validar o número na Meta.",
          meta_response: phoneData,
        },
        { status: phoneResponse.status }
      );
    }

    const phone = recordValue(phoneData);
    const isOnBizApp = phone.is_on_biz_app === true;
    const platformType = textValue(phone.platform_type).toUpperCase();

    if (!isOnBizApp || platformType !== "CLOUD_API") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O número selecionado não está elegível para Coexistência no WhatsApp Business App.",
        },
        { status: 409 }
      );
    }

    const agora = new Date().toISOString();
    const businessPortfolioId =
      textValue(pendingSelection.business_portfolio_id) ||
      textValue(integracao.business_portfolio_id) ||
      null;

    const { data: atualizada, error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update({
        onboarding_etapa: "waba_criada",
        onboarding_status: "em_andamento",
        onboarding_erro: null,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        business_portfolio_id: businessPortfolioId,
        coex_status: "onboarded",
        coex_onboarded_at: agora,
        config_json: {
          ...configJson,
          embedded_signup_event: "GRAPH_VERIFIED_COEXISTENCE_SELECTION",
          embedded_signup_graph_recovery: {
            recovered_at: agora,
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            business_portfolio_id: businessPortfolioId,
            phone,
          },
          coexistence_phone_selection: {
            ...pendingSelection,
            required: false,
            resolved_at: agora,
            selected_phone_number_id: phoneNumberId,
          },
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
      integracao: sanitizeWhatsAppIntegrationForClient(atualizada),
    });
  } catch (error) {
    console.error("[COEX PHONE SELECTION] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno ao selecionar o número da Coexistência.",
      },
      { status: 500 }
    );
  }
}
