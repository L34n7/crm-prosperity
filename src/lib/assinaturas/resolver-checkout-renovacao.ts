import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanoSlugRenovacao = "basico" | "essencial";
export type TipoOfertaRenovacao = "normal" | "vip" | "jv" | "af" | "free";

export type CheckoutRenovacaoResolvido = {
  checkoutUrl: string | null;
  atomoCheckoutUrl: string | null;
  gateway: "prosperity_pay" | "atomo" | "manual";
  planoSlug: PlanoSlugRenovacao;
  tipoOferta: TipoOfertaRenovacao;
  ofertaReferencia: string | null;
  affiliateRef: string | null;
  valorOriginalCentavos: number | null;
  valorRenovacaoCentavos: number | null;
  origemResolucao: string;
  motivoBloqueio: string | null;
};

const supabase = getSupabaseAdmin();

const EMERSON_AFFILIATE_REF = "EMERSONLUI8FA7B4AF2A44F7C3";

const COPRODUCAO_ATOMO: Record<
  string,
  { atomoUrl: string; prosperityPayRef: string; prosperityPayUrl: string }
> = {
  ubtga: {
    atomoUrl: "https://go.atomopay.com.br/ubtga",
    prosperityPayRef: "plano-basic-be3817c7",
    prosperityPayUrl:
      "https://prosperitypay.com.br/checkout/plano-basic-be3817c7",
  },
  uqddy: {
    atomoUrl: "https://go.atomopay.com.br/uqddy",
    prosperityPayRef: "c7074bf9e18e",
    prosperityPayUrl:
      "https://prosperitypay.com.br/checkout/c7074bf9e18e",
  },
};

const REF_POR_VALOR: Record<string, string> = {
  "basico:500": "248a0b141abf",
  "basico:6000": "3c43f1e480b7",
  "basico:10000": "2ce9243c812e",
  "basico:13700": "plano-basic-be3817c7",
  "basico:19700": "73845590f7a9",
  "essencial:26700": "c7074bf9e18e",
};

