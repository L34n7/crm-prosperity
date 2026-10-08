import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  verificarAssinaturaWebhookIntegracao,
  type IntegracaoWebhookHealth,
} from "@/lib/whatsapp/webhook-subscription-health";

export async function POST(request: NextRequest) {
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

    const supabase = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabase
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

    const resultado = await verificarAssinaturaWebhookIntegracao(
      integracao as IntegracaoWebhookHealth,
      { reparar: true }
    );

    if (!resultado.ok || !resultado.ativa) {
      console.error("[WEBHOOK SUBSCRIBE ERROR]", {
        integracaoId: integracao.id,
        status: resultado.status,
        error: resultado.error,
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            resultado.error ||
            "Não foi possível confirmar a assinatura do webhook na Meta.",
          status_assinatura: resultado.status,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      status_assinatura: resultado.status,
      reparada: resultado.reparada,
    });
  } catch (error) {
    console.error("[WEBHOOK SUBSCRIBE] Erro interno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno." },
      { status: 500 }
    );
  }
}
