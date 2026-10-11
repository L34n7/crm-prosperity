import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarReconciliacoesCheckoutPendentes } from "@/lib/automacoes/process-automation-engine-checkout-reconciliation";
import { sincronizarAssinaturasLegadasAtomoProsperityPay } from "@/lib/prosperity-pay/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = validarChamadaCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const informado = Number(url.searchParams.get("limit") || 50);
  const limite = Number.isFinite(informado)
    ? Math.min(100, Math.max(1, Math.floor(informado)))
    : 50;

  try {
    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase("checkout-pagamentos");
    }

    // Webhooks tratam pagamentos em tempo real. Recuperação e expiração são
    // tarefas QStash agendadas. Este cron também espelha gradualmente as
    // assinaturas legadas da Atomo para a cobrança recorrente da Prosperity Pay,
    // sem criar um novo cron nem aumentar a frequência de execução.
    const [reconciliacoes, legacyBillingSync] = await Promise.all([
      processarReconciliacoesCheckoutPendentes(limite),
      sincronizarAssinaturasLegadasAtomoProsperityPay(12),
    ]);

    return NextResponse.json({
      ok: true,
      reconciliacoes,
      legacy_billing_sync: legacyBillingSync,
    });
  } catch (error) {
    console.error("[CRON CHECKOUT] Erro:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
