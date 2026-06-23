type CacheEntry<T> =
  | {
      expiresAt: number;
      value: T;
    }
  | {
      expiresAt: number;
      promise: Promise<T>;
    };

type GlobalCache = typeof globalThis & {
  __crmTtlCache?: Map<string, CacheEntry<unknown>>;
};

const MAX_CACHE_ENTRIES = 1_000;

const globalCache = globalThis as GlobalCache;
const cacheStore =
  globalCache.__crmTtlCache ?? (globalCache.__crmTtlCache = new Map());

function normalizarParteChave(parte: string | number | boolean | null | undefined) {
  return encodeURIComponent(String(parte ?? ""));
}

function limparCacheExpirado(agora = Date.now()) {
  for (const [key, entry] of cacheStore.entries()) {
    if (entry.expiresAt <= agora) {
      cacheStore.delete(key);
    }
  }

  if (cacheStore.size <= MAX_CACHE_ENTRIES) return;

  const quantidadeParaRemover = cacheStore.size - MAX_CACHE_ENTRIES;
  let removidos = 0;

  for (const key of cacheStore.keys()) {
    cacheStore.delete(key);
    removidos += 1;

    if (removidos >= quantidadeParaRemover) return;
  }
}

export function getTtlCacheKey(
  namespace: string,
  partes: Array<string | number | boolean | null | undefined> = []
) {
  return ["crm", namespace, ...partes].map(normalizarParteChave).join(":");
}

export async function getOrSetTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
) {
  const agora = Date.now();
  const cached = cacheStore.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > agora) {
    if ("value" in cached) {
      return cached.value;
    }

    return cached.promise;
  }

  const promise = loader();
  cacheStore.set(key, {
    expiresAt: agora + ttlMs,
    promise,
  });

  try {
    const value = await promise;

    cacheStore.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    });

    limparCacheExpirado();

    return value;
  } catch (error) {
    const atual = cacheStore.get(key);

    if (atual && "promise" in atual && atual.promise === promise) {
      cacheStore.delete(key);
    }

    throw error;
  }
}

export function invalidateTtlCache(key: string) {
  cacheStore.delete(key);
}

export function invalidateTtlCachePrefix(prefix: string) {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}
