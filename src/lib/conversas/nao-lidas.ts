import {
  getOrSetTtlCache,
  getTtlCacheKey,
} from "@/lib/cache/ttl-cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const CONVERSAS_NAO_LIDAS_CACHE_TTL_MS = 5_000;

export type ContarConversasNaoLidasParams = {
  empresaId: string;
  usuarioId: string;
  isAdmin: boolean;
  setoresIds: string[];
  usuarioPodeAtribuir: boolean;
};

export async function contarConversasNaoLidas(
  params: ContarConversasNaoLidasParams
) {
  const setoresKey = [...(params.setoresIds ?? [])].sort().join(",");

  return await getOrSetTtlCache(
    getTtlCacheKey("conversas-nao-lidas", [
      params.empresaId,
      params.usuarioId,
      params.isAdmin,
      setoresKey,
      params.usuarioPodeAtribuir,
    ]),
    CONVERSAS_NAO_LIDAS_CACHE_TTL_MS,
    async () => {
      const { data, error } = await supabaseAdmin.rpc(
        "contar_conversas_nao_lidas",
        {
          p_empresa_id: params.empresaId,
          p_usuario_id: params.usuarioId,
          p_is_admin: params.isAdmin,
          p_setores_ids: params.setoresIds,
          p_usuario_pode_atribuir: params.usuarioPodeAtribuir,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      return Number(data || 0);
    }
  );
}
