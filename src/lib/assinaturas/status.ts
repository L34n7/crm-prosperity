import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOrSetTtlCache,
  getTtlCacheKey,
  invalidateTtlCache,
} from "@/lib/cache/ttl-cache";
import { reconciliarEstadoAssinaturaProsperityPay } from "@/lib/prosperity-pay/subscriptions";

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
  free_trial_4d: boolean;
  affiliate_ref: string | null;
  white_label_client?: boolean;
  white_label_gestora?: boolean;
  white_label_id?: string | null;
  billing_owner_empresa_id?: string | null;
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
  assinatura_metadata_json: Record<string, unknown> | null;
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
): Promise<AssinaturaEmpresa | null> {
  if (!empresaId) return null;

  const { data: vinculoWhiteLabel, error: vinculoWhiteLabelError } =
    await supabaseAdmin
      .from("empresas")
      .select("status,white_label_id,white_label_tipo,restauracao_pendente_pagamento_em")
      .eq("id", empresaId)
      .maybeSingle<{
        status: string | null;
        white_label_id: string | null;
        white_label_tipo: "gestora" | "cliente" | null;
        restauracao_pendente_pagamento_em: string | null;
      }>();

  if (vinculoWhiteLabelError) {
    throw new Error(
      `Erro ao verificar vínculo White Label: ${vinculoWhiteLabelError.message}`
    );
  }

  if (
    vinculoWhiteLabel?.white_label_id &&
    vinculoWhiteLabel.white_label_tipo === "cliente"
  ) {
    const { data: whiteLabel, error: whiteLabelError } = await supabaseAdmin
      .from("white_labels")
      .select("empresa_gestora_id")
      .eq("id", vinculoWhiteLabel.white_label_id)
      .maybeSingle<{ empresa_gestora_id: string | null }>();

    if (whiteLabelError) {
      throw new Error(
        `Erro ao buscar responsável financeiro do White Label: ${whiteLabelError.message}`
      );
    }

    const { data: empresaCliente, error: empresaClienteError } =
      await supabaseAdmin
        .from("empresas")
        .select(
          `
          id,
          plano_id,
          planos (
            id,
            nome,
            slug
          )
        `
        )
        .eq("id", empresaId)
        .maybeSingle();

    if (empresaClienteError) {
      throw new Error(
        `Erro ao buscar plano do cliente White Label: ${empresaClienteError.message}`
      );
    }

    const assinaturaGestora = whiteLabel?.empresa_gestora_id
      ? await buscarAssinaturaEmpresa(whiteLabel.empresa_gestora_id, options)
      : null;
    const planoCliente = Array.isArray(empresaCliente?.planos)
      ? empresaCliente.planos[0] || null
      : empresaCliente?.planos || null;
    const clienteAtivo =
      String(vinculoWhiteLabel.status || "").trim().toLowerCase() === "ativa";
    const pendencia = vinculoWhiteLabel.restauracao_pendente_pagamento_em;
    const renovacaoGestora = assinaturaGestora?.renovada_em
      ? new Date(assinaturaGestora.renovada_em).getTime() : 0;
    const renovacaoAposRestauracao = Boolean(pendencia) &&
      renovacaoGestora >= new Date(pendencia!).getTime() &&
      assinaturaGestora?.status === "ativa";
    if (pendencia && renovacaoAposRestauracao) {
      const {error:baixaError} = await supabaseAdmin.from("empresas")
        .update({restauracao_pendente_pagamento_em:null})
        .eq("id",empresaId)
        .eq("restauracao_pendente_pagamento_em",pendencia);
      if(baixaError) {
        console.error("[ASSINATURA WL] Falha ao baixar pendência de restauração:",baixaError.message);
      }
    }
    const aguardandoPagamento = Boolean(pendencia) && !renovacaoAposRestauracao;

    return {
      status: clienteAtivo && !aguardandoPagamento
        ? assinaturaGestora?.status ?? "ativa"
        : "bloqueada",
      inicio_em: assinaturaGestora?.inicio_em ?? null,
      vencimento_em: assinaturaGestora?.vencimento_em ?? null,
      bloqueio_em: assinaturaGestora?.bloqueio_em ?? null,
      renovada_em: assinaturaGestora?.renovada_em ?? null,
      gateway: "white_label_client",
      referencia: assinaturaGestora?.referencia ?? null,
      plano_id: empresaCliente?.plano_id ?? null,
      plano_slug: planoCliente?.slug ?? "basico",
      plano_nome: planoCliente?.nome ?? "Básico",
      checkout_url: null,
      free_trial_4d: false,
      affiliate_ref: null,
      white_label_client: true,
      white_label_gestora: false,
      white_label_id: vinculoWhiteLabel.white_label_id,
      billing_owner_empresa_id: whiteLabel?.empresa_gestora_id ?? null,
    } satisfies AssinaturaEmpresa;
  }

  if (options.sincronizar !== false) {
    await getOrSetTtlCache(
      getTtlCacheKey("assinatura-empresa-sync", [empresaId]),
      ASSINATURA_SYNC_CACHE_TTL_MS,
      async () => {
        let statusAtual = await sincronizarAssinaturaEmpresa(empresaId);

        const { data: empresaSincronizacao, error: empresaSincronizacaoError } =
          await supabaseAdmin
            .from("empresas")
            .select(
              "assinatura_gateway,assinatura_metadata_json",
            )
            .eq("id", empresaId)
            .maybeSingle();

        if (empresaSincronizacaoError) {
          throw new Error(empresaSincronizacaoError.message);
        }

        const metadataSincronizacao =
          empresaSincronizacao?.assinatura_metadata_json &&
          typeof empresaSincronizacao.assinatura_metadata_json === "object" &&
          !Array.isArray(empresaSincronizacao.assinatura_metadata_json)
            ? empresaSincronizacao.assinatura_metadata_json as Record<string, unknown>
            : {};
        const forcarReconciliacao =
          String(metadataSincronizacao.last_subscription_event || "") ===
          "subscription.renewed.recovery";

        if (
          String(empresaSincronizacao?.assinatura_gateway || "") ===
            "prosperity_pay" &&
          (statusAtual !== "ativa" || forcarReconciliacao)
        ) {
          try {
            const reconciliacao =
              await reconciliarEstadoAssinaturaProsperityPay(empresaId);

            if (reconciliacao.atualizado) {
              statusAtual = await sincronizarAssinaturaEmpresa(empresaId);
            }
          } catch (error) {
            console.error(
              "[ASSINATURA] Falha ao reconciliar estado com Prosperity Pay:",
              {
                empresaId,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        }

        return statusAtual;
      }
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
          assinatura_metadata_json,
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
        free_trial_4d:
          empresa.assinatura_gateway === "free_trial_4d" ||
          empresa.assinatura_metadata_json?.free_trial_4d === true,
        affiliate_ref:
          typeof empresa.assinatura_metadata_json?.affiliate_ref === "string"
            ? empresa.assinatura_metadata_json.affiliate_ref
            : null,
        white_label_client: false,
        white_label_gestora:
          vinculoWhiteLabel?.white_label_tipo === "gestora",
        white_label_id: vinculoWhiteLabel?.white_label_id ?? null,
        billing_owner_empresa_id:
          vinculoWhiteLabel?.white_label_tipo === "gestora"
            ? empresaId
            : null,
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
