import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

type PlanoSlug = "basico" | "essencial";
type CheckoutGateway = "atomo" | "prosperity_pay";

type ProsperityPayOferta = {
  referencia: string;
  metadata_json: Record<string, unknown> | null;
};

const PROSPERITY_PAY_REFERENCIA_POR_PLANO: Record<PlanoSlug, string> = {
  basico: "plano-basic-be3817c7",
  essencial: "c7074bf9e18e",
};

function obterCheckoutUrlAtomo(tipoOferta: string | null, planoSlug: PlanoSlug | null) {
  const checkoutPadrao = process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ?? "";
  const checkoutVip = process.env.ATOMOPAY_CHECKOUT_URL_VIP ?? "";
  const checkoutJv = process.env.ATOMOPAY_CHECKOUT_URL_JV ?? "";
  const checkoutFree = process.env.CRM_CHECKOUT_FREE_URL ?? "";

  if (tipoOferta === "free") {
    return adicionarPlanoAoCheckoutFree(checkoutFree, planoSlug);
  }

  const checkoutPlano = obterCheckoutUrlAtomoPorPlano(planoSlug);

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

function obterCheckoutUrlAfPorPlano(planoSlug: PlanoSlug | null) {
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
  planoSlug: PlanoSlug | null
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

function obterCheckoutUrlAtomoPorPlano(planoSlug: PlanoSlug | null) {
  if (planoSlug === "basico") {
    return process.env.ATOMOPAY_CHECKOUT_URL_BASICO || "";
  }

  if (planoSlug === "essencial") {
    return process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL || "";
  }

  return "";
}

async function obterCheckoutProsperityPay(planoSlug: PlanoSlug) {
  const referencia = PROSPERITY_PAY_REFERENCIA_POR_PLANO[planoSlug];

  const { data: plano, error: planoError } = await supabase
    .from("planos")
    .select("id")
    .eq("slug", planoSlug)
    .eq("status", "ativo")
    .maybeSingle();

  if (planoError) {
    console.error("Erro ao buscar plano do Prosperity Pay:", planoError);
    throw new Error("Erro ao localizar o plano selecionado.");
  }

  if (!plano) {
    throw new Error("Plano não encontrado.");
  }

  const { data, error } = await supabase
    .from("ia_token_ofertas")
    .select("referencia, metadata_json")
    .eq("gateway", "prosperity_pay")
    .eq("tipo", "mensalidade")
    .eq("ativa", true)
    .eq("plano_id", plano.id)
    .eq("referencia", referencia)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar checkout Prosperity Pay:", error);
    throw new Error("Erro ao localizar o checkout da Prosperity Pay.");
  }

  const oferta = data as ProsperityPayOferta | null;

  if (!oferta) {
    throw new Error("Checkout Prosperity Pay não configurado para este plano.");
  }

  const checkoutUrl =
    typeof oferta.metadata_json?.checkout_url === "string"
      ? oferta.metadata_json.checkout_url.trim()
      : "";

  if (checkoutUrl) {
    return {
      checkoutUrl,
      referencia: oferta.referencia,
    };
  }

  const baseUrl = (
    process.env.PROSPERITY_PAY_CHECKOUT_BASE_URL ||
    "https://prosperity-pay.vercel.app/checkout"
  ).replace(/\/$/, "");

  return {
    checkoutUrl: `${baseUrl}/${encodeURIComponent(oferta.referencia)}`,
    referencia: oferta.referencia,
  };
}

function normalizarPlanoSlug(valor: unknown): PlanoSlug | null {
  if (valor !== "basico" && valor !== "essencial") {
    return null;
  }

  return valor;
}

function normalizarGateway(valor: unknown): CheckoutGateway {
  if (valor === "prosperity_pay") {
    return "prosperity_pay";
  }

  return "atomo";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const leadId = String(body?.lead_id ?? "").trim();
    const planoSlug = normalizarPlanoSlug(body?.plano_slug);
    const gateway = normalizarGateway(body?.gateway);

    if (!leadId) {
      throw new Error("Lead não informado.");
    }

    if (!planoSlug) {
      throw new Error("Plano inválido.");
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

    const { error: updateError } = await supabase
      .from("leads_cadastro")
      .update({ plano_slug: planoSlug, updated_at: new Date().toISOString() })
      .eq("id", lead.id);

    if (updateError) {
      console.error("Erro ao atualizar plano do lead:", updateError);
      throw new Error("Erro ao atualizar plano escolhido.");
    }

    if (gateway === "prosperity_pay") {
      if (lead.tipo_oferta !== "normal") {
        throw new Error(
          "Prosperity Pay ainda não está configurado para esta oferta especial."
        );
      }

      const checkout = await obterCheckoutProsperityPay(planoSlug);

      return NextResponse.json({
        ok: true,
        gateway,
        checkout_url: checkout.checkoutUrl,
        checkout_reference: checkout.referencia,
      });
    }

    const checkoutUrl = obterCheckoutUrlAtomo(lead.tipo_oferta, planoSlug);

    if (!checkoutUrl) {
      throw new Error("Checkout não configurado.");
    }

    return NextResponse.json({
      ok: true,
      gateway,
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
