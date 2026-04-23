import { NextRequest, NextResponse } from "next/server";
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

async function registerNumber(request: NextRequest) {
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
    const body = await request.json().catch(() => ({}));
    const pin =
      typeof body?.pin === "string" && body.pin.trim()
        ? body.pin.trim()
        : null;

    if (!pin) {
      return NextResponse.json(
        {
          ok: false,
          error: "Informe o PIN do número para registrar na Meta.",
        },
        { status: 400 }
      );
    }

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

    if (!integracao.phone_number_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A integração ainda não possui phone_number_id salvo. Consulte os números antes de registrar.",
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

    await supabaseAdmin
      .from("integracoes_whatsapp")
      .update({
        onboarding_status: "em_andamento",
        onboarding_etapa: "registrando_numero",
        onboarding_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integracao.id);

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${integracao.phone_number_id}/register`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[REGISTER NUMBER] Erro da Meta:", data);

      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          status: "erro",
          phone_registered: false,
          onboarding_status: "erro",
          onboarding_etapa: "registrar_numero",
          onboarding_erro:
            data?.error?.message || "Erro ao registrar número na Meta",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integracao.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao registrar número na Meta.",
          meta_response: data,
        },
        { status: response.status }
      );
    }

    const updatePayload: Record<string, any> = {
      phone_registered: true,
      onboarding_status: "concluido",
      onboarding_etapa: "numero_registrado",
      onboarding_erro: null,
      ultimo_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (integracao.status === "pendente" || integracao.status === "erro") {
      updatePayload.status = "ativa";
    }

    await supabaseAdmin
      .from("integracoes_whatsapp")
      .update(updatePayload)
      .eq("id", integracao.id);

    console.log("[REGISTER NUMBER] Sucesso:", data);

    return NextResponse.json({
      ok: true,
      message: "Número registrado com sucesso na Meta.",
      integracao: {
        id: integracao.id,
        empresa_id: integracao.empresa_id,
        phone_number_id: integracao.phone_number_id,
        waba_id: integracao.waba_id,
      },
      meta_response: data,
    });
  } catch (error) {
    console.error("[REGISTER NUMBER] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno ao tentar registrar o número.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return registerNumber(request);
}