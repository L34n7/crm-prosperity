import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";
};

async function getUsuarioLogado() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "Não autenticado", status: 401 as const };
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, empresa_id, status")
    .eq("auth_user_id", user.id)
    .single<UsuarioSistema>();

  if (!usuario) {
    return { error: "Usuário do sistema não encontrado.", status: 404 as const };
  }

  if (usuario.status !== "ativo") {
    return { error: "Usuário inativo.", status: 403 as const };
  }

  return { usuario };
}

type FinishPayload = {
  event?: string;
  waba_id?: string | null;
  phone_number_id?: string | null;
  business_portfolio_id?: string | null;
  meta_business_id?: string | null;
  raw?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await getUsuarioLogado();

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as FinishPayload | null;

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Body inválido." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("provider", "meta_official")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (integracaoError) {
      return NextResponse.json(
        { ok: false, error: integracaoError.message },
        { status: 500 }
      );
    }

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    const agora = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      updated_at: agora,
      ultimo_sync_at: agora,
      onboarding_status: "em_andamento",
      onboarding_erro: null,
    };

    if (body.business_portfolio_id) {
      updatePayload.business_portfolio_id = body.business_portfolio_id;
    }

    if (body.meta_business_id) {
      updatePayload.meta_business_id = body.meta_business_id;
      updatePayload.business_account_id = body.meta_business_id;
    }

    if (body.waba_id) {
      updatePayload.waba_id = body.waba_id;
      updatePayload.onboarding_etapa = "waba_criada";
    } else {
      updatePayload.onboarding_etapa = "meta_conectado";
    }

    if (body.phone_number_id) {
      updatePayload.phone_number_id = body.phone_number_id;
    }

    const configJsonAtual =
      integracao.config_json && typeof integracao.config_json === "object"
        ? integracao.config_json
        : {};

    updatePayload.config_json = {
      ...configJsonAtual,
      embedded_signup_finish_payload: body.raw ?? body,
      embedded_signup_finished_at: agora,
    };

    const { data: integracaoAtualizada, error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update(updatePayload)
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
      integracao: integracaoAtualizada,
    });
  } catch (error) {
    console.error("[EMBEDDED SIGNUP FINISH] Erro interno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao finalizar Embedded Signup." },
      { status: 500 }
    );
  }
}