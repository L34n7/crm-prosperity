import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

function extrairAccessToken(integracao: any) {
  const tokenConfig = integracao?.config_json?.access_token;

  if (typeof tokenConfig === "string" && tokenConfig.trim()) {
    return tokenConfig.trim();
  }

  if (process.env.WHATSAPP_ACCESS_TOKEN?.trim()) {
    return process.env.WHATSAPP_ACCESS_TOKEN.trim();
  }

  return null;
}

export async function GET() {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto?.usuario?.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Empresa do usuário não encontrada.",
        },
        { status: 401 }
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

    const accessToken = extrairAccessToken(integracao);

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
      `https://graph.facebook.com/v23.0/${integracao.waba_id}/phone_numbers`,
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

      if (!integracao.phone_number_id && numeroAtual.id) {
        payloadUpdate.phone_number_id = numeroAtual.id;
      }
    }

    await supabaseAdmin
      .from("integracoes_whatsapp")
      .update(payloadUpdate)
      .eq("id", integracao.id);

    return NextResponse.json({
      ok: true,
      integracao: {
        id: integracao.id,
        empresa_id: integracao.empresa_id,
        waba_id: integracao.waba_id,
        phone_number_id: integracao.phone_number_id,
        numero: integracao.numero,
        status: integracao.status,
      },
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