import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { criarCheckoutAssinaturaProsperityPay } from "@/lib/prosperity-pay/subscriptions";
import {
  listarIntegracoesWhatsappDaEmpresa,
  obterResumoLimitesWhatsapp,
} from "@/lib/whatsapp/integracoes-multiplas";

export async function POST() {
  try {
    const contexto = await getUsuarioContexto();
    if (!contexto.ok) {
      return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
    }

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
    }

    const [limites, integracoes] = await Promise.all([
      obterResumoLimitesWhatsapp(empresaId),
      listarIntegracoesWhatsappDaEmpresa(empresaId),
    ]);

    if (
      integracoes.length >= limites.limiteTotalPermitido ||
      !limites.podeContratarNumeroAdicional
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O limite de números adicionais do WhatsApp para esta empresa foi atingido.",
          limite_numeros_adicionais_whatsapp:
            limites.limiteNumerosAdicionais,
          numeros_adicionais_contratados:
            limites.numerosAdicionaisContratados,
          limite_total_numeros_whatsapp:
            limites.limiteTotalPermitido,
          total_numeros_cadastrados: integracoes.length,
        },
        { status: 403 },
      );
    }

    const intent = await criarCheckoutAssinaturaProsperityPay(empresaId, {
      type: "add_addon",
      addonCode: "whatsapp_number",
      quantity: 1,
    });

    if (intent.status === "scheduled") {
      return NextResponse.json({
        ok: true,
        scheduled: true,
        effective_at: intent.effectiveAt ?? null,
        target_amount_cents: intent.targetAmountCents ?? null,
      });
    }

    if (!intent.checkoutUrl) {
      throw new Error("A Prosperity Pay não retornou o checkout do adicional.");
    }

    return NextResponse.json({
      ok: true,
      checkout_url: intent.checkoutUrl,
      valor_cobrado_agora_centavos: intent.amountCents,
      valor_proximo_ciclo_centavos: intent.targetAmountCents ?? null,
      expires_at: intent.expiresAt ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao preparar adicional." },
      { status: 500 },
    );
  }
}
