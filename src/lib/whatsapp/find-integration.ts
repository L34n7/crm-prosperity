import { supabaseAdmin } from "@/lib/supabase/admin";


const CACHE_TTL_MS = 15_000;
const CACHE_NEGATIVO_TTL_MS = 3_000;

type CacheEntry = {
  value: WhatsAppIntegration | null;
  expiresAt: number;
};

type GlobalIntegrationCache = typeof globalThis & {
  __crmWhatsappIntegrationCache?: Map<string, CacheEntry>;
};

const globalIntegrationCache = globalThis as GlobalIntegrationCache;
const integrationCache =
  globalIntegrationCache.__crmWhatsappIntegrationCache ||
  new Map<string, CacheEntry>();

globalIntegrationCache.__crmWhatsappIntegrationCache = integrationCache;

function getCachedIntegration(key: string) {
  const cached = integrationCache.get(key);
  if (!cached) return undefined;

  if (cached.expiresAt <= Date.now()) {
    integrationCache.delete(key);
    return undefined;
  }

  return cached.value;
}

function setCachedIntegration(
  keys: string[],
  value: WhatsAppIntegration | null
) {
  const ttl = value ? CACHE_TTL_MS : CACHE_NEGATIVO_TTL_MS;
  const entry: CacheEntry = {
    value,
    expiresAt: Date.now() + ttl,
  };

  for (const key of keys.filter(Boolean)) {
    integrationCache.set(key, entry);
  }
}

function cacheKeysForIntegration(integration: WhatsAppIntegration) {
  return [
    integration.phone_number_id
      ? `phone:${integration.phone_number_id}`
      : "",
    integration.waba_id ? `waba:${integration.waba_id}` : "",
    `id:${integration.id}`,
  ].filter(Boolean);
}

export function invalidarCacheIntegracaoWhatsapp(integrationId?: string | null) {
  const id = String(integrationId || "").trim();

  if (!id) {
    integrationCache.clear();
    return;
  }

  for (const [key, entry] of integrationCache.entries()) {
    if (entry.value?.id === id || key === `id:${id}`) {
      integrationCache.delete(key);
    }
  }
}

export type WhatsAppIntegration = {
  id: string;
  empresa_id: string;
  nome_conexao: string | null;
  numero: string | null;
  provider: string | null;
  status: string;
  business_account_id: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  webhook_verificado: boolean | null;
  config_json: Record<string, unknown> | null;
  token_ref: string | null;
  modo_integracao?: string | null;
  coex_status?: string | null;
  is_on_biz_app?: boolean | null;
  platform_type?: string | null;
  ultimo_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function findWhatsAppIntegrationByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppIntegration | null> {
  if (!phoneNumberId) return null;

  const cacheKey = `phone:${phoneNumberId}`;
  const cached = getCachedIntegration(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[WHATSAPP] Erro ao buscar integração por phone_number_id:",
      error
    );
    return null;
  }

  const integration = (data as WhatsAppIntegration | null) ?? null;
  setCachedIntegration(
    integration ? cacheKeysForIntegration(integration) : [cacheKey],
    integration
  );

  return integration;
}

export async function findWhatsAppIntegrationByWabaId(
  wabaId: string
): Promise<WhatsAppIntegration | null> {
  if (!wabaId) return null;

  const cacheKey = `waba:${wabaId}`;
  const cached = getCachedIntegration(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("*")
    .eq("waba_id", wabaId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[WHATSAPP] Erro ao buscar integração por waba_id:",
      error
    );
    return null;
  }

  const integration = (data as WhatsAppIntegration | null) ?? null;
  setCachedIntegration(
    integration ? cacheKeysForIntegration(integration) : [cacheKey],
    integration
  );

  return integration;
}
