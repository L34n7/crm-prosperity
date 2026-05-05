import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { integracao_id } = await request.json();

    if (!integracao_id) {
      return NextResponse.json(
        { ok: false, error: "integracao_id não informado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: integracao } = await supabase
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracao_id)
      .single();

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração não encontrada." },
        { status: 404 }
      );
    }

    const accessToken = (integracao.config_json as any)?.access_token;

    if (!accessToken || !integracao.waba_id) {
      return NextResponse.json(
        { ok: false, error: "Dados incompletos para configurar webhook." },
        { status: 400 }
      );
    }

    // 🔥 INSCRIBE APP NO WABA
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${integracao.waba_id}/subscribed_apps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[WEBHOOK SUBSCRIBE ERROR]", data);

      return NextResponse.json(
        { ok: false, error: "Erro ao inscrever webhook.", meta: data },
        { status: 500 }
      );
    }

    // ✅ atualizar banco
    await supabase
      .from("integracoes_whatsapp")
      .update({
        webhook_verificado: true,
        app_assigned: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integracao.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "Erro interno." },
      { status: 500 }
    );
  }
}