import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAmbienteConfigurado } from "@/lib/whatsapp/ambiente-configurado";

export const dynamic = "force-dynamic";

const NO_CACHE = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

export async function GET() {
  // Confirma a sessão pelo mesmo contexto autoritativo usado no layout privado.
  // O navegador só deve sair do login depois de receber um destino válido aqui.
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status, headers: NO_CACHE }
    );
  }

  const { usuario } = contexto;

  if (usuario.white_label_admin) {
    return NextResponse.json(
      { ok: true, destino: "/white-label/clientes", ambiente_configurado: null },
      { headers: NO_CACHE }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: true, destino: "/conta-incompleta", ambiente_configurado: null },
      { headers: NO_CACHE }
    );
  }

  const { data: integracoes, error } = await getSupabaseAdmin()
    .from("integracoes_whatsapp")
    .select(
      "status, webhook_verificado, onboarding_etapa, onboarding_status, setup_completed_at, phone_registered, phone_number_status, app_assigned, waba_id, phone_number_id, modo_integracao, coex_status, is_on_biz_app, platform_type"
    )
    .eq("empresa_id", usuario.empresa_id)
    .eq("provider", "meta_official")
    .order("created_at", { ascending: false });

  // Mantém o comportamento anterior em falhas temporárias de leitura da integração.
  if (error) {
    console.warn("[LOGIN] Não foi possível consultar integrações:", error.message);

    return NextResponse.json(
      { ok: true, destino: "/painel", ambiente_configurado: null },
      { headers: NO_CACHE }
    );
  }

  const configurado = (integracoes || []).some((integracao) =>
    isAmbienteConfigurado(integracao)
  );

  return NextResponse.json(
    {
      ok: true,
      destino: configurado ? "/painel" : "/configurar-ambiente",
      ambiente_configurado: configurado,
    },
    { headers: NO_CACHE }
  );
}
