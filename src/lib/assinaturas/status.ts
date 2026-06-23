import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOrSetTtlCache,
  getTtlCacheKey,
  invalidateTtlCache,
} from "@/lib/cache/ttl-cache";

const supabaseAdmin = getSupabaseAdmin();
const ASSINATURA_CACHE_TTL_MS = 30_000;
const ASSINATURA_SYNC_CACHE_TTL_MS = 30_000;

export type AssinaturaStatus = "ativa" | "vencida" | "bloqueada";

export type AssinaturaEmpresa = {
  status: AssinaturaStatus;
  inicio_em: string | null;
  vencimento_em: string | null;
  bloqueio_em: string | null;
  renovada_em: string | null;
  gateway: string | null;
  referencia: string | null;
  plano_id: string | null;
  plano_slug: string | null;
  plano_nome: string | null;
  checkout_url: string | null;
};

type EmpresaAssinaturaRow = {
  id: string;
  plano_id: string | null;
  assinatura_status: AssinaturaStatus | null;
  assinatura_inicio_em: string | null;
  assinatura_vencimento_em: string | null;
  assinatura_bloqueio_em: string | null;
  assinatura_renovada_em: string | null;
  assinatura_gateway: string | null;
  assinatura_referencia: string | null;
  planos:
    | {
        id?: string;
        nome?: string | null;
        slug?: string | null;
      }
    | Array<{
        id?: string;
        nome?: string | null;
        slug?: string | null;
      }>
    | null;
};

export const PERMISSOES_ADMIN_ASSINATURA_BLOQUEADA = [
  "conversas.visualizar",
  "conversas.assumir",
  "conversas.atribuir",
  "conversas.transferir",
  "conversas.encerrar",
  "mensagens.visualizar",
  "mensagens.enviar",
  "assinaturas.plano.visualizar",
];

export function assinaturaEstaAtiva(
  assinatura: AssinaturaEmpresa | null | undefined
) {
  return !assinatura || assinatura.status === "ativa";
}

export function assinaturaEstaBloqueada(
  assinatura: AssinaturaEmpresa | null | undefined
) {
  return assinatura?.status === "bloqueada";
}

export function filtrarPermissoesPorAssinatura(params: {
  permissoes: string[];
  isAdmin: boolean;
  assinatura: AssinaturaEmpresa | null;
}) {
  if (!assinaturaEstaBloqueada(params.assinatura)) {
    return params.permissoes;
  }

  if (!params.isAdmin) {
    return [];
  }

  const permitidas = new Set(PERMISSOES_ADMIN_ASSINATURA_BLOQUEADA);
  return params.permissoes.filter((permissao) => permitidas.has(permissao));
}

export async function sincronizarAssinaturaEmpresa(empresaId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "sincronizar_assinatura_empresa",
    {
      p_empresa_id: empresaId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  invalidateTtlCache(getTtlCacheKey("assinatura-empresa", [empresaId]));

  return data as AssinaturaStatus;
}

function normalizarPlano(plano: EmpresaAssinaturaRow["planos"]) {
  return Array.isArray(plano) ? plano[0] : plano;
}

function obterCheckoutUrlPorPlanoSlug(planoSlug: string | null | undefined) {
  if (planoSlug === "basico" || planoSlug === "basic") {
    return (
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
      null
    );
  }

  if (planoSlug === "essencial") {
    return (
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
      process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
      null
    );
  }

  return (
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
    process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
    null
  );
}

export async function buscarAssinaturaEmpresa(
  empresaId: string | null | undefined,
  options: { sincronizar?: boolean } = {}
) {
  if (!empresaId) return null;

  if (options.sincronizar !== false) {
    await getOrSetTtlCache(
      getTtlCacheKey("assinatura-empresa-sync", [empresaId]),
      ASSINATURA_SYNC_CACHE_TTL_MS,
      () => sincronizarAssinaturaEmpresa(empresaId)
    );
  }

  return await getOrSetTtlCache(
    getTtlCacheKey("assinatura-empresa", [empresaId]),
    ASSINATURA_CACHE_TTL_MS,
    async () => {
      const { data, error } = await supabaseAdmin
        .from("empresas")
        .select(
          `
          id,
          plano_id,
          assinatura_status,
          assinatura_inicio_em,
          assinatura_vencimento_em,
          assinatura_bloqueio_em,
          assinatura_renovada_em,
          assinatura_gateway,
          assinatura_referencia,
          planos (
            id,
            nome,
            slug
          )
        `
        )
        .eq("id", empresaId)
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar assinatura da empresa: ${error.message}`);
      }

      if (!data) return null;

      const empresa = data as EmpresaAssinaturaRow;
      const plano = normalizarPlano(empresa.planos);
      const planoSlug = plano?.slug ?? null;

      return {
        status: empresa.assinatura_status ?? "ativa",
        inicio_em: empresa.assinatura_inicio_em,
        vencimento_em: empresa.assinatura_vencimento_em,
        bloqueio_em: empresa.assinatura_bloqueio_em,
        renovada_em: empresa.assinatura_renovada_em,
        gateway: empresa.assinatura_gateway,
        referencia: empresa.assinatura_referencia,
        plano_id: empresa.plano_id,
        plano_slug: planoSlug,
        plano_nome: plano?.nome ?? null,
        checkout_url: obterCheckoutUrlPorPlanoSlug(planoSlug),
      } satisfies AssinaturaEmpresa;
    }
  );
}

export function calcularJanelaAssinatura(pagoEm: string | Date | null | undefined) {
  const inicio = pagoEm ? new Date(pagoEm) : new Date();
  const inicioValido = Number.isNaN(inicio.getTime()) ? new Date() : inicio;
  const vencimento = new Date(inicioValido.getTime() + 30 * 24 * 60 * 60 * 1000);
  const bloqueio = new Date(inicioValido.getTime() + 37 * 24 * 60 * 60 * 1000);

  return {
    inicioEm: inicioValido.toISOString(),
    vencimentoEm: vencimento.toISOString(),
    bloqueioEm: bloqueio.toISOString(),
  };
}
