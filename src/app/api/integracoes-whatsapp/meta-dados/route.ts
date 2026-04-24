import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { integracao_id } = await request.json();

    if (!integracao_id) {
      return NextResponse.json(
        { ok: false, error: "integracao_id não informado" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao, error } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracao_id)
      .single();

    if (error || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração não encontrada" },
        { status: 404 }
      );
    }

    const accessToken = integracao?.config_json?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Token não encontrado" },
        { status: 400 }
      );
    }

    // 🔹 Buscar WABA
    const wabaRes = await fetch(
      "https://graph.facebook.com/v25.0/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name}",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const wabaData = await wabaRes.json();

    const waba =
      wabaData?.data?.[0]?.owned_whatsapp_business_accounts?.data?.[0];

    if (!waba) {
      return NextResponse.json(
        { ok: false, error: "WABA não encontrado", meta: wabaData },
        { status: 400 }
      );
    }

    // 🔹 Buscar Phone Numbers
    const phoneRes = await fetch(
      `https://graph.facebook.com/v25.0/${waba.id}/phone_numbers`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const phoneData = await phoneRes.json();

    const phone = phoneData?.data?.[0];

    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Número não encontrado", meta: phoneData },
        { status: 400 }
      );
    }

    // 🔹 Salvar no banco
    const { error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update({
        waba_id: waba.id,
        phone_number_id: phone.id,
        numero: phone.display_phone_number,
        onboarding_etapa: "numero_registrado",
        onboarding_status: "concluido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integracao_id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      waba,
      phone,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}