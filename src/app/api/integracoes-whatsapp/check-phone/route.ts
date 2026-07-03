import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
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
        { ok: false, error: "Empresa não encontrada para o usuário." },
        { status: 403 }
      );
    }

    const empresaId = contexto.usuario.empresa_id;

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("provider", "meta_official")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (integracaoError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao buscar integração WhatsApp.",
          details: integracaoError.message,
        },
        { status: 500 }
      );
    }

    if (!integracao) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nenhuma integração WhatsApp encontrada para esta empresa.",
        },
        { status: 404 }
      );
    }

    if (!integracao.waba_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "A integração não possui waba_id salvo.",
          integracao_id: integracao.id,
        },
        { status: 400 }
      );
    }

    const accessToken = getWhatsAppAccessToken(integracao);

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Token de acesso não encontrado. Salve o token em config_json.access_token ou defina WHATSAPP_ACCESS_TOKEN temporariamente.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      getWhatsAppGraphUrl(
        `${integracao.waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,account_mode,messaging_limit_tier,is_on_biz_app,platform_type`
      ),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          status: "erro",
          onboarding_status: "erro",
          onboarding_erro:
            data?.error?.message || "Erro ao consultar números na Meta",
          ultimo_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao consultar números da WABA na Meta.",
          meta_response: data,
        },
        { status: response.status }
      );
    }

    const lista = Array.isArray(data?.data) ? data.data : [];

    const numeroAtual = lista.find(
      (item: any) =>
        item?.id === integracao.phone_number_id ||
        item?.display_phone_number === integracao.numero
    );

    const payloadUpdate: Record<string, any> = {
      ultimo_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      onboarding_erro: null,
    };

    if (numeroAtual) {
      if (numeroAtual.display_phone_number) {
        payloadUpdate.numero = numeroAtual.display_phone_number;
      }

      if (numeroAtual.verified_name) {
        payloadUpdate.verified_name = numeroAtual.verified_name;
      }

      if (numeroAtual.display_phone_number) {
        payloadUpdate.phone_number_display_name =
          numeroAtual.display_phone_number;
      }

      if (numeroAtual.code_verification_status) {
        payloadUpdate.code_verification_status =
          numeroAtual.code_verification_status;
      }

      if (numeroAtual.quality_rating) {
        payloadUpdate.quality_rating = numeroAtual.quality_rating;
      }

      if (numeroAtual.name_status) {
        payloadUpdate.phone_number_status = numeroAtual.name_status;
      }

      if (numeroAtual.status) {
        payloadUpdate.phone_number_status = numeroAtual.status;
      }

      if (numeroAtual.messaging_limit_tier) {
        payloadUpdate.meta_messaging_limit_tier =
          numeroAtual.messaging_limit_tier;
      }

      if (numeroAtual.account_mode) {
        payloadUpdate.meta_account_mode = numeroAtual.account_mode;
      }

      if (
        normalizeWhatsAppIntegrationMode(integracao.modo_integracao) ===
        "coexistence"
      ) {
        payloadUpdate.is_on_biz_app =
          numeroAtual.is_on_biz_app === true;
        payloadUpdate.platform_type =
          numeroAtual.platform_type || null;
        payloadUpdate.coex_status =
          numeroAtual.is_on_biz_app === true &&
          String(numeroAtual.platform_type || "").toUpperCase() ===
            "CLOUD_API"
            ? integracao.coex_status === "ativo"
              ? "ativo"
              : "onboarded"
            : "erro";
      }

      payloadUpdate.meta_saude_ultima_verificacao_em = new Date().toISOString();
      payloadUpdate.meta_saude_raw_json = numeroAtual;
      payloadUpdate.config_json = {
        ...(integracao.config_json || {}),
        whatsapp_meta_health: {
          phone_number_status:
            numeroAtual.status || numeroAtual.name_status || null,
          quality_rating: numeroAtual.quality_rating || null,
          messaging_limit_tier: numeroAtual.messaging_limit_tier || null,
          messaging_limit: null,
          account_mode: numeroAtual.account_mode || null,
          checked_at: payloadUpdate.meta_saude_ultima_verificacao_em,
          raw: numeroAtual,
        },
      };

      if (!integracao.phone_number_id && numeroAtual.id) {
        payloadUpdate.phone_number_id = numeroAtual.id;
      }
    }

    const { data: integracaoAtualizada, error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update(payloadUpdate)
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
      total_numeros: lista.length,
      numero_atual: numeroAtual ?? null,
      data,
    });
  } catch (error) {
    console.error("[CHECK PHONE] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno ao consultar números da WABA.",
      },
      { status: 500 }
    );
  }
}
