export const ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO = {
  planoBasico: "https://go.atomopay.com.br/x6zzjtv0wn",
  planoEssencial: "https://go.atomopay.com.br/ku2ab",
  planoBusinessV1: "https://go.atomopay.com.br/0bmce",
  planoBusinessV2: "https://go.atomopay.com.br/qe7ic",
  planoBusinessV3: "https://go.atomopay.com.br/eichl",
  planoCotacao337: "https://go.atomopay.com.br/jjlbg6",
  planoBasicoEspecial100: "https://go.atomopay.com.br/8iwd9",
  planoBasicoMaisUmNumero197: "https://go.atomopay.com.br/rpyrj",
  recarga50MilTokens: "https://go.atomopay.com.br/r2ana",
  recarga200MilTokens: "https://go.atomopay.com.br/czwnh",
} as const;

export const EMERSON_PROSPERITY_AFFILIATE_REF =
  "EMERSONLUI8FA7B4AF2A44F7C3";
export const EMERSON_ATOMOPAY_AFFILIATE_HASH = "zp1klu3iqf";

export function aplicarAfiliadoAtomoAoCheckout(
  checkoutUrl: string,
  affiliateRef?: string | null
) {
  const url = String(checkoutUrl || "").trim();
  if (!url) return url;

  if (
    String(affiliateRef || "").trim() !==
    EMERSON_PROSPERITY_AFFILIATE_REF
  ) {
    return url;
  }

  const [baseUrl, queryString = ""] = url.split("?");
  const params = new URLSearchParams(queryString);
  params.set("affh", EMERSON_ATOMOPAY_AFFILIATE_HASH);

  return `${baseUrl}?${params.toString()}`;
}

export function obterCheckoutAtomoPagamentoUnicoPorRenovacao(params: {
  planoSlug: "basico" | "essencial";
  valorCentavos?: number | null;
}) {
  const valor = Number(params.valorCentavos || 0);

  if (valor === 10000) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBasicoEspecial100;
  }

  if (valor === 13700) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBasico;
  }

  if (valor === 19300 || valor === 19700) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBasicoMaisUmNumero197;
  }

  if (valor === 26700) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoEssencial;
  }

  if (valor === 30000) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBusinessV1;
  }

  if (valor === 33700) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoCotacao337;
  }

  if (valor === 36000) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBusinessV2;
  }

  if (valor === 40000) {
    return ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBusinessV3;
  }

  return params.planoSlug === "essencial"
    ? ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoEssencial
    : ATOMOPAY_CHECKOUTS_PAGAMENTO_UNICO.planoBasico;
}
