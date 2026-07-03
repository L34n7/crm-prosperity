import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { encryptText } from "@/lib/security/crypto";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

const supabaseAdmin = getSupabaseAdmin();

async function registerNumber(request: NextRequest) {
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
    const body = await request.json().catch(() => ({}));
    const integracaoId = String(body?.integracao_id || "").trim();
    const pin =
      typeof body?.pin === "string" && body.pin.trim()
        ? body.pin.trim()
        : null;

    if (!pin || !/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Informe o PIN de 6 dígitos para registrar o número na Meta.",
          requires_pin: true,
        },
        { status: 400 }
      );
    }

    let integracaoQuery = supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("provider", "meta_official");

    if (integracaoId) {
      integracaoQuery = integracaoQuery.eq("id", integracaoId);
    }

    const { data: integracao, error: integracaoError } = await integracaoQuery
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

    if (
      normalizeWhatsAppIntegrationMode(integracao.modo_integracao) ===
      "coexistence"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Números em Coexistência já são registrados pelo WhatsApp Business App e não devem usar a etapa de PIN.",
        },
        { status: 409 }
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
            "Token de acesso não encontrado. Conecte novamente com a Meta para salvar o token em config_json.access_token.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      getWhatsAppGraphUrl(`${integracao.phone_number_id}/register`),
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
          phone_registered: false,
          onboarding_status: "erro",
          onboarding_etapa: "registrar_numero",
          onboarding_erro:
            data?.error?.message || "Erro ao registrar número na Meta",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integracao.id);

      const mensagemMeta = data?.error?.message || "";
      const detalhesMeta = data?.error?.error_data?.details || "";
      const codigoMeta = Number(data?.error?.code);

      const mensagemCompleta = `${mensagemMeta} ${detalhesMeta}`.toLowerCase();

      const pinIncorreto =
        codigoMeta === 133005 ||
        mensagemCompleta.includes("pin mismatch") ||
        mensagemCompleta.includes("pin incorreto") ||
        mensagemCompleta.includes("incompatibilidade de pin");

      const muitasTentativas =
        codigoMeta === 133016 ||
        mensagemCompleta.includes("too many attempts") ||
        mensagemCompleta.includes("muitas tentativas") ||
        mensagemCompleta.includes("limite de volume");

      const precisaPin =
        mensagemCompleta.includes("pin") ||
        mensagemCompleta.includes("two-step") ||
        mensagemCompleta.includes("two step") ||
        mensagemCompleta.includes("two factor") ||
        mensagemCompleta.includes("two-factor");

      return NextResponse.json(
        {
          ok: false,
          error: pinIncorreto
            ? "PIN incorreto. Verifique o PIN de verificação em duas etapas do número e tente novamente."
            : muitasTentativas
            ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente com este número."
            : precisaPin
            ? "Este número exige um PIN de verificação em duas etapas."
            : "Erro ao registrar número na Meta.",
          requires_pin: precisaPin || pinIncorreto || muitasTentativas,
          pin_incorreto: pinIncorreto,
          muitas_tentativas: muitasTentativas,
          meta_response: data,
        },
        { status: response.status }
      );
    }

    const agora = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      phone_registered: true,
      onboarding_status: "em_andamento",
      onboarding_etapa: "numero_registrado",
      onboarding_erro: null,

      pin_encrypted: encryptText(pin),

      ultimo_sync_at: agora,
      updated_at: agora,
    };

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
