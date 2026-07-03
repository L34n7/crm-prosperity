import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import {
  getWhatsAppAccessToken,
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

async function fetchGraph(path: string, accessToken: string) {
  const url = new URL(getWhatsAppGraphUrl(path));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data,
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

    const { integracao_id } = await request.json();

    if (!integracao_id) {
      return NextResponse.json(
        { ok: false, error: "integracao_id não informado." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracao_id)
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
        { ok: false, error: "Integração não encontrada." },
        { status: 404 }
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

    const agora = new Date().toISOString();

    /**
     * 1. Descobre o business do cliente.
     */
    const meResult = await fetchGraph(
      "me?fields=id,client_business_id",
      accessToken
    );

    if (!meResult.ok) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_erro:
            meResult.data?.error?.message ||
            "Erro ao consultar client_business_id na Meta.",
          updated_at: agora,
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao consultar dados do token na Meta.",
          meta_response: meResult.data,
        },
        { status: meResult.status }
      );
    }

    const clientBusinessId = meResult.data?.client_business_id;

    if (!clientBusinessId) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_erro:
            "Token válido, mas a Meta não retornou client_business_id.",
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_dados_checked_at: agora,
          },
          updated_at: agora,
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error: "client_business_id não encontrado no token.",
          meta_response: meResult.data,
        },
        { status: 400 }
      );
    }

    /**
     * 2. Busca WABAs do business cliente.
     */
    const wabasResult = await fetchGraph(
      `${clientBusinessId}/owned_whatsapp_business_accounts?fields=id,name`,
      accessToken
    );

    if (!wabasResult.ok) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_erro:
            wabasResult.data?.error?.message ||
            "Erro ao consultar WABAs do cliente.",
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_wabas_response: wabasResult.data,
            meta_dados_checked_at: agora,
          },
          updated_at: agora,
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao consultar WABAs do cliente.",
          meta_response: wabasResult.data,
        },
        { status: wabasResult.status }
      );
    }

    const wabas = Array.isArray(wabasResult.data?.data)
      ? wabasResult.data.data
      : [];
    const waba =
      wabas.find(
        (item: { id?: string }) => item?.id === integracao.waba_id
      ) ||
      (wabas.length === 1 ? wabas[0] : null);

    if (!waba?.id) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_erro: "Nenhuma WABA encontrada para o business cliente.",
          meta_business_id: clientBusinessId,
          business_account_id: clientBusinessId,
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_wabas_response: wabasResult.data,
            meta_dados_checked_at: agora,
          },
          updated_at: agora,
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error:
            wabas.length > 1
              ? "A Meta retornou mais de uma WABA e não foi possível identificar a escolhida no onboarding."
              : "WABA não encontrada.",
          meta_response: {
            me: meResult.data,
            wabas: wabasResult.data,
          },
        },
        { status: 400 }
      );
    }

    /**
     * 3. Busca números da WABA.
     */
    const phonesResult = await fetchGraph(
      `${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,account_mode,messaging_limit_tier,is_on_biz_app,platform_type`,
      accessToken
    );

    if (!phonesResult.ok) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_erro:
            phonesResult.data?.error?.message ||
            "Erro ao consultar números da WABA.",
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_wabas_response: wabasResult.data,
            meta_phone_numbers_response: phonesResult.data,
            meta_dados_checked_at: agora,
          },
          updated_at: agora,
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao consultar números da WABA.",
          meta_response: phonesResult.data,
        },
        { status: phonesResult.status }
      );
    }

    const phones = Array.isArray(phonesResult.data?.data)
      ? phonesResult.data.data
      : [];
    const modoIntegracao = normalizeWhatsAppIntegrationMode(
      integracao.modo_integracao
    );
    const phonesCoexistence = phones.filter(
      (item: { is_on_biz_app?: boolean }) =>
        item?.is_on_biz_app === true
    );
    const phone =
      phones.find(
        (item: { id?: string }) =>
          item?.id === integracao.phone_number_id
      ) ||
      (modoIntegracao === "coexistence" &&
      phonesCoexistence.length === 1
        ? phonesCoexistence[0]
        : null) ||
      (phones.length === 1 ? phones[0] : null);

    if (!phone?.id) {
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          onboarding_erro: "Nenhum número encontrado na WABA.",
          meta_business_id: clientBusinessId,
          business_account_id: clientBusinessId,
          waba_id: waba.id,
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_wabas_response: wabasResult.data,
            meta_phone_numbers_response: phonesResult.data,
            meta_dados_checked_at: agora,
          },
          updated_at: agora,
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error:
            phones.length > 1
              ? "A WABA possui mais de um número e não foi possível identificar o número escolhido."
              : "Número não encontrado na WABA.",
          meta_response: {
            me: meResult.data,
            waba,
            phone_numbers: phonesResult.data,
          },
        },
        { status: 400 }
      );
    }

    /**
     * 4. Salva tudo no banco.
     */
    const { data: integracaoAtualizada, error: updateError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          business_account_id: clientBusinessId,
          meta_business_id: clientBusinessId,
          waba_id: waba.id,
          phone_number_id: phone.id,
          numero: phone.display_phone_number || integracao.numero,
          phone_number_display_name:
            phone.display_phone_number || integracao.phone_number_display_name,
          verified_name: phone.verified_name || null,
          quality_rating: phone.quality_rating || null,
          code_verification_status: phone.code_verification_status || null,
          phone_number_status: phone.status || phone.name_status || null,
          meta_messaging_limit_tier: phone.messaging_limit_tier || null,
          meta_account_mode: phone.account_mode || null,
          ...(modoIntegracao === "coexistence"
            ? {
                is_on_biz_app: phone.is_on_biz_app === true,
                platform_type: phone.platform_type || null,
                coex_status:
                  phone.is_on_biz_app === true &&
                  String(phone.platform_type || "").toUpperCase() ===
                    "CLOUD_API"
                    ? "onboarded"
                    : "erro",
              }
            : {}),
          meta_saude_ultima_verificacao_em: agora,
          meta_saude_raw_json: phone,
          onboarding_etapa: "waba_criada",
          onboarding_status: "em_andamento",
          onboarding_erro: null,
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_wabas_response: wabasResult.data,
            meta_phone_numbers_response: phonesResult.data,
            meta_dados_checked_at: agora,
            whatsapp_meta_health: {
              phone_number_status: phone.status || phone.name_status || null,
              quality_rating: phone.quality_rating || null,
              messaging_limit_tier: phone.messaging_limit_tier || null,
              messaging_limit: null,
              account_mode: phone.account_mode || null,
              checked_at: agora,
              raw: phone,
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
      integracao:
        sanitizeWhatsAppIntegrationForClient(integracaoAtualizada),
      meta: {
        client_business_id: clientBusinessId,
        waba,
        phone,
      },
    });
  } catch (error) {
    console.error("[META DADOS] Erro interno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao sincronizar dados da Meta." },
      { status: 500 }
    );
  }
}
