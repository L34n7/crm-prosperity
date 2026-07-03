import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { sanitizeWhatsAppIntegrationForClient } from "@/lib/whatsapp/access-token";
import {
  isCoexistencePhoneReady,
  normalizeWhatsAppIntegrationMode,
} from "@/lib/whatsapp/integration-mode";

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
        { ok: false, error: "Empresa não encontrada para o usuário." },
        { status: 403 }
      );
    }

    const { integracao_id } = await request.json().catch(() => ({}));

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

    const modoIntegracao = normalizeWhatsAppIntegrationMode(
      integracao.modo_integracao
    );
    const numeroPronto =
      modoIntegracao === "coexistence"
        ? isCoexistencePhoneReady(integracao)
        : integracao.phone_registered === true;

    if (!numeroPronto) {
      return NextResponse.json(
        {
          ok: false,
          error:
            modoIntegracao === "coexistence"
              ? "O número ainda não foi validado para uso simultâneo no WhatsApp Business App e no CRM."
              : "O número ainda não foi registrado.",
        },
        { status: 400 }
      );
    }

    if (!integracao.webhook_verificado || !integracao.app_assigned) {
      return NextResponse.json(
        { ok: false, error: "O webhook ainda não foi configurado." },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();

    const { data: integracaoAtualizada, error: updateError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .update({
          status: "ativa",
          onboarding_etapa: "concluido",
          onboarding_status: "concluido",
          onboarding_erro: null,
          setup_completed_at: agora,
          ...(modoIntegracao === "coexistence"
            ? { coex_status: "ativo" }
            : {}),
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
    });
  } catch (error) {
    console.error("[CONCLUIR INTEGRACAO WHATSAPP] Erro interno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao concluir configuração." },
      { status: 500 }
    );
  }
}
