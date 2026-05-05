import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function fetchGraph(path: string, accessToken: string) {
  const url = new URL(`https://graph.facebook.com/v25.0/${path}`);

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

function extrairAccessToken(integracao: any) {
  const token = integracao?.config_json?.access_token;

  if (typeof token === "string" && token.trim()) {
    return token.trim();
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
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

    const accessToken = extrairAccessToken(integracao);

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

    const waba = Array.isArray(wabasResult.data?.data)
      ? wabasResult.data.data[0]
      : null;

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
          error: "WABA não encontrado",
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
      `${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status`,
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

    const phone = Array.isArray(phonesResult.data?.data)
      ? phonesResult.data.data[0]
      : null;

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
          error: "Número não encontrado na WABA.",
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
          phone_number_status: phone.name_status || null,
          onboarding_etapa: "waba_criada",
          onboarding_status: "em_andamento",
          onboarding_erro: null,
          config_json: {
            ...(integracao.config_json || {}),
            meta_me_response: meResult.data,
            meta_wabas_response: wabasResult.data,
            meta_phone_numbers_response: phonesResult.data,
            meta_dados_checked_at: agora,
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