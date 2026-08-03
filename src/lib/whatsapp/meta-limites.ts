import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const WHATSAPP_META_LIMITE_PADRAO = 250;
export const WHATSAPP_META_LIMITE_ALERTA_AMARELO = 0.8;
export const WHATSAPP_META_LIMITE_ALERTA_VERMELHO = 0.9;

const MARCADOR_ANTISPAM_131048 = "__META_ANTISPAM_131048__:";

type ConfigJson = Record<string, any> | null | undefined;

export type IntegracaoMetaLimite = {
  id: string;
  empresa_id?: string | null;
  phone_number_id?: string | null;
  business_portfolio_id?: string | null;
  meta_messaging_limit?: number | null;
  meta_messaging_limit_tier?: string | null;
  meta_account_mode?: string | null;
  quality_rating?: string | null;
  config_json?: ConfigJson;
};

type ReservaLimiteParams = {
  empresaId: string;
  integracao: IntegracaoMetaLimite;
  telefones: string[];
  origem: string;
  templateId?: string | null;
  templateNome?: string | null;
  usuarioId?: string | null;
  metadataJson?: Record<string, any>;
};

type AtualizarReservaParams = {
  reservaIds?: string[];
  telefone?: string | null;
  status: "processando" | "enviado" | "falha" | "cancelado";
  messageId?: string | null;
  contatoId?: string | null;
  conversaId?: string | null;
  metadataJson?: Record<string, any> | null;
};

type RpcReservaLimite = {
  ok: boolean;
  limite: number;
  usados: number;
  reservados: number;
  restantes: number;
  telefones_bloqueados: string[] | null;
  reserva_ids: string[] | null;
};

type RpcResumoLimite = {
  portfolio_id: string | null;
  usados: number | null;
  restantes: number | null;
  antispam_bloqueado: boolean | null;
  antispam_bloqueado_ate: string | null;
};

const supabaseAdmin = getSupabaseAdmin();

function objetoConfig(configJson: ConfigJson) {
  return configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? configJson
    : {};
}

function rpcNaoDisponivel(error: { code?: string; message?: string } | null) {
  const texto = String(error?.message || "").toLowerCase();

  return (
    error?.code === "PGRST202" ||
    texto.includes("obter_resumo_whatsapp_meta_limite") &&
      (texto.includes("schema cache") || texto.includes("could not find"))
  );
}

function extrairBloqueioAntispam(telefonesBloqueados?: string[] | null) {
  const marcador = (telefonesBloqueados || []).find((item) =>
    String(item || "").startsWith(MARCADOR_ANTISPAM_131048)
  );

  if (!marcador) {
    return {
      bloqueado: false,
      bloqueadoAte: null as string | null,
      telefones: telefonesBloqueados || [],
    };
  }

  const bloqueadoAte = marcador.slice(MARCADOR_ANTISPAM_131048.length).trim();

  return {
    bloqueado: true,
    bloqueadoAte: bloqueadoAte || null,
    telefones: (telefonesBloqueados || []).filter(
      (item) => !String(item || "").startsWith(MARCADOR_ANTISPAM_131048)
    ),
  };
}

