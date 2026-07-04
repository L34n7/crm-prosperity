import { NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isAmbienteConfigurado,
  type IntegracaoWhatsappAmbiente,
} from "@/lib/whatsapp/ambiente-configurado";

type IntegracaoWhatsappStatus = IntegracaoWhatsappAmbiente & {
  id: string;
  empresa_id: string;
  updated_at?: string | null;
};

const STATUS_HEADERS = {
  "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
};

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioBasico();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuario sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { data: integracao, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      `
        id,
        empresa_id,
        status,
        webhook_verificado,
        onboarding_etapa,
        onboarding_status,
        setup_completed_at,
        phone_registered,
        app_assigned,
        waba_id,
        phone_number_id,
        modo_integracao,
        coex_status,
        is_on_biz_app,
        platform_type,
        coex_sync_started_at,
        coex_sync_completed_at,
        phone_number_status,
        quality_rating,
        meta_messaging_limit,
        meta_messaging_limit_tier,
        meta_account_mode,
        meta_saude_ultima_verificacao_em,
        updated_at
      `
    )
    .eq("empresa_id", usuario.empresa_id)
    .eq("provider", "meta_official")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<IntegracaoWhatsappStatus>();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const configurado = isAmbienteConfigurado(integracao);
  let coexSync = null;

  if (integracao?.modo_integracao === "coexistence") {
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("whatsapp_coex_sync_jobs")
      .select(
        "tipo, status, progresso, processamento_progresso, itens_recebidos, itens_processados, itens_com_erro, erro_codigo, erro_mensagem, solicitado_em, concluido_em, updated_at"
      )
      .eq("integracao_whatsapp_id", integracao.id)
      .order("tipo", { ascending: true });

    if (!jobsError) {
      coexSync = jobs || [];
    }
  }

  return NextResponse.json(
    {
      ok: true,
      configurado,
      integracao: integracao || null,
      coex_sync: coexSync,
    },
    { headers: STATUS_HEADERS }
  );
}
