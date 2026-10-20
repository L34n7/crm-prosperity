
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrSetTtlCache, getTtlCacheKey } from "@/lib/cache/ttl-cache";
import {
  BRANDING_PROSPERITY,
  type WhiteLabelBranding,
} from "@/lib/white-label/types";

const supabaseAdmin = getSupabaseAdmin();

type WhiteLabelRow = {
  id: string;
  nome: string;
  slug: string;
  dominio: string;
  nome_produto: string;
  logo_url: string | null;
  favicon_url: string | null;
  cor_primaria: string | null;
  licencas_contratadas: number;
  plano_padrao_id: string | null;
  empresa_gestora_id: string | null;
  status: "ativo" | "inativo";
};

export function normalizarDominioWhiteLabel(valor: string | null | undefined) {
  let dominio = String(valor || "").trim().toLowerCase();

  if (!dominio) return "";

  try {
    if (dominio.includes("://")) {
      dominio = new URL(dominio).host;
    }
  } catch {
    return "";
  }

  dominio = dominio
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./, "")
    .replace(/\.$/, "")
    .trim();

  return dominio;
}

export function rowParaBranding(row: WhiteLabelRow): WhiteLabelBranding {
  return {
    is_white_label: true,
    id: row.id,
    nome_marca: row.nome,
    nome_produto: row.nome_produto || row.nome,
    dominio: row.dominio,
    logo_url: row.logo_url || null,
    favicon_url: row.favicon_url || null,
    cor_primaria: row.cor_primaria || "#0f509a",
  };
}

export async function buscarWhiteLabelAtivoPorDominio(
  host: string | null | undefined
): Promise<WhiteLabelRow | null> {
  const dominio = normalizarDominioWhiteLabel(host);

  if (!dominio || dominio === "crmprosperity.com" || dominio.endsWith(".vercel.app")) {
    return null;
  }

  return await getOrSetTtlCache(
    getTtlCacheKey("white-label-branding", [dominio]),
    30_000,
    async () => {
      const { data, error } = await supabaseAdmin
        .from("white_labels")
        .select(
          "id, nome, slug, dominio, nome_produto, logo_url, favicon_url, cor_primaria, licencas_contratadas, plano_padrao_id, empresa_gestora_id, status"
        )
        .ilike("dominio", dominio)
        .eq("status", "ativo")
        .maybeSingle<WhiteLabelRow>();

      if (error) {
        console.error("[WHITE LABEL] Falha ao identificar domínio:", error);
        return null;
      }

      return data ?? null;
    }
  );
}

export async function obterBrandingPorHost(
  host: string | null | undefined
): Promise<WhiteLabelBranding> {
  const whiteLabel = await buscarWhiteLabelAtivoPorDominio(host);
  return whiteLabel ? rowParaBranding(whiteLabel) : BRANDING_PROSPERITY;
}

export async function obterBrandingDaEmpresa(
  empresaId: string | null | undefined
): Promise<WhiteLabelBranding> {
  if (!empresaId) return BRANDING_PROSPERITY;

  const { data: empresa, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .select("white_label_id")
    .eq("id", empresaId)
    .maybeSingle<{ white_label_id: string | null }>();

  if (empresaError || !empresa?.white_label_id) {
    return BRANDING_PROSPERITY;
  }

  const { data, error } = await supabaseAdmin
    .from("white_labels")
    .select(
      "id, nome, slug, dominio, nome_produto, logo_url, favicon_url, cor_primaria, licencas_contratadas, plano_padrao_id, empresa_gestora_id, status"
    )
    .eq("id", empresa.white_label_id)
    .eq("status", "ativo")
    .maybeSingle<WhiteLabelRow>();

  if (error || !data) return BRANDING_PROSPERITY;
  return rowParaBranding(data);
}

export function obterSiteUrlBranding(branding: WhiteLabelBranding) {
  if (branding.is_white_label && branding.dominio) {
    return "https://" + branding.dominio;
  }

  const configurada =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;

  return (configurada || "https://crmprosperity.com").replace(/\/$/, "");
}