function formatarBloqueioAntispam(dataIso?: string | null) {
  if (!dataIso) return null;

  const data = new Date(dataIso);

  if (Number.isNaN(data.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

export function normalizarTelefoneMetaLimite(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

export function normalizarTelefonesMetaLimite(telefones: string[]) {
  return Array.from(
    new Set(
      telefones
        .map((telefone) => normalizarTelefoneMetaLimite(telefone))
        .filter((telefone) => telefone.length >= 10)
    )
  );
}

export function resolverLimitePorTier(tier?: string | null) {
  const valor = String(tier || "").trim().toUpperCase();

  if (!valor) return null;
  if (valor.includes("UNLIMITED")) return 1000000000;
  if (valor.includes("100K")) return 100000;
  if (valor.includes("10K")) return 10000;
  if (valor.includes("1K")) return 1000;
  if (valor.includes("250")) return 250;
  if (valor.includes("50")) return 50;

  const numero = Number(valor.replace(/[^\d]/g, ""));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

export function obterLimiteMetaIntegracao(integracao: IntegracaoMetaLimite) {
  const limiteColuna = Number(integracao.meta_messaging_limit || 0);

  if (Number.isFinite(limiteColuna) && limiteColuna > 0) {
    return {
      limite: limiteColuna,
      tier: integracao.meta_messaging_limit_tier || null,
      origem: "coluna" as const,
    };
  }

  const config = objetoConfig(integracao.config_json);
  const saude = objetoConfig(config.whatsapp_meta_health);
  const limiteConfig = Number(
    saude.messaging_limit ||
      saude.messaging_limit_limit ||
      config.meta_messaging_limit ||
      0
  );

  if (Number.isFinite(limiteConfig) && limiteConfig > 0) {
    return {
      limite: limiteConfig,
      tier:
        integracao.meta_messaging_limit_tier ||
        saude.messaging_limit_tier ||
        config.meta_messaging_limit_tier ||
        null,
      origem: "config_json" as const,
    };
  }

  const tier =
    integracao.meta_messaging_limit_tier ||
    saude.messaging_limit_tier ||
    config.meta_messaging_limit_tier ||
    null;
  const limiteTier = resolverLimitePorTier(tier);

  if (limiteTier) {
    return {
      limite: limiteTier,
      tier,
      origem: "tier" as const,
    };
  }

  return {
    limite: WHATSAPP_META_LIMITE_PADRAO,
    tier: tier || "TIER_250_PADRAO_SISTEMA",
    origem: "padrao_sistema" as const,
  };
}

export async function obterResumoLimiteMeta(params: {
  empresaId: string;
  integracao: IntegracaoMetaLimite;
}) {
  const limiteInfo = obterLimiteMetaIntegracao(params.integracao);
  const { data: resumoData, error: resumoError } = await supabaseAdmin.rpc(
    "obter_resumo_whatsapp_meta_limite",
    {
      p_empresa_id: params.empresaId,
      p_integracao_whatsapp_id: params.integracao.id,
      p_limite: limiteInfo.limite,
    }
  );

  if (!resumoError) {
    const resumo = (Array.isArray(resumoData)
      ? resumoData[0] || null
      : resumoData || null) as RpcResumoLimite | null;

    if (resumo) {
      const usados = Math.max(0, Number(resumo.usados || 0));
      const restantes = Math.max(
        0,
        Number.isFinite(Number(resumo.restantes))
          ? Number(resumo.restantes)
          : limiteInfo.limite - usados
      );
      const percentual = limiteInfo.limite > 0 ? usados / limiteInfo.limite : 0;

      return {
        ...limiteInfo,
        usados,
        restantes,
        percentual,
        portfolioId: resumo.portfolio_id || null,
        antispamBloqueado: resumo.antispam_bloqueado === true,
        antispamBloqueadoAte: resumo.antispam_bloqueado_ate || null,
        alerta:
          percentual >= WHATSAPP_META_LIMITE_ALERTA_VERMELHO
            ? "vermelho"
            : percentual >= WHATSAPP_META_LIMITE_ALERTA_AMARELO
            ? "amarelo"
            : "normal",
      };
    }
  } else if (!rpcNaoDisponivel(resumoError)) {
    throw new Error(`Erro ao consultar limite Meta: ${resumoError.message}`);
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_meta_conversas_iniciadas")
    .select("telefone_normalizado")
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracao.id)
    .gt("janela_expira_em", new Date().toISOString())
    .in("status", ["reservado", "processando", "enviado"]);

  if (error) {
    throw new Error(`Erro ao consultar limite Meta: ${error.message}`);
  }

  const usados = new Set(
    (data || [])
      .map((item) => normalizarTelefoneMetaLimite(item.telefone_normalizado))
      .filter(Boolean)
  ).size;
  const restantes = Math.max(limiteInfo.limite - usados, 0);
  const percentual = limiteInfo.limite > 0 ? usados / limiteInfo.limite : 0;

  return {
    ...limiteInfo,
    usados,
    restantes,
    percentual,
    portfolioId: params.integracao.business_portfolio_id || null,
    antispamBloqueado: false,
    antispamBloqueadoAte: null,
    alerta:
      percentual >= WHATSAPP_META_LIMITE_ALERTA_VERMELHO
        ? "vermelho"
        : percentual >= WHATSAPP_META_LIMITE_ALERTA_AMARELO
        ? "amarelo"
        : "normal",
  };
}

export async function reservarLimiteMeta(params: ReservaLimiteParams) {
  const telefones = normalizarTelefonesMetaLimite(params.telefones);
  const limiteInfo = obterLimiteMetaIntegracao(params.integracao);

  const { data, error } = await supabaseAdmin.rpc(
    "reservar_whatsapp_meta_limite",
    {
      p_empresa_id: params.empresaId,
      p_integracao_whatsapp_id: params.integracao.id,
      p_phone_number_id: params.integracao.phone_number_id || null,
      p_telefones: telefones,
      p_limite: limiteInfo.limite,
      p_origem: params.origem,
      p_template_id: params.templateId || null,
      p_template_nome: params.templateNome || null,
      p_usuario_id: params.usuarioId || null,
      p_metadata_json: {
        ...(params.metadataJson || {}),
        limite_origem: limiteInfo.origem,
        limite_tier: limiteInfo.tier,
      },
    }
  );

  if (error) {
    throw new Error(`Erro ao reservar limite Meta: ${error.message}`);
  }

  const resultado = Array.isArray(data)
    ? ((data[0] || null) as RpcReservaLimite | null)
    : ((data || null) as RpcReservaLimite | null);

  if (!resultado) {
    throw new Error("A reserva de limite Meta nao retornou resultado.");
  }

  const bloqueioAntispam = extrairBloqueioAntispam(
    resultado.telefones_bloqueados
  );

  if (!resultado.ok) {
    return {
      ok: false as const,
      limite: resultado.limite,
      usados: resultado.usados,
      reservados: resultado.reservados,
      restantes: resultado.restantes,
      reservaIds: [] as string[],
      telefonesBloqueados: resultado.telefones_bloqueados || [],
      telefones,
      limiteInfo,
      motivoBloqueio: bloqueioAntispam.bloqueado
        ? "antispam_131048"
        : "limite_24h",
      bloqueadoAte: bloqueioAntispam.bloqueadoAte,
      error: bloqueioAntispam.bloqueado
        ? "A Meta aplicou uma restricao temporaria de envio por taxa de spam (erro 131048)."
        : "Este envio ultrapassaria o limite de conversas iniciadas pela empresa em 24 horas definido pela Meta.",
    };
  }

  return {
    ok: true as const,
    limite: resultado.limite,
    usados: resultado.usados,
    reservados: resultado.reservados,
    restantes: resultado.restantes,
    reservaIds: resultado.reserva_ids || [],
    telefonesBloqueados: [] as string[],
    telefones,
    limiteInfo,
    motivoBloqueio: null,
    bloqueadoAte: null,
  };
}

export async function atualizarReservaLimiteMeta({
  reservaIds = [],
  telefone,
  status,
  messageId,
  contatoId,
  conversaId,
  metadataJson,
}: AtualizarReservaParams) {
  const telefoneNormalizado = normalizarTelefoneMetaLimite(telefone);

  if (reservaIds.length === 0 || !telefoneNormalizado) {
    return;
  }

  const payload: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
    metadata_json: metadataJson || {},
  };

  if (messageId !== undefined) {
    payload.message_id = messageId;
  }

  if (contatoId !== undefined) {
    payload.contato_id = contatoId;
  }

  if (conversaId !== undefined) {
    payload.conversa_id = conversaId;
  }

  if (status === "processando" || status === "enviado") {
    payload.enviado_em = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("whatsapp_meta_conversas_iniciadas")
    .update(payload)
    .in("id", reservaIds)
    .eq("telefone_normalizado", telefoneNormalizado)
    .in("status", ["reservado", "processando", "enviado"]);

  if (error) {
    console.warn("[WHATSAPP META LIMITE] Erro ao atualizar reserva:", error);
  }
}

export function montarRespostaLimiteMetaExcedido(resultado: {
  limite: number;
  usados: number;
  restantes: number;
  telefonesBloqueados?: string[];
}) {
  const bloqueioAntispam = extrairBloqueioAntispam(
    resultado.telefonesBloqueados
  );

  if (bloqueioAntispam.bloqueado) {
    const bloqueadoAteFormatado = formatarBloqueioAntispam(
      bloqueioAntispam.bloqueadoAte
    );

    return {
      ok: false,
      motivo: "whatsapp_meta_antispam_131048",
      code: "WHATSAPP_META_ANTISPAM_131048",
      error:
        "A Meta aplicou uma restricao temporaria de envio por taxa de spam (erro 131048).",
      detalhe: bloqueadoAteFormatado
        ? `O CRM pausou novos disparos preventivamente ate ${bloqueadoAteFormatado}. O bloqueio antispam e separado do limite de contatos unicos em 24 horas.`
        : "O CRM pausou novos disparos preventivamente. O bloqueio antispam e separado do limite de contatos unicos em 24 horas.",
      limite: resultado.limite,
      usados: resultado.usados,
      restantes: resultado.restantes,
      bloqueado_ate: bloqueioAntispam.bloqueadoAte,
      telefones_bloqueados: bloqueioAntispam.telefones,
    };
  }

  return {
    ok: false,
    motivo: "whatsapp_meta_limite_excedido",
    code: "WHATSAPP_META_LIMITE_EXCEDIDO",
    error:
      "Este envio ultrapassaria o limite de conversas iniciadas pela empresa em uma janela movel de 24 horas definida pela Meta.",
    detalhe: `Limite atual: ${resultado.limite}. Ja usados/reservados no portfolio empresarial: ${resultado.usados}. Restantes agora: ${resultado.restantes}.`,
    limite: resultado.limite,
    usados: resultado.usados,
    restantes: resultado.restantes,
    telefones_bloqueados: resultado.telefonesBloqueados || [],
  };
}
