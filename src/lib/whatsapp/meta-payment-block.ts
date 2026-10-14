import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deveLimparAvisoPagamentoMeta } from "@/lib/whatsapp/meta-payment-warning-policy";

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
  cooldown_nivel: number;
  cooldown_segundos: number;
  cooldown_ate: string | null;
  probe_em_andamento_ate: string | null;
  falhas_consecutivas: number;
  pausas: {
    conversas_encerradas: number;
    execucoes_canceladas: number;
    agendamentos_cancelados: number;
    pendencias_ia_canceladas: number;
    execucoes_ia_canceladas: number;
    jobs_fila_cancelados: number;
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
    cooldown_nivel: Number(bloqueio.cooldown_nivel || 0),
    cooldown_segundos: Number(bloqueio.cooldown_segundos || 0),
    cooldown_ate: bloqueio.cooldown_ate ? String(bloqueio.cooldown_ate) : null,
    probe_em_andamento_ate: bloqueio.probe_em_andamento_ate
      ? String(bloqueio.probe_em_andamento_ate)
      : null,
    falhas_consecutivas: Number(bloqueio.falhas_consecutivas || 0),
    pausas: {
      conversas_encerradas: Number(pausas.conversas_encerradas || 0),
      execucoes_canceladas: Number(pausas.execucoes_canceladas || 0),
      agendamentos_cancelados: Number(pausas.agendamentos_cancelados || 0),
      pendencias_ia_canceladas: Number(pausas.pendencias_ia_canceladas || 0),
      execucoes_ia_canceladas: Number(pausas.execucoes_ia_canceladas || 0),
      jobs_fila_cancelados: Number(pausas.jobs_fila_cancelados || 0),
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


export type MetaPaymentSendGate = {
  permitido: boolean;
  modo: "normal" | "cooldown" | "aguardando_probe" | "probe";
  retryAt: string | null;
  delayMs: number;
  cooldownNivel: number;
};

function timestampMs(valor?: string | null) {
  if (!valor) return null;
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function extrairCodigoErroMetaPagamentoResposta(
  valor: unknown
): number | null {
  let candidato = valor;

  if (typeof candidato === "string") {
    try {
      candidato = JSON.parse(candidato);
    } catch {
      return null;
    }
  }

  if (!candidato || typeof candidato !== "object" || Array.isArray(candidato)) {
    return null;
  }

  const registro = candidato as Record<string, unknown>;
  const erro =
    registro.error && typeof registro.error === "object"
      ? (registro.error as Record<string, unknown>)
      : registro;
  const codigo = Number(erro.code);

  return codigoErroMetaPagamento(codigo) ? codigo : null;
}

export async function reservarEnvioAposCooldownPagamentoMeta(params: {
  empresaId: string;
  integracaoId?: string | null;
}): Promise<MetaPaymentSendGate> {
  const integracaoId = String(params.integracaoId || "").trim();

  if (!params.empresaId || !integracaoId) {
    return {
      permitido: true,
      modo: "normal",
      retryAt: null,
      delayMs: 0,
      cooldownNivel: 0,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "claim_whatsapp_meta_payment_send",
    {
      p_empresa_id: params.empresaId,
      p_integracao_id: integracaoId,
      p_agora: new Date().toISOString(),
    }
  );

  if (error) {
    console.warn(
      "[META PAYMENT COOLDOWN] Erro ao consultar cooldown; envio seguirá para não bloquear indevidamente:",
      error
    );
    return {
      permitido: true,
      modo: "normal",
      retryAt: null,
      delayMs: 0,
      cooldownNivel: 0,
    };
  }

  const estado = objeto(data);
  const permitido = estado.permitido !== false;
  const modoRaw = String(estado.modo || (permitido ? "normal" : "cooldown"));
  const modo: MetaPaymentSendGate["modo"] =
    modoRaw === "probe" ||
    modoRaw === "aguardando_probe" ||
    modoRaw === "cooldown"
      ? modoRaw
      : "normal";
  const retryAt = estado.retry_at ? String(estado.retry_at) : null;
  const retryMs = timestampMs(retryAt);
  const delayMs =
    !permitido && retryMs !== null
      ? Math.max(1000, retryMs - Date.now() + 250)
      : 0;

  return {
    permitido,
    modo,
    retryAt,
    delayMs,
    cooldownNivel: Number(estado.cooldown_nivel || 0),
  };
}

export async function registrarFalhaFinanceiraMetaResposta(params: {
  empresaId: string;
  integracaoId?: string | null;
  codigo: number;
  detalhe?: string | null;
  mensagemExternaId?: string | null;
}) {
  const integracaoId = String(params.integracaoId || "").trim();

  if (
    !params.empresaId ||
    !integracaoId ||
    !codigoErroMetaPagamento(params.codigo)
  ) {
    return null;
  }

  const ocorridoEm = new Date().toISOString();
  const { data: avisoNovo, error } = await supabaseAdmin.rpc(
    "claim_whatsapp_meta_payment_block",
    {
      p_empresa_id: params.empresaId,
      p_integracao_id: integracaoId,
      p_codigo: params.codigo,
      p_detalhe:
        String(params.detalhe || "").trim() ||
        "Falha financeira retornada pela Meta.",
      p_mensagem_externa_id:
        String(params.mensagemExternaId || "").trim() || null,
      p_ocorrido_em: ocorridoEm,
    }
  );

  if (error) {
    console.warn(
      "[META PAYMENT COOLDOWN] Erro ao registrar falha financeira:",
      error
    );
    return null;
  }

  const bloqueio = await buscarBloqueioFinanceiroMetaIntegracao({
    empresaId: params.empresaId,
    integracaoId,
  });

  return {
    avisoNovo: avisoNovo === true,
    ocorridoEm,
    cooldownAte: bloqueio?.cooldown_ate || null,
    cooldownNivel: bloqueio?.cooldown_nivel || 0,
    cooldownSegundos: bloqueio?.cooldown_segundos || 0,
  };
}

export async function confirmarEnvioAposCooldownPagamentoMeta(params: {
  empresaId: string;
  integracaoId?: string | null;
}) {
  return limparAvisoFinanceiroMetaAposEnvioConfirmado({
    empresaId: params.empresaId,
    integracaoId: params.integracaoId,
    mensagemCriadaEm: new Date().toISOString(),
  });
}

export async function limparAvisoFinanceiroMetaAposEnvioConfirmado(params: {
  empresaId: string;
  integracaoId?: string | null;
  mensagemCriadaEm?: string | null;
}) {
  const integracaoId = String(params.integracaoId || "").trim();
  if (!params.empresaId || !integracaoId || !params.mensagemCriadaEm) return false;

  const bloqueio = await buscarBloqueioFinanceiroMetaIntegracao({
    empresaId: params.empresaId,
    integracaoId,
  });

  if (
    !bloqueio ||
    !deveLimparAvisoPagamentoMeta({
      ativo: bloqueio.ativo,
      ultimaFalhaEm: bloqueio.ultima_falha_em,
      mensagemCriadaEm: params.mensagemCriadaEm,
    })
  ) {
    return false;
  }

  const { data, error } = await supabaseAdmin.rpc(
    "clear_whatsapp_meta_payment_warning_if_older",
    {
      p_empresa_id: params.empresaId,
      p_integracao_id: integracaoId,
      p_mensagem_criada_em: params.mensagemCriadaEm,
    }
  );

  if (error) {
    console.warn(
      "[META PAYMENT BLOCK] Erro ao limpar aviso financeiro após envio confirmado:",
      error
    );
    return false;
  }

  return data === true;
}
