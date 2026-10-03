import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const META_PAYMENT_ERROR_CODES = [131042, 131044] as const;

export const META_PAYMENT_SETTINGS_URL =
  "https://business.facebook.com/latest/billing_hub/accounts";

type JsonRecord = Record<string, unknown>;

export type MetaPaymentBlockState = {
  ativo: boolean;
  codigo: number | null;
  detalhe: string | null;
  ocorrido_em: string | null;
  ultima_falha_em: string | null;
  mensagem_externa_id: string | null;
  pausas: {
    conversas_encerradas: number;
    execucoes_canceladas: number;
    agendamentos_cancelados: number;
    pendencias_ia_canceladas: number;
    execucoes_ia_canceladas: number;
    campanhas_pausadas: number;
  };
};

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): JsonRecord {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as JsonRecord)
    : {};
}

export function codigoErroMetaPagamento(codigo?: number | null) {
  return META_PAYMENT_ERROR_CODES.includes(
    Number(codigo || 0) as (typeof META_PAYMENT_ERROR_CODES)[number]
  );
}

export function lerBloqueioFinanceiroMeta(
  raw: unknown
): MetaPaymentBlockState | null {
  const bloqueio = objeto(objeto(raw).bloqueio_financeiro_meta);

  if (bloqueio.ativo !== true) return null;

  const pausas = objeto(bloqueio.pausas);

  return {
    ativo: true,
    codigo: Number.isFinite(Number(bloqueio.codigo))
      ? Number(bloqueio.codigo)
      : null,
    detalhe: bloqueio.detalhe ? String(bloqueio.detalhe) : null,
    ocorrido_em: bloqueio.ocorrido_em ? String(bloqueio.ocorrido_em) : null,
    ultima_falha_em: bloqueio.ultima_falha_em
      ? String(bloqueio.ultima_falha_em)
      : null,
    mensagem_externa_id: bloqueio.mensagem_externa_id
      ? String(bloqueio.mensagem_externa_id)
      : null,
    pausas: {
      conversas_encerradas: Number(pausas.conversas_encerradas || 0),
      execucoes_canceladas: Number(pausas.execucoes_canceladas || 0),
      agendamentos_cancelados: Number(pausas.agendamentos_cancelados || 0),
      pendencias_ia_canceladas: Number(pausas.pendencias_ia_canceladas || 0),
      execucoes_ia_canceladas: Number(pausas.execucoes_ia_canceladas || 0),
      campanhas_pausadas: Number(pausas.campanhas_pausadas || 0),
    },
  };
}

export async function buscarBloqueioFinanceiroMetaIntegracao(params: {
  empresaId: string;
  integracaoId?: string | null;
}) {
  const integracaoId = String(params.integracaoId || "").trim();
  if (!params.empresaId || !integracaoId) return null;

  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, meta_saude_raw_json")
    .eq("empresa_id", params.empresaId)
    .eq("id", integracaoId)
    .maybeSingle();

  if (error) {
    console.warn(
      "[META PAYMENT BLOCK] Erro ao consultar bloqueio financeiro:",
      error
    );
    return null;
  }

  return lerBloqueioFinanceiroMeta(data?.meta_saude_raw_json);
}

export async function buscarBloqueioFinanceiroMetaConversa(params: {
  empresaId: string;
  conversaId: string;
  integracaoId?: string | null;
}) {
  let integracaoId = String(params.integracaoId || "").trim();

  if (!integracaoId) {
    const { data: conversa, error } = await supabaseAdmin
      .from("conversas")
      .select("integracao_whatsapp_id")
      .eq("empresa_id", params.empresaId)
      .eq("id", params.conversaId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[META PAYMENT BLOCK] Erro ao localizar integração da conversa:",
        error
      );
      return null;
    }

    integracaoId = String(conversa?.integracao_whatsapp_id || "").trim();
  }

  return buscarBloqueioFinanceiroMetaIntegracao({
    empresaId: params.empresaId,
    integracaoId,
  });
}
