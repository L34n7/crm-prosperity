import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function obterCheckoutUrl(tipoOferta: string | null, planoSlug: string | null) {
  const checkoutPadrao = process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ?? "";
  const checkoutVip = process.env.ATOMOPAY_CHECKOUT_URL_VIP ?? "";
  const checkoutJv = process.env.ATOMOPAY_CHECKOUT_URL_JV ?? "";
  const checkoutFree = process.env.CRM_CHECKOUT_FREE_URL ?? "";

  if (tipoOferta === "free") {
    return adicionarPlanoAoCheckoutFree(checkoutFree, planoSlug);
  }

  const checkoutPlano = obterCheckoutUrlPorPlano(planoSlug);

  if (tipoOferta === "af") {
    return (
      obterCheckoutUrlAfPorPlano(planoSlug) || checkoutPlano || checkoutPadrao
    );
  }

  if (planoSlug === "basico" && tipoOferta === "vip") {
    return checkoutVip || checkoutPlano || checkoutPadrao;
  }

  if (planoSlug === "basico" && tipoOferta === "jv") {
    return checkoutJv || checkoutPlano || checkoutPadrao;
  }

  return checkoutPlano || checkoutPadrao;
}

function obterCheckoutUrlAfPorPlano(planoSlug: string | null) {
  const checkoutAfPadrao = process.env.ATOMOPAY_CHECKOUT_URL_AF || "";

  if (planoSlug === "basico") {
    return process.env.ATOMOPAY_CHECKOUT_URL_AF_BASICO || checkoutAfPadrao;
  }

  if (planoSlug === "essencial") {
    return process.env.ATOMOPAY_CHECKOUT_URL_AF_ESSENCIAL || checkoutAfPadrao;
  }

  return checkoutAfPadrao;
}

function adicionarPlanoAoCheckoutFree(
  checkoutFree: string,
  planoSlug: string | null
) {
  if (!checkoutFree || !planoSlug) {
    return checkoutFree;
  }

  try {
    const url = new URL(checkoutFree);
    url.searchParams.set("plano", planoSlug);
    return url.toString();
  } catch {
    const separador = checkoutFree.includes("?") ? "&" : "?";
    return `${checkoutFree}${separador}plano=${encodeURIComponent(planoSlug)}`;
  }
}

function obterCheckoutUrlPorPlano(planoSlug: string | null) {
  if (planoSlug === "basico") {
    return process.env.ATOMOPAY_CHECKOUT_URL_BASICO || "";
  }

  if (planoSlug === "essencial") {
    return process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL || "";
  }

  return "";
}

function normalizarPlanoSlug(valor: unknown) {
  if (valor !== "basico" && valor !== "essencial") {
    return null;
  }

  return valor;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const leadId = String(body?.lead_id ?? "").trim();
    const planoSlug = normalizarPlanoSlug(body?.plano_slug);

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

    if (planoSlug) {
      const { error: updateError } = await supabase
        .from("leads_cadastro")
        .update({ plano_slug: planoSlug, updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (updateError) {
        console.error("Erro ao atualizar plano do lead:", updateError);
        throw new Error("Erro ao atualizar plano escolhido.");
      }
    }

    const checkoutUrl = obterCheckoutUrl(lead.tipo_oferta, planoSlug);

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
