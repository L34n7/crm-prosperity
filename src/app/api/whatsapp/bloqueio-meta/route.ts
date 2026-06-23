import { NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  aplicarBloqueioOperacionalWhatsappMeta,
  statusWhatsappMetaBloqueado,
  WHATSAPP_META_BLOCK_CUSTOMER_ACTION,
  WHATSAPP_META_BLOCK_DESCRIPTION,
  WHATSAPP_META_BLOCK_HELP_URL,
  WHATSAPP_META_BLOCK_TITLE,
  WHATSAPP_META_MANAGER_URL,
} from "@/lib/whatsapp/meta-block";

const supabaseAdmin = getSupabaseAdmin();

type IntegracaoWhatsappBloqueio = {
  id: string;
  empresa_id: string;
  nome_conexao: string | null;
  numero: string | null;
  status: string | null;
  phone_number_status: string | null;
  onboarding_erro: string | null;
  config_json: Record<string, any> | null;
  updated_at: string | null;
};

function objetoConfig(configJson: unknown) {
  return configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? (configJson as Record<string, any>)
    : {};
}

function integracaoEstaBloqueada(integracao: IntegracaoWhatsappBloqueio) {
  const config = objetoConfig(integracao.config_json);
  const diagnostico = config.whatsapp_meta_diagnostic;
  const motivoDiagnostico =
    diagnostico && typeof diagnostico === "object"
      ? String(diagnostico.motivo || "")
      : "";

  return (
    statusWhatsappMetaBloqueado(integracao.status) ||
    statusWhatsappMetaBloqueado(integracao.phone_number_status) ||
    motivoDiagnostico === "business_account_locked"
  );
}

async function garantirBloqueioOperacional(
  integracao: IntegracaoWhatsappBloqueio
) {
  const config = objetoConfig(integracao.config_json);

  await aplicarBloqueioOperacionalWhatsappMeta({
    empresaId: integracao.empresa_id,
    integracaoId: integracao.id,
    motivo: integracao.onboarding_erro || WHATSAPP_META_BLOCK_DESCRIPTION,
  });

  if (config.whatsapp_meta_operational_block_applied_at) {
    return;
  }

  await supabaseAdmin
    .from("integracoes_whatsapp")
    .update({
      config_json: {
        ...config,
        whatsapp_meta_operational_block_applied_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", integracao.id)
    .eq("empresa_id", integracao.empresa_id);
}

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

  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      `
        id,
        empresa_id,
        nome_conexao,
        numero,
        status,
        phone_number_status,
        onboarding_erro,
        config_json,
        updated_at
      `
    )
    .eq("empresa_id", usuario.empresa_id)
    .eq("provider", "meta_official")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const integracaoBloqueada = ((data || []) as IntegracaoWhatsappBloqueio[]).find(
    integracaoEstaBloqueada
  );

  if (!integracaoBloqueada) {
    return NextResponse.json(
      {
        ok: true,
        bloqueado: false,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  await garantirBloqueioOperacional(integracaoBloqueada);

  return NextResponse.json(
    {
      ok: true,
      bloqueado: true,
      modal_intervalo_ms: 10 * 60 * 1000,
      titulo: WHATSAPP_META_BLOCK_TITLE,
      descricao: WHATSAPP_META_BLOCK_DESCRIPTION,
      acao: WHATSAPP_META_BLOCK_CUSTOMER_ACTION,
      meta_manager_url: WHATSAPP_META_MANAGER_URL,
      help_whatsapp_url: WHATSAPP_META_BLOCK_HELP_URL,
      integracao: {
        id: integracaoBloqueada.id,
        nome_conexao: integracaoBloqueada.nome_conexao,
        numero: integracaoBloqueada.numero,
        status: integracaoBloqueada.status,
        phone_number_status: integracaoBloqueada.phone_number_status,
        onboarding_erro: integracaoBloqueada.onboarding_erro,
        updated_at: integracaoBloqueada.updated_at,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
