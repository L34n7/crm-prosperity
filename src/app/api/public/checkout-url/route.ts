import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function obterCheckoutUrlPorOferta(tipoOferta: string | null) {
  const checkoutPadrao = process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ?? "";
  const checkoutVip = process.env.ATOMOPAY_CHECKOUT_URL_VIP ?? "";
  const checkoutjv = process.env.ATOMOPAY_CHECKOUT_URL_jv ?? "";

  if (tipoOferta === "vip") {
    return checkoutVip || checkoutPadrao;
  }

  if (tipoOferta === "jv") {
    return checkoutjv || checkoutPadrao;
  }

  return checkoutPadrao;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const leadId = String(body?.lead_id ?? "").trim();

    if (!leadId) {
      throw new Error("Lead não informado.");
    }

    const { data: lead, error } = await supabase
      .from("leads_cadastro")
      .select("id, tipo_oferta")
      .eq("id", leadId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar lead:", error);
      throw new Error("Erro ao buscar lead.");
    }

    if (!lead) {
      throw new Error("Lead não encontrado.");
    }

    const checkoutUrl = obterCheckoutUrlPorOferta(lead.tipo_oferta);

    if (!checkoutUrl) {
      throw new Error("Checkout não configurado.");
    }

    return NextResponse.json({
      ok: true,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    console.error("Erro ao obter checkout:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro interno ao obter checkout.",
      },
      { status: 400 }
    );
  }
}