import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { USD_BRL_EXCHANGE_RATE } from "@/lib/whatsapp/pricing";

const supabaseAdmin = getSupabaseAdmin();
const timezoneEmpresaCache = new Map<string, string>();

const RATE_CARD_CACHE_TTL_MS = 5 * 60_000;

type RateCardRow = {
  id: string;
  moeda: string | null;
  valor_unitario: number | string | null;
  faixa_min: number | string | null;
  faixa_max: number | string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
};

type RateCardCacheEntry = {
  value: RateCardRow | null;
  expiresAt: number;
};

type GlobalPricingRealizedCache = typeof globalThis & {
  __crmWhatsappRateCardCache?: Map<string, RateCardCacheEntry>;
};

const globalPricingRealizedCache = globalThis as GlobalPricingRealizedCache;
const rateCardCache =
  globalPricingRealizedCache.__crmWhatsappRateCardCache ||
  new Map<string, RateCardCacheEntry>();

globalPricingRealizedCache.__crmWhatsappRateCardCache = rateCardCache;

function getCachedRateCard(key: string) {
  const cached = rateCardCache.get(key);
  if (!cached) return undefined;

  if (cached.expiresAt <= Date.now()) {
    rateCardCache.delete(key);
    return undefined;
  }

  return cached.value;
}

function setCachedRateCard(key: string, value: RateCardRow | null) {
  rateCardCache.set(key, {
    value,
    expiresAt: Date.now() + RATE_CARD_CACHE_TTL_MS,
  });
}

export type PricingRealizado = {
  moeda: string | null;
  tarifaUnitaria: number | null;
  custoUsd: number | null;
  custoBrl: number | null;
  rateCardId: string | null;
};

type PricingExistente = {
  moeda?: string | null;
  tarifaUnitaria?: number | string | null;
  custoUsd?: number | string | null;
  custoBrl?: number | string | null;
  rateCardId?: string | null;
};

function numeroOuNull(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function dataNoTimezone(iso: string, timeZone: string) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso.slice(0, 10);

  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(data);
    const ano = partes.find((item) => item.type === "year")?.value;
    const mes = partes.find((item) => item.type === "month")?.value;
    const dia = partes.find((item) => item.type === "day")?.value;

    if (ano && mes && dia) return `${ano}-${mes}-${dia}`;
  } catch {
    // Fallback UTC abaixo.
  }

  return data.toISOString().slice(0, 10);
}

async function buscarTimezoneEmpresa(empresaId: string) {
  const cached = timezoneEmpresaCache.get(empresaId);
  if (cached) return cached;

  const { data } = await supabaseAdmin
    .from("empresas")
    .select("timezone")
    .eq("id", empresaId)
    .maybeSingle();

  const timezone = String(data?.timezone || "UTC").trim() || "UTC";
  timezoneEmpresaCache.set(empresaId, timezone);
  return timezone;
}

function paisPorRecipient(recipientId?: string | null) {
  const numero = String(recipientId || "").replace(/\D/g, "");
  if (numero.startsWith("55")) return "BR";
  return null;
}

export async function resolverPricingRealizado(params: {
  empresaId: string;
  recipientId?: string | null;
  categoria: string;
  mensagemCriadaEm: string;
  existente?: PricingExistente | null;
}): Promise<PricingRealizado | null> {
  const moedaExistente = String(params.existente?.moeda || "").toUpperCase();
  const tarifaExistente = numeroOuNull(params.existente?.tarifaUnitaria);
  const custoUsdExistente = numeroOuNull(params.existente?.custoUsd);
  const custoBrlExistente = numeroOuNull(params.existente?.custoBrl);

  const existenteCompleto =
    Boolean(params.existente?.rateCardId) &&
    Boolean(moedaExistente) &&
    tarifaExistente !== null &&
    ((moedaExistente === "USD" &&
      custoUsdExistente !== null &&
      custoBrlExistente !== null) ||
      (moedaExistente === "BRL" && custoBrlExistente !== null));

  if (existenteCompleto) {
    return {
      moeda: moedaExistente,
      tarifaUnitaria: tarifaExistente,
      custoUsd: custoUsdExistente,
      custoBrl: custoBrlExistente,
      rateCardId: String(params.existente?.rateCardId),
    };
  }

  const pais = paisPorRecipient(params.recipientId);
  if (!pais) return null;

  try {
    const timezone = await buscarTimezoneEmpresa(params.empresaId);
    const dataReferencia = dataNoTimezone(params.mensagemCriadaEm, timezone);

    const cacheKey = [pais, params.categoria, dataReferencia].join("|");
    let rateCard = getCachedRateCard(cacheKey);

    if (rateCard === undefined) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_rate_cards")
        .select(
          "id,moeda,valor_unitario,faixa_min,faixa_max,vigencia_inicio,vigencia_fim"
        )
        .eq("pais", pais)
        .eq("categoria", params.categoria)
        .lte("vigencia_inicio", dataReferencia)
        .or(`vigencia_fim.is.null,vigencia_fim.gte.${dataReferencia}`)
        .order("faixa_min", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("[WHATSAPP PRICING] Falha ao consultar rate card:", {
          empresaId: params.empresaId,
          categoria: params.categoria,
          pais,
          erro: error.message,
        });
        return null;
      }

      rateCard = (data as RateCardRow | null) ?? null;
      setCachedRateCard(cacheKey, rateCard);
    }

    if (!rateCard) return null;

    const tarifa = numeroOuNull(rateCard.valor_unitario);
    if (tarifa === null) return null;

    const moeda = String(rateCard.moeda || "").toUpperCase();
    const custoUsd = moeda === "USD" ? tarifa : null;
    const custoBrl =
      moeda === "BRL"
        ? tarifa
        : moeda === "USD"
          ? Number((tarifa * USD_BRL_EXCHANGE_RATE).toFixed(8))
          : null;

    return {
      moeda: moeda || null,
      tarifaUnitaria: tarifa,
      custoUsd,
      custoBrl,
      rateCardId: String(rateCard.id),
    };
  } catch (error) {
    console.warn("[WHATSAPP PRICING] Falha ao apurar custo realizado:", {
      empresaId: params.empresaId,
      categoria: params.categoria,
      erro: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
