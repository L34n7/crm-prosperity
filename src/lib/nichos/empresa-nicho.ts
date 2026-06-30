import {
  getOrSetTtlCache,
  getTtlCacheKey,
  invalidateTtlCache,
} from "@/lib/cache/ttl-cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getNichoConfig,
  type NichoCodigo,
  type NichoConfig,
} from "@/lib/nichos/config";

const EMPRESA_NICHO_CACHE_TTL_MS = 30_000;

type EmpresaNichoRow = {
  id: string;
  nichos:
    | {
        codigo: NichoCodigo;
      }
    | Array<{
        codigo: NichoCodigo;
      }>
    | null;
};

export async function buscarNichoEmpresa(
  empresaId: string
): Promise<NichoConfig> {
  return await getOrSetTtlCache(
    getTtlCacheKey("empresa-nicho", [empresaId]),
    EMPRESA_NICHO_CACHE_TTL_MS,
    async () => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("empresas")
        .select(
          `
            id,
            nichos (
              codigo
            )
          `
        )
        .eq("id", empresaId)
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar nicho da empresa: ${error.message}`);
      }

      const empresa = data as EmpresaNichoRow | null;
      const nicho = Array.isArray(empresa?.nichos)
        ? empresa?.nichos[0]
        : empresa?.nichos;

      return getNichoConfig(nicho?.codigo);
    }
  );
}

export function invalidarCacheNichoEmpresa(empresaId: string) {
  invalidateTtlCache(getTtlCacheKey("empresa-nicho", [empresaId]));
}
