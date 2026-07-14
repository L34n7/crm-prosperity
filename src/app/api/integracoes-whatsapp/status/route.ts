import { NextRequest, NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isAmbienteConfigurado,
  type IntegracaoWhatsappAmbiente,
} from "@/lib/whatsapp/ambiente-configurado";

type IntegracaoWhatsappStatus = IntegracaoWhatsappAmbiente & {
  id: string;
  empresa_id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

const STATUS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

const supabaseAdmin = getSupabaseAdmin();

const CAMPOS_STATUS = `
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
  created_at,
  updated_at
`;

export async function GET(request: NextRequest) {
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

  const integracaoId = String(
    request.nextUrl.searchParams.get("integracao_id") || ""
  ).trim();

  let integracao: IntegracaoWhatsappStatus | null = null;
  let possuiIntegracaoConfigurada = false;

  if (integracaoId) {
    const { data, error } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select(CAMPOS_STATUS)
      .eq("empresa_id", usuario.empresa_id)
      .eq("provider", "meta_official")
      .eq("id", integracaoId)
      .maybeSingle<IntegracaoWhatsappStatus>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    integracao = data || null;
    possuiIntegracaoConfigurada = isAmbienteConfigurado(integracao);
  } else {
    const { data, error } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select(CAMPOS_STATUS)
      .eq("empresa_id", usuario.empresa_id)
      .eq("provider", "meta_official")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const integracoes = (data || []) as IntegracaoWhatsappStatus[];
    const integracaoConfigurada =
      integracoes.find((item) => isAmbienteConfigurado(item)) || null;

    possuiIntegracaoConfigurada = Boolean(integracaoConfigurada);
    integracao = integracaoConfigurada || integracoes[0] || null;
  }

  const configurado = integracaoId
    ? isAmbienteConfigurado(integracao)
    : possuiIntegracaoConfigurada;
  let coexSync = null;

  if (integracao?.modo_integracao === "coexistence") {
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("whatsapp_coex_sync_jobs")
      .select(
        "tipo, status, request_id, progresso, processamento_progresso, itens_recebidos, itens_processados, itens_ignorados, itens_com_erro, erro_codigo, erro_mensagem, metadata_json, solicitado_em, concluido_em, updated_at"
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
      possui_integracao_configurada: possuiIntegracaoConfigurada,
      integracao: integracao || null,
      coex_sync: coexSync,
    },
    { headers: STATUS_HEADERS }
  );
}
