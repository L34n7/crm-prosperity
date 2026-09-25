import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import { verificarFormaPagamentoMeta } from "@/lib/whatsapp/payment-method-status";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const bloqueio = bloquearSemPermissao(
      contexto.usuario,
      "whatsapp.perfil.visualizar",
      "Você não tem permissão para verificar a cobrança do WhatsApp."
    );
    if (bloqueio) return bloqueio;

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { integracao_id?: string }
      | null;
    const integracaoId = String(body?.integracao_id || "").trim();

    if (!integracaoId) {
      return NextResponse.json(
        { ok: false, error: "integracao_id é obrigatório." },
        { status: 400 }
      );
    }

    const podeAcessar = await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario: contexto.usuario,
      empresaId,
      integracaoId,
    });

    if (!podeAcessar) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integração WhatsApp." },
        { status: 403 }
      );
    }

    const { data: integracao, error } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select(
        "id,empresa_id,waba_id,token_ref,config_json,payment_method_added,meta_payment_status,meta_primary_funding_id,meta_payment_checked_at,meta_payment_check_error"
      )
      .eq("id", integracaoId)
      .eq("empresa_id", empresaId)
      .eq("provider", "meta_official")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    const resultado = await verificarFormaPagamentoMeta(integracao);

    return NextResponse.json(
      {
        ok: resultado.ok,
        status: resultado.status,
        payment_method_added: resultado.paymentMethodAdded,
        primary_funding_id: resultado.primaryFundingId,
        checked_at: resultado.checkedAt,
        check_error: resultado.error,
      },
      { status: resultado.ok ? 200 : 422 }
    );
  } catch (error) {
    console.error("[META PAYMENT STATUS] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno ao verificar a forma de pagamento na Meta.",
      },
      { status: 500 }
    );
  }
}