function obj(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function plano(v: unknown): PlanoSlugRenovacao | null {
  const s = String(v || "").trim().toLowerCase();
  if (s === "basico" || s === "basic") return "basico";
  if (s === "essencial") return "essencial";
  return null;
}

function tipo(v: unknown): TipoOfertaRenovacao {
  const s = String(v || "").trim().toLowerCase();
  return ["normal", "vip", "jv", "af", "free"].includes(s)
    ? (s as TipoOfertaRenovacao)
    : "normal";
}

function affiliate(v: unknown) {
  const s = String(v || "").trim();
  return s && s.length <= 128 && /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
}

function comRef(url: string, ref: string | null) {
  if (!ref) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("ref", ref);
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`;
  }
}

function atomo(planoSlug: PlanoSlugRenovacao, af = false) {
  if (af) {
    if (planoSlug === "essencial") {
      return process.env.ATOMOPAY_CHECKOUT_URL_AF_ESSENCIAL ||
        process.env.ATOMOPAY_CHECKOUT_URL_AF || "";
    }
    return process.env.ATOMOPAY_CHECKOUT_URL_AF_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_AF || "";
  }
  if (planoSlug === "basico") {
    return process.env.ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO || "";
  }
  return process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
    process.env.ATOMOPAY_CHECKOUT_URL_PADRAO || "";
}

function planoRelacao(v: any) {
  const p = Array.isArray(v) ? v[0] : v;
  return plano(p?.slug);
}

function affiliatePayload(v: unknown) {
  const p = obj(v);
  return affiliate(obj(p.affiliate).reference) ||
    affiliate(obj(p.tracking).value) ||
    affiliate(p.affiliate_ref);
}

async function oferta(ref: string, empresaId: string) {
  const { data, error } = await supabase
    .from("ia_token_ofertas")
    .select("referencia,metadata_json,empresa_id,planos(slug)")
    .eq("gateway", "prosperity_pay")
    .eq("tipo", "mensalidade")
    .eq("ativa", true)
    .eq("referencia", ref)
    .or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
    .order("empresa_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Erro ao buscar oferta da Prosperity Pay.");
  return data;
}

async function affiliateLead(leadId: string | null) {
  if (!leadId) return null;
  const { data, error } = await supabase
    .from("leads_cadastro")
    .select("metadata_json")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error("Erro ao buscar origem comercial da renovação.");
  return affiliate(obj(data?.metadata_json).affiliate_ref);
}

export async function resolverCheckoutRenovacao(params: {
  empresaId: string;
  planoSlugFallback?: string | null;
}): Promise<CheckoutRenovacaoResolvido> {
  const { data: empresa, error } = await supabase
    .from("empresas")
    .select("assinatura_metadata_json,planos(slug)")
    .eq("id", params.empresaId)
    .maybeSingle();

  if (error || !empresa) throw new Error("Erro ao buscar empresa para renovação.");

  const planoSlug = planoRelacao((empresa as any).planos) ||
    plano(params.planoSlugFallback) || "basico";
  const metadata = obj((empresa as any).assinatura_metadata_json);
  const fixo = obj(metadata.renovacao_checkout);

  if (fixo.requires_price_match === true) {
    return {
      checkoutUrl: null,
      atomoCheckoutUrl:
        String(fixo.atomo_checkout_url || "").trim() || null,
      gateway: "prosperity_pay",
      planoSlug,
      tipoOferta: tipo(metadata.tipo_oferta),
      ofertaReferencia: String(fixo.offer_reference || "").trim() || null,
      affiliateRef: affiliate(fixo.affiliate_ref),
      valorOriginalCentavos: Number(fixo.original_amount_cents) || null,
      valorRenovacaoCentavos:
        Number(fixo.renewal_amount_cents || fixo.original_amount_cents) || null,
      origemResolucao: "metadata_preco_pendente",
      motivoBloqueio: "preco_original_sem_checkout_correspondente",
    };
  }

  const urlFixa = String(fixo.checkout_url || "").trim();
  if (urlFixa) {
    const ref = affiliate(fixo.affiliate_ref);
    return {
      checkoutUrl: comRef(urlFixa, ref),
      atomoCheckoutUrl:
        String(fixo.atomo_checkout_url || "").trim() || null,
      gateway: "prosperity_pay",
      planoSlug,
      tipoOferta: tipo(metadata.tipo_oferta),
      ofertaReferencia: String(fixo.offer_reference || "").trim() || null,
      affiliateRef: ref,
      valorOriginalCentavos: Number(fixo.original_amount_cents) || null,
      valorRenovacaoCentavos:
        Number(fixo.renewal_amount_cents || fixo.original_amount_cents) || null,
      origemResolucao: "metadata_empresa",
      motivoBloqueio: null,
    };
  }

  const { data: pagamentos, error: pagError } = await supabase
    .from("pagamentos")
    .select("lead_id,gateway,offer_hash,offer_preco,valor,paid_at,created_at,payload")
    .eq("empresa_id", params.empresaId)
    .in("status", ["paid", "approved", "completed"])
    .in("gateway", ["prosperity_pay", "atomo", "manual"])
    .order("paid_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(50);

  if (pagError) throw new Error("Erro ao buscar a primeira compra da empresa.");

  const pag =
    (pagamentos || []).find(
      (item) => Number(item.offer_preco || item.valor || 0) > 0
    ) ||
    (pagamentos || [])[0] ||
    null;

  if (!pag) {
    return {
      checkoutUrl: atomo(planoSlug) || null,
      atomoCheckoutUrl: atomo(planoSlug) || null,
      gateway: "atomo",
      planoSlug,
      tipoOferta: tipo(metadata.tipo_oferta),
      ofertaReferencia: null,
      affiliateRef: null,
      valorOriginalCentavos: null,
      valorRenovacaoCentavos: null,
      origemResolucao: "fallback_sem_pagamento",
      motivoBloqueio: null,
    };
  }

  const valor = Number(pag.offer_preco || pag.valor || 0) || null;
  const hash = String(pag.offer_hash || "").trim();
  const refAfiliado = affiliatePayload(pag.payload) || await affiliateLead(pag.lead_id);

  const coproducaoAtomo =
    pag.gateway === "atomo" ? COPRODUCAO_ATOMO[hash] : null;

  if (coproducaoAtomo) {
    return {
      checkoutUrl: comRef(
        coproducaoAtomo.prosperityPayUrl,
        EMERSON_AFFILIATE_REF
      ),
      atomoCheckoutUrl: coproducaoAtomo.atomoUrl,
      gateway: "prosperity_pay",
      planoSlug,
      tipoOferta: "af",
      ofertaReferencia: coproducaoAtomo.prosperityPayRef,
      affiliateRef: EMERSON_AFFILIATE_REF,
      valorOriginalCentavos: valor,
      valorRenovacaoCentavos: valor,
      origemResolucao: "primeira_compra_atomo_coprodutor_emerson",
      motivoBloqueio: null,
    };
  }

  const referencia = hash && await oferta(hash, params.empresaId)
    ? hash
    : valor ? REF_POR_VALOR[`${planoSlug}:${valor}`] : null;

  if (referencia) {
    const o = await oferta(referencia, params.empresaId);
    if (o) {
      const om = obj((o as any).metadata_json);
      const base = String(om.checkout_url || "").trim() ||
        `https://prosperitypay.com.br/checkout/${encodeURIComponent(referencia)}`;

      return {
        checkoutUrl: comRef(base, refAfiliado),
        atomoCheckoutUrl: null,
        gateway: "prosperity_pay",
        planoSlug: planoRelacao((o as any).planos) || planoSlug,
        tipoOferta: tipo(om.tipo_oferta),
        ofertaReferencia: referencia,
        affiliateRef: refAfiliado,
        valorOriginalCentavos: valor,
        valorRenovacaoCentavos: valor,
        origemResolucao: hash === referencia
          ? "primeira_compra_referencia_exata"
          : "primeira_compra_plano_valor",
        motivoBloqueio: null,
      };
    }
  }

  return {
    checkoutUrl: atomo(planoSlug) || null,
    atomoCheckoutUrl: atomo(planoSlug) || null,
    gateway: pag.gateway === "manual" ? "manual" : "atomo",
    planoSlug,
    tipoOferta: tipo(metadata.tipo_oferta),
    ofertaReferencia: hash || null,
    affiliateRef: refAfiliado,
    valorOriginalCentavos: valor,
    valorRenovacaoCentavos: valor,
    origemResolucao: "fallback_checkout_legado",
    motivoBloqueio: null,
  };
}
