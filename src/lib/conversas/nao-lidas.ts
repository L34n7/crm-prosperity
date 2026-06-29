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
  status?: string | null;
  prioridade?: string | null;
  contatoId?: string | null;
  setorId?: string | null;
  responsavelId?: string | null;
  busca?: string | null;
  canal?: string | null;
  listaId?: string | null;
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
      params.status,
      params.prioridade,
      params.contatoId,
      params.setorId,
      params.responsavelId,
      params.busca,
      params.canal,
      params.listaId,
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
          p_status: params.status || null,
          p_prioridade: params.prioridade || null,
          p_contato_id: params.contatoId || null,
          p_setor_id: params.setorId || null,
          p_responsavel_id: params.responsavelId || null,
          p_busca: params.busca || null,
          p_canal: params.canal || null,
          p_lista_id: params.listaId || null,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      return Number(data || 0);
    }
  );
}
