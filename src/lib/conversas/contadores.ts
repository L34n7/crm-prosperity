import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import {
  getOrSetTtlCache,
  getTtlCacheKey,
} from "@/lib/cache/ttl-cache";
import { contarConversasNaoLidas } from "@/lib/conversas/nao-lidas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const CONTADORES_CONVERSAS_CACHE_TTL_MS = 10_000;

export type FiltrosContadoresConversas = {
  status: string | null;
  prioridade: string | null;
  contatoId: string | null;
  setorId: string | null;
  responsavelId: string | null;
  busca: string;
  canal: string;
  listaId: string | null;
  integracaoWhatsappId?: string | null;
  integracoesWhatsappIdsPermitidos?: string[];
};

export type TotaisChipsRapidos = {
  Todas: number;
  minhas: number;
  favoritos: number;
  sem_responsavel: number;
  nao_lidas: number;
  robo: number;
};

type ContadoresAgregadosRow = {
  todas?: number | string | null;
  minhas?: number | string | null;
  favoritos?: number | string | null;
  sem_responsavel?: number | string | null;
  robo?: number | string | null;
};

function numeroSeguro(valor: number | string | null | undefined) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? numero : 0;
}

export async function obterContadoresConversas({
  usuario,
  usuarioPodeAtribuir,
  filtros,
}: {
  usuario: UsuarioContexto;
  usuarioPodeAtribuir: boolean;
  filtros: FiltrosContadoresConversas;
}): Promise<TotaisChipsRapidos> {
  if (!usuario.empresa_id) {
    return {
      Todas: 0,
      minhas: 0,
      favoritos: 0,
      sem_responsavel: 0,
      nao_lidas: 0,
      robo: 0,
    };
  }

  const setoresIds = [...(usuario.setores_ids ?? [])].sort();
  const admin = isAdministrador(usuario);
  const cacheKey = getTtlCacheKey("contadores-conversas", [
    usuario.empresa_id,
    usuario.id,
    admin,
    usuarioPodeAtribuir,
    setoresIds.join(","),
    filtros.status,
    filtros.prioridade,
    filtros.contatoId,
    filtros.setorId,
    filtros.responsavelId,
    filtros.busca,
    filtros.canal,
    filtros.listaId,
    filtros.integracaoWhatsappId,
    [...(filtros.integracoesWhatsappIdsPermitidos ?? [])].sort().join(","),
  ]);

  return await getOrSetTtlCache(
    cacheKey,
    CONTADORES_CONVERSAS_CACHE_TTL_MS,
    async () => {
      const parametrosComuns = {
        p_empresa_id: usuario.empresa_id,
        p_usuario_id: usuario.id,
        p_is_admin: admin,
        p_setores_ids: setoresIds,
        p_usuario_pode_atribuir: usuarioPodeAtribuir,
        p_status: filtros.status,
        p_prioridade: filtros.prioridade,
        p_contato_id: filtros.contatoId,
        p_setor_id: filtros.setorId,
        p_responsavel_id: filtros.responsavelId,
        p_busca: filtros.busca || null,
        p_canal: filtros.canal || null,
        p_lista_id: filtros.listaId,
        p_integracao_whatsapp_id: filtros.integracaoWhatsappId || null,
        p_integracoes_whatsapp_ids: filtros.integracoesWhatsappIdsPermitidos ?? [],
      };

      const [agregadosResult, naoLidas] = await Promise.all([
        supabaseAdmin.rpc("obter_contadores_conversas", parametrosComuns),
        contarConversasNaoLidas({
          empresaId: usuario.empresa_id!,
          usuarioId: usuario.id,
          isAdmin: admin,
          setoresIds,
          usuarioPodeAtribuir,
          status: filtros.status,
          prioridade: filtros.prioridade,
          contatoId: filtros.contatoId,
          setorId: filtros.setorId,
          responsavelId: filtros.responsavelId,
          busca: filtros.busca,
          canal: filtros.canal,
          listaId: filtros.listaId,
          integracaoWhatsappId: filtros.integracaoWhatsappId,
          integracoesWhatsappIdsPermitidos:
            filtros.integracoesWhatsappIdsPermitidos ?? [],
        }),
      ]);

      if (agregadosResult.error) {
        throw new Error(agregadosResult.error.message);
      }

      const agregados = (
        Array.isArray(agregadosResult.data)
          ? agregadosResult.data[0]
          : agregadosResult.data
      ) as ContadoresAgregadosRow | null;

      return {
        Todas: numeroSeguro(agregados?.todas),
        minhas: numeroSeguro(agregados?.minhas),
        favoritos: numeroSeguro(agregados?.favoritos),
        sem_responsavel: numeroSeguro(agregados?.sem_responsavel),
        nao_lidas: numeroSeguro(naoLidas),
        robo: numeroSeguro(agregados?.robo),
      };
    }
  );
}
