import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  diagnosticarErroMetaWhatsapp,
  type MetaErrorBody,
  type WhatsAppMetaErrorDiagnostic,
} from "@/lib/whatsapp/meta-error-diagnostics";
import { aplicarBloqueioOperacionalWhatsappMeta } from "@/lib/whatsapp/meta-block";
import {
  obterResumoLimiteMeta,
  resolverLimitePorTier,
} from "@/lib/whatsapp/meta-limites";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { isWhatsAppProfileMetaAvailable } from "@/lib/whatsapp/profile-availability";
import {
  calcularProximaPosicaoLivre,
  listarIntegracoesWhatsappDaEmpresa,
  listarIntegracoesWhatsappPermitidas,
  obterLimiteIntegracoesWhatsapp,
} from "@/lib/whatsapp/integracoes-multiplas";

const GRAPH_VERSION = "v23.0";
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const supabaseAdmin = getSupabaseAdmin();

type ConfigJson = Record<string, unknown> | null;

type IntegracaoWhatsapp = {
  id: string;
  empresa_id: string;
  nome_conexao: string;
  numero: string;
  status: string;
  phone_number_id: string | null;
  waba_id: string | null;
  business_account_id: string | null;
  meta_business_id: string | null;
  verified_name: string | null;
  phone_number_display_name: string | null;
  phone_number_status: string | null;
  quality_rating: string | null;
  meta_messaging_limit_tier: string | null;
  meta_messaging_limit: number | null;
  meta_account_mode: string | null;
  meta_saude_ultima_verificacao_em: string | null;
  setup_completed_at: string | null;
  onboarding_status: string | null;
  onboarding_erro: string | null;
  modo_integracao?: "cloud_api" | "coexistence" | string | null;
  coex_status?: string | null;
  posicao?: number | null;
  config_json: ConfigJson;
  token_ref: string | null;
};

function extrairToken(integracao: IntegracaoWhatsapp) {
  return getWhatsAppAccessToken(integracao) || null;
}

function jsonErro(error: string, status = 400, extra?: unknown) {
  return NextResponse.json({ ok: false, error, extra }, { status });
}

async function buscarIntegracao(
  empresaId: string,
  integracaoId?: string | null
) {
  const supabase = await createClient();

  let query = supabase
    .from("integracoes_whatsapp")
    .select(
      "id, empresa_id, nome_conexao, numero, status, phone_number_id, waba_id, business_account_id, meta_business_id, verified_name, phone_number_display_name, phone_number_status, quality_rating, meta_messaging_limit_tier, meta_messaging_limit, meta_account_mode, meta_saude_ultima_verificacao_em, setup_completed_at, onboarding_status, onboarding_erro, modo_integracao, coex_status, posicao, config_json, token_ref"
    )
    .eq("empresa_id", empresaId)
    .eq("provider", "meta_official")
    .order("posicao", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (integracaoId) {
    query = query.eq("id", integracaoId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Erro ao buscar integrações do WhatsApp.");
  }

  return (data || []) as IntegracaoWhatsapp[];
}

async function buscarAdministradorEmpresa(empresaId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, email, created_at")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[WHATSAPP PERFIL ADMIN ERROR]", error);
    return null;
  }

  return data
    ? {
        id: data.id,
        nome: data.nome || data.email || "Administrador",
        email: data.email || null,
      }
    : null;
}

type PhoneInfoMeta = {
  verified_name?: string;
  display_phone_number?: string;
  status?: string;
  name_status?: string;
  new_name_status?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  account_mode?: string;
};

type BusinessProfileMeta = {
  about?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  websites?: string[] | null;
  vertical?: string | null;
};

type BusinessProfileUpdate = {
  about: string;
  address: string;
  description: string;
  email: string;
  websites: string[];
  vertical: string;
};

class MetaApiError extends Error {
  status: number;
  meta: unknown;

  constructor(message: string, status = 400, meta: unknown = null) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.meta = meta;
  }
}

function isMetaApiError(error: unknown): error is MetaApiError {
  return error instanceof MetaApiError;
}

function isErroMetaTemporario(body: MetaErrorBody) {
  const message = body?.error?.message?.trim().toLowerCase();
  const code = Number(body?.error?.code);

  return code === 131000 && Boolean(message?.includes("something went wrong"));
}

function normalizarTextoPerfil(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarWebsitesPerfil(valor: unknown) {
  return Array.isArray(valor)
    ? valor
        .map((item) => normalizarTextoPerfil(item))
        .filter(Boolean)
    : [];
}

function perfilMetaCorrespondeAoPayload(
  perfil: BusinessProfileMeta,
  payload: BusinessProfileUpdate
) {
  return (
    normalizarTextoPerfil(perfil.about) === payload.about &&
    normalizarTextoPerfil(perfil.address) === payload.address &&
    normalizarTextoPerfil(perfil.description) === payload.description &&
    normalizarTextoPerfil(perfil.email) === payload.email &&
    normalizarTextoPerfil(perfil.vertical) === payload.vertical &&
    JSON.stringify(normalizarWebsitesPerfil(perfil.websites)) ===
      JSON.stringify(payload.websites)
  );
}

function extrairMensagemMeta(body: MetaErrorBody, fallback: string) {
  const message = body?.error?.message?.trim();
  const details = body?.error?.error_data?.details?.trim();
  const fallbackLower = fallback.toLowerCase();

  if (message?.includes("Param websites")) {
    return "Um dos sites informados não é válido. Use uma URL completa começando com https:// ou http://.";
  }

  if (Number(body?.error?.code) === 100) {
    return (
      details ||
      fallback ||
      "A Meta recusou algum parâmetro enviado. Revise os dados do perfil e tente novamente."
    );
  }
  
  if (
    isErroMetaTemporario(body) &&
    (fallbackLower.includes("upload") || fallbackLower.includes("foto"))
  ) {
    return "A Meta recusou o upload da foto. Verifique se META_APP_ID é o App ID correto do aplicativo usado no Embedded Signup e tente novamente com uma imagem PNG ou JPG de até 5 MB.";
  }

  if (isErroMetaTemporario(body)) {
    return "A Meta retornou um erro temporario ao confirmar o perfil. A foto pode levar alguns segundos para aparecer no WhatsApp.";
  }

  if (message && details && !message.includes(details)) {
    return `${message} ${details}`;
  }

  return message || details || fallback;
}

function objetoConfig(configJson: ConfigJson) {
  return configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? configJson
    : {};
}

function normalizarStatusIntegracaoWhatsapp(valor?: string | null) {
  const status = String(valor || "").trim().toLowerCase();
  return ["pendente", "ativa", "erro", "desconectada"].includes(status)
    ? status
    : null;
}

function montarIntegracaoResposta(
  integracao: IntegracaoWhatsapp,
  overrides: Partial<IntegracaoWhatsapp> & {
    display_phone_number?: string | null;
    name_status?: string | null;
    new_name_status?: string | null;
  } = {}
) {
  return {
    id: integracao.id,
    nome_conexao: integracao.nome_conexao,
    numero: overrides.numero ?? integracao.numero,
    status: overrides.status ?? integracao.status,
    phone_number_id: integracao.phone_number_id,
    verified_name: overrides.verified_name ?? integracao.verified_name,
    phone_number_display_name:
      overrides.phone_number_display_name ??
      integracao.phone_number_display_name,
    display_phone_number:
      overrides.display_phone_number ?? integracao.numero,
    name_status:
      overrides.name_status ??
      overrides.phone_number_status ??
      integracao.phone_number_status ??
      null,
    new_name_status: overrides.new_name_status ?? null,
    phone_number_status:
      overrides.phone_number_status ?? integracao.phone_number_status ?? null,
    quality_rating: overrides.quality_rating ?? integracao.quality_rating ?? null,
    meta_messaging_limit_tier:
      overrides.meta_messaging_limit_tier ??
      integracao.meta_messaging_limit_tier ??
      null,
    meta_messaging_limit:
      overrides.meta_messaging_limit ?? integracao.meta_messaging_limit ?? null,
    meta_account_mode:
      overrides.meta_account_mode ?? integracao.meta_account_mode ?? null,
    meta_saude_ultima_verificacao_em:
      overrides.meta_saude_ultima_verificacao_em ??
      integracao.meta_saude_ultima_verificacao_em ??
      null,
    setup_completed_at:
      overrides.setup_completed_at ?? integracao.setup_completed_at ?? null,
    onboarding_status:
      overrides.onboarding_status ?? integracao.onboarding_status ?? null,
    onboarding_erro:
      overrides.onboarding_erro ?? integracao.onboarding_erro ?? null,
    modo_integracao:
      overrides.modo_integracao ?? integracao.modo_integracao ?? "cloud_api",
    coex_status:
      overrides.coex_status ?? integracao.coex_status ?? null,
    posicao: overrides.posicao ?? integracao.posicao ?? null,
  };
}

async function marcarIntegracaoComDiagnosticoMeta(params: {
  integracao: IntegracaoWhatsapp;
  empresaId: string;
  diagnostico: WhatsAppMetaErrorDiagnostic;
  metaResponse: unknown;
}) {
  const { integracao, empresaId, diagnostico, metaResponse } = params;
  const supabase = await createClient();
  const agora = new Date().toISOString();
  const configAtual = objetoConfig(integracao.config_json);

  const payload: Record<string, unknown> = {
    onboarding_status: "erro",
    onboarding_erro: diagnostico.descricao,
    ultimo_sync_at: agora,
    updated_at: agora,
    config_json: {
      ...configAtual,
      whatsapp_meta_diagnostic: diagnostico,
      whatsapp_last_meta_error: metaResponse,
      whatsapp_last_meta_error_at: agora,
    },
  };

  const statusIntegracao = normalizarStatusIntegracaoWhatsapp(
    diagnostico.statusIntegracao
  );

  if (statusIntegracao) {
    payload.status = statusIntegracao;
  }

  if (diagnostico.statusNumeroMeta) {
    payload.phone_number_status = diagnostico.statusNumeroMeta;
  }

  const { error } = await supabase
    .from("integracoes_whatsapp")
    .update(payload)
    .eq("id", integracao.id)
    .eq("empresa_id", empresaId);

  if (error) {
    console.warn("[WHATSAPP PERFIL DIAGNOSTICO UPDATE ERROR]", error);
  }

  if (diagnostico.motivo === "business_account_locked") {
    await aplicarBloqueioOperacionalWhatsappMeta({
      empresaId,
      integracaoId: integracao.id,
      motivo: diagnostico.descricao,
    });
  }
}

async function marcarIntegracaoRecuperadaSeNecessario(params: {
  integracao: IntegracaoWhatsapp;
  empresaId: string;
  phoneJson: PhoneInfoMeta | null;
}) {
  const { integracao, empresaId, phoneJson } = params;
  const configAtual = objetoConfig(integracao.config_json);
  const diagnosticoAnterior = configAtual.whatsapp_meta_diagnostic;

  const eraBloqueioMeta =
    diagnosticoAnterior &&
    typeof diagnosticoAnterior === "object" &&
    "motivo" in diagnosticoAnterior &&
    diagnosticoAnterior.motivo === "business_account_locked";

  const phoneNumberStatus =
    phoneJson?.status || phoneJson?.name_status || null;
  const statusNormalizado = String(phoneNumberStatus || "").toLowerCase();

  if (
    !["bloqueado", "erro"].includes(integracao.status) ||
    !eraBloqueioMeta ||
    !phoneJson ||
    ["banned", "banido", "blocked", "bloqueado", "restricted"].includes(
      statusNormalizado
    )
  ) {
    return null;
  }

  const supabase = await createClient();
  const agora = new Date().toISOString();

  const payload = {
    status: "ativa",
    onboarding_status: "concluido",
    onboarding_erro: null,
    phone_number_status: phoneNumberStatus,
    ultimo_sync_at: agora,
    updated_at: agora,
    config_json: {
      ...configAtual,
      whatsapp_meta_diagnostic: null,
      whatsapp_meta_recovered_at: agora,
    },
  };

  const { error } = await supabase
    .from("integracoes_whatsapp")
    .update(payload)
    .eq("id", integracao.id)
    .eq("empresa_id", empresaId);

  if (error) {
    console.warn("[WHATSAPP PERFIL RECOVERY UPDATE ERROR]", error);
    return null;
  }

  return {
    status: "ativa",
    onboarding_status: "concluido",
    onboarding_erro: null,
    phone_number_status: phoneNumberStatus,
  };
}

async function salvarSaudeMetaIntegracao(params: {
  integracao: IntegracaoWhatsapp;
  empresaId: string;
  phoneJson: PhoneInfoMeta | null;
}) {
  const { integracao, empresaId, phoneJson } = params;

  if (!phoneJson) {
    return null;
  }

  const supabase = await createClient();
  const agora = new Date().toISOString();
  const configAtual = objetoConfig(integracao.config_json);
  const phoneNumberStatus =
    phoneJson.status ||
    phoneJson.name_status ||
    integracao.phone_number_status ||
    null;
  const messagingLimitTier =
    phoneJson.messaging_limit_tier ||
    integracao.meta_messaging_limit_tier ||
    null;
  const messagingLimit =
    resolverLimitePorTier(messagingLimitTier) ||
    integracao.meta_messaging_limit ||
    null;
  const accountMode =
    phoneJson.account_mode || integracao.meta_account_mode || null;

  const overrides: Partial<IntegracaoWhatsapp> = {
    phone_number_status: phoneNumberStatus,
    quality_rating: phoneJson.quality_rating || integracao.quality_rating,
    meta_messaging_limit_tier: messagingLimitTier,
    meta_messaging_limit: messagingLimit,
    meta_account_mode: accountMode,
    meta_saude_ultima_verificacao_em: agora,
  };

  const payload = {
    phone_number_status: phoneNumberStatus,
    quality_rating: overrides.quality_rating,
    meta_messaging_limit_tier: messagingLimitTier,
    meta_messaging_limit: messagingLimit,
    meta_account_mode: accountMode,
    meta_saude_ultima_verificacao_em: agora,
    ultimo_sync_at: agora,
    updated_at: agora,
    config_json: {
      ...configAtual,
      whatsapp_meta_health: {
        phone_number_status: phoneNumberStatus,
        quality_rating: overrides.quality_rating,
        messaging_limit_tier: messagingLimitTier,
        messaging_limit: messagingLimit,
        account_mode: accountMode,
        checked_at: agora,
        raw: phoneJson,
      },
    },
  };

  const { error } = await supabase
    .from("integracoes_whatsapp")
    .update(payload)
    .eq("id", integracao.id)
    .eq("empresa_id", empresaId);

  if (error) {
    console.warn("[WHATSAPP PERFIL SAUDE UPDATE ERROR]", error);
  }

  const { error: historicoError } = await supabaseAdmin
    .from("whatsapp_meta_saude_historico")
    .insert({
      empresa_id: empresaId,
      integracao_whatsapp_id: integracao.id,
      phone_number_id: integracao.phone_number_id,
      phone_number_status: phoneNumberStatus,
      quality_rating: overrides.quality_rating,
      messaging_limit_tier: messagingLimitTier,
      messaging_limit: messagingLimit,
      account_mode: accountMode,
      raw_json: phoneJson,
    });

  if (historicoError) {
    console.warn("[WHATSAPP PERFIL SAUDE HISTORICO ERROR]", historicoError);
  }

  return overrides;
}

function isFotoPerfilValida(file: File) {
  return PROFILE_PHOTO_TYPES.has(file.type) && file.size <= MAX_PROFILE_PHOTO_BYTES;
}

function resolverAppIdPerfil(integracao: IntegracaoWhatsapp) {
  const appId =
    process.env.META_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() ||
    "";

  if (!appId) {
    return {
      ok: false as const,
      error:
        "META_APP_ID não configurado no .env. Ele é necessário para atualizar a foto.",
    };
  }

  const idsDaConta = [
    integracao.phone_number_id,
    integracao.waba_id,
    integracao.business_account_id,
    integracao.meta_business_id,
  ].filter(Boolean);

  if (idsDaConta.includes(appId)) {
    return {
      ok: false as const,
      error:
        "META_APP_ID parece estar configurado com o ID do número, WABA ou Business. Configure com o App ID da Meta usado no Embedded Signup.",
    };
  }

  return { ok: true as const, appId };
}

export async function GET(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();
    console.log("[PERFIL] CONTEXTO:", contexto);
    console.log("[PERFIL] EMPRESA:", contexto.ok ? contexto.usuario.empresa_id : null);

    if (!contexto.ok) {
      return jsonErro(contexto.error, contexto.status);
    }

    const empresaId = contexto.usuario.empresa_id;

    if (!empresaId) {
      return jsonErro("Usuário sem empresa vinculada.", 403);
    }

    const [limiteIntegracoesWhatsapp, todasIntegracoesWhatsapp] =
      await Promise.all([
        obterLimiteIntegracoesWhatsapp(empresaId),
        listarIntegracoesWhatsappDaEmpresa(empresaId),
      ]);
    const proximaPosicaoIntegracao = calcularProximaPosicaoLivre(
      todasIntegracoesWhatsapp,
      limiteIntegracoesWhatsapp
    );

    const { searchParams } = new URL(req.url);
    const integracaoId = searchParams.get("integracao_id");

    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario: contexto.usuario,
      empresaId,
    });
    const idsIntegracoesPermitidas = new Set(acessoIntegracoes.idsPermitidos);
    const integracoes = (await buscarIntegracao(empresaId, null)).filter(
      (item) => idsIntegracoesPermitidas.has(item.id)
    );

    if (integracaoId && !idsIntegracoesPermitidas.has(integracaoId)) {
      return jsonErro("Sem acesso a esta integraÃ§Ã£o WhatsApp.", 403);
    }

    const integracaoSelecionada =
      integracoes.find((item) => item.id === integracaoId) ||
      integracoes.find((item) =>
        isWhatsAppProfileMetaAvailable(item)
      ) ||
      integracoes[0] ||
      null;

    if (!integracaoSelecionada) {
      return NextResponse.json({
        ok: true,
        onboarding_incompleto: true,
        onboarding_redirect: "/configurar-ambiente",
        message:
          "Conclua a configuração do WhatsApp para liberar o perfil.",
        integracoes: [],
        integracao: null,
        limite_integracoes_whatsapp: limiteIntegracoesWhatsapp,
        total_integracoes_whatsapp: todasIntegracoesWhatsapp.length,
        proxima_posicao: proximaPosicaoIntegracao,
        pode_cadastrar_nova: Boolean(proximaPosicaoIntegracao),
        administrador: await buscarAdministradorEmpresa(empresaId),
        limite_meta: null,
        perfil: null,
      });
    }

    if (!isWhatsAppProfileMetaAvailable(integracaoSelecionada)) {
      return NextResponse.json({
        ok: true,
        onboarding_incompleto: true,
        onboarding_redirect: "/configurar-ambiente",
        message:
          "Esta conexão ainda não concluiu o onboarding do WhatsApp.",
        integracoes: integracoes.map((item) =>
          montarIntegracaoResposta(item)
        ),
        integracao: montarIntegracaoResposta(integracaoSelecionada),
        limite_integracoes_whatsapp: limiteIntegracoesWhatsapp,
        total_integracoes_whatsapp: todasIntegracoesWhatsapp.length,
        proxima_posicao: proximaPosicaoIntegracao,
        pode_cadastrar_nova: Boolean(proximaPosicaoIntegracao),
        administrador: await buscarAdministradorEmpresa(empresaId),
        limite_meta: null,
        perfil: null,
      });
    }

    if (!integracaoSelecionada.phone_number_id) {
      return jsonErro("Essa integração não possui phone_number_id.", 400);
    }

    const token = extrairToken(integracaoSelecionada)

    if (!token) {
      return jsonErro(
        "Token da Meta não encontrado no config_json da integração.",
        400
      );
    }

    const fields =
      "about,address,description,email,profile_picture_url,websites,vertical";

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracaoSelecionada.phone_number_id}/whatsapp_business_profile?fields=${encodeURIComponent(
        fields
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      const diagnostico = diagnosticarErroMetaWhatsapp(
        metaJson,
        "Erro ao buscar perfil no Meta."
      );

      if (diagnostico.bloqueiaOperacao) {
        await marcarIntegracaoComDiagnosticoMeta({
          integracao: integracaoSelecionada,
          empresaId,
          diagnostico,
          metaResponse: metaJson,
        });

        const overridesBloqueio = {
          status: diagnostico.statusIntegracao || integracaoSelecionada.status,
          phone_number_status:
            diagnostico.statusNumeroMeta ||
            integracaoSelecionada.phone_number_status,
          onboarding_erro: diagnostico.descricao,
        };

        return NextResponse.json({
          ok: true,
          blocked: true,
          diagnostico,
          meta: metaJson,
          integracoes: integracoes.map((item) =>
            item.id === integracaoSelecionada.id
              ? montarIntegracaoResposta(item, overridesBloqueio)
              : montarIntegracaoResposta(item)
          ),
          integracao: montarIntegracaoResposta(
            integracaoSelecionada,
            overridesBloqueio
          ),
          limite_integracoes_whatsapp: limiteIntegracoesWhatsapp,
          total_integracoes_whatsapp: todasIntegracoesWhatsapp.length,
          proxima_posicao: proximaPosicaoIntegracao,
          pode_cadastrar_nova: Boolean(proximaPosicaoIntegracao),
          perfil: null,
        });
      }

      return jsonErro(
        extrairMensagemMeta(metaJson, "Erro ao buscar perfil no Meta."),
        metaRes.status,
        metaJson
      );
    }

    const perfil = Array.isArray(metaJson?.data) ? metaJson.data[0] : metaJson;

    let phoneJson: PhoneInfoMeta | null = null;

    const phoneRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracaoSelecionada.phone_number_id}?fields=verified_name,display_phone_number,status,name_status,new_name_status,quality_rating,messaging_limit_tier,account_mode`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    phoneJson = (await phoneRes.json()) as PhoneInfoMeta;

    if (!phoneRes.ok) {
      console.warn("[WHATSAPP PHONE INFO ERROR]", phoneJson);
      phoneJson = null;
    }

    const saudeOverrides = await salvarSaudeMetaIntegracao({
      integracao: integracaoSelecionada,
      empresaId,
      phoneJson,
    });

    const recuperacaoOverrides = await marcarIntegracaoRecuperadaSeNecessario({
      integracao: integracaoSelecionada,
      empresaId,
      phoneJson,
    });

    const overridesResposta = {
      ...(saudeOverrides || {}),
      ...(recuperacaoOverrides || {}),
      verified_name:
        phoneJson?.verified_name ||
        integracaoSelecionada.verified_name ||
        null,
      phone_number_display_name:
        phoneJson?.verified_name ||
        integracaoSelecionada.phone_number_display_name ||
        null,
      display_phone_number:
        phoneJson?.display_phone_number || integracaoSelecionada.numero,
      name_status: phoneJson?.name_status || null,
      new_name_status: phoneJson?.new_name_status || null,
      phone_number_status:
        phoneJson?.status ||
        phoneJson?.name_status ||
        recuperacaoOverrides?.phone_number_status ||
        saudeOverrides?.phone_number_status ||
        integracaoSelecionada.phone_number_status,
      quality_rating:
        phoneJson?.quality_rating ||
        saudeOverrides?.quality_rating ||
        integracaoSelecionada.quality_rating,
    };

    const integracaoResumoLimite = {
      ...integracaoSelecionada,
      ...overridesResposta,
    };
    const limiteMeta = await obterResumoLimiteMeta({
      empresaId,
      integracao: integracaoResumoLimite,
    });

    const administrador = await buscarAdministradorEmpresa(empresaId);

    return NextResponse.json({
      ok: true,
      diagnostico: null,
      integracoes: integracoes.map((item) =>
        item.id === integracaoSelecionada.id
          ? montarIntegracaoResposta(item, overridesResposta)
          : montarIntegracaoResposta(item)
      ),
      integracao: montarIntegracaoResposta(
        integracaoSelecionada,
        overridesResposta
      ),
      limite_integracoes_whatsapp: limiteIntegracoesWhatsapp,
      total_integracoes_whatsapp: todasIntegracoesWhatsapp.length,
      proxima_posicao: proximaPosicaoIntegracao,
      pode_cadastrar_nova: Boolean(proximaPosicaoIntegracao),
      administrador,
      limite_meta: limiteMeta,
      perfil,
    });
  } catch (error: unknown) {
    console.error("[WHATSAPP PERFIL GET ERROR]", error);
    return jsonErro(
      error instanceof Error ? error.message : "Erro interno ao buscar perfil.",
      500
    );
  }
}

async function uploadFotoPerfil(params: {
  appId: string;
  token: string;
  file: File;
}) {
  const { appId, token, file } = params;

  if (!isFotoPerfilValida(file)) {
    throw new MetaApiError(
      "A foto precisa ser PNG ou JPG e ter no máximo 5 MB.",
      400,
      null
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const sessionUrl = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${appId}/uploads`
  );
  sessionUrl.searchParams.set("file_length", String(buffer.length));
  sessionUrl.searchParams.set("file_type", file.type);
  sessionUrl.searchParams.set("file_name", file.name);

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const sessionJson = await sessionRes.json();

  if (!sessionRes.ok || !sessionJson?.id) {
    const sessionErrorMessage = extrairMensagemMeta(
      sessionJson,
      "Erro ao criar sessão de upload da foto no Meta."
    );

    if (sessionJson && typeof sessionJson === "object") {
      sessionJson.error = {
        ...(sessionJson.error || {}),
        message: sessionErrorMessage,
      };
    }

    if (sessionErrorMessage) {
      throw new MetaApiError(sessionErrorMessage, sessionRes.status, sessionJson);
    }

    throw new MetaApiError(
      sessionJson?.error?.message || "Erro ao criar sessão de upload da foto."
    );
  }

  const uploadRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${sessionJson.id}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    }
  );

  const uploadJson = await uploadRes.json();

  if (!uploadRes.ok || !uploadJson?.h) {
    const uploadErrorMessage = extrairMensagemMeta(
      uploadJson,
      "Erro ao enviar foto para o Meta."
    );

    if (uploadJson && typeof uploadJson === "object") {
      uploadJson.error = {
        ...(uploadJson.error || {}),
        message: uploadErrorMessage,
      };
    }

    if (uploadErrorMessage) {
      throw new MetaApiError(uploadErrorMessage, uploadRes.status, uploadJson);
    }

    throw new MetaApiError(
      uploadJson?.error?.message || "Erro ao enviar foto para o Meta."
    );
  }

  return uploadJson.h as string;
}

async function marcarIntegracaoSincronizada(
  integracaoId: string,
  empresaId: string
) {
  const supabase = await createClient();

  await supabase
    .from("integracoes_whatsapp")
    .update({
      ultimo_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integracaoId)
    .eq("empresa_id", empresaId);
}

async function confirmarAtualizacaoPerfil(params: {
  phoneNumberId: string;
  token: string;
  payload: BusinessProfileUpdate;
}) {
  const { phoneNumberId, token, payload } = params;
  const fields = "about,address,description,email,websites,vertical";

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/whatsapp_business_profile?fields=${encodeURIComponent(
        fields
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      console.warn(
        "[WHATSAPP PERFIL PATCH CONFIRMATION ERROR]",
        metaJson
      );
      return false;
    }

    const perfil = Array.isArray(metaJson?.data)
      ? metaJson.data[0]
      : metaJson;

    return Boolean(
      perfil &&
        perfilMetaCorrespondeAoPayload(
          perfil as BusinessProfileMeta,
          payload
        )
    );
  } catch (error) {
    console.warn("[WHATSAPP PERFIL PATCH CONFIRMATION ERROR]", error);
    return false;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return jsonErro(contexto.error, contexto.status);
    }

    const empresaId = contexto.usuario.empresa_id;

    if (!empresaId) {
      return jsonErro("Usuário sem empresa vinculada.", 403);
    }

    const formData = await req.formData();

    const integracaoId = String(formData.get("integracao_id") || "");
    const about = String(formData.get("about") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const website1 = String(formData.get("website1") || "").trim();
    const website2 = String(formData.get("website2") || "").trim();
    const vertical = String(formData.get("vertical") || "").trim();
    const foto = formData.get("profile_picture");

    if (!integracaoId) {
      return jsonErro("Selecione uma integração.", 400);
    }

    const [integracao] = await buscarIntegracao(empresaId, integracaoId);

    if (!integracao) {
      return jsonErro("Integração não encontrada.", 404);
    }

    if (!isWhatsAppProfileMetaAvailable(integracao)) {
      return jsonErro(
        "Conclua o onboarding do WhatsApp antes de editar o perfil.",
        409,
        { onboarding_redirect: "/configurar-ambiente" }
      );
    }

    if (!integracao.phone_number_id) {
      return jsonErro("Essa integração não possui phone_number_id.", 400);
    }

    if (integracao.modo_integracao === "coexistence") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este número está conectado por coexistência. A Meta não permite que o CRM altere o perfil desse número por API. Ajuste o perfil diretamente no Gerenciador do WhatsApp da Meta ou no WhatsApp Business App.",
          requires_meta_profile_edit: true,
          meta_manager_url:
            "https://business.facebook.com/latest/whatsapp_manager/phone_numbers",
        },
        { status: 409 }
      );
    }

    const token = extrairToken(integracao);

    if (!token) {
      return jsonErro(
        "Token da Meta não encontrado no config_json da integração.",
        400
      );
    }

  const websitesBrutos = [website1, website2]
    .map((site) => site?.trim())
    .filter(Boolean) as string[];

  const siteInvalido = websitesBrutos.find((site) => {
    try {
      const url = new URL(site);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  });

  if (siteInvalido) {
    return NextResponse.json(
      {
        ok: false,
        error: `O site "${siteInvalido}" não é válido. Informe uma URL completa começando com https:// ou http://.`,
      },
      { status: 400 }
    );
  }

  const websites = websitesBrutos;

  const dadosPerfil: BusinessProfileUpdate = {
    about,
    address,
    description,
    email,
    websites,
    vertical,
  };

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    about: about ?? "",
    address: address ?? "",
    description: description ?? "",
    email: email ?? "",
    websites,
  };

  if (vertical) {
    payload.vertical = vertical;
  }

    let atualizacaoComFoto = false;

    if (foto instanceof File && foto.size > 0) {
      const appIdResult = resolverAppIdPerfil(integracao);
      if (!appIdResult.ok) {
        return jsonErro(appIdResult.error, 400);
      }

      const appId = appIdResult.appId;

      if (!appId) {
        return jsonErro(
          "META_APP_ID não configurado no .env. Ele é necessário para atualizar a foto.",
          400
        );
      }

      const handle = await uploadFotoPerfil({
        appId,
        token,
        file: foto,
      });

      payload.profile_picture_handle = handle;
      atualizacaoComFoto = true;
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracao.phone_number_id}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      console.warn("[WHATSAPP PERFIL PATCH META ERROR]", {
        status: metaRes.status,
        payload,
        metaJson,
      });
      if (isErroMetaTemporario(metaJson)) {
        console.warn("[WHATSAPP PERFIL PATCH META TEMPORARY ERROR]", metaJson);

        if (atualizacaoComFoto) {
          await marcarIntegracaoSincronizada(integracao.id, empresaId);

          return NextResponse.json(
            {
              ok: true,
              pending: true,
              message:
                "A Meta recebeu a foto. A imagem pode levar alguns segundos para aparecer no WhatsApp.",
              meta: metaJson,
            },
            { status: 202 }
          );
        }

        const atualizacaoConfirmada = await confirmarAtualizacaoPerfil({
          phoneNumberId: integracao.phone_number_id,
          token,
          payload: dadosPerfil,
        });

        if (atualizacaoConfirmada) {
          await marcarIntegracaoSincronizada(integracao.id, empresaId);

          return NextResponse.json({
            ok: true,
            message:
              "Perfil atualizado com sucesso.",
            meta: metaJson,
            confirmed_after_temporary_error: true,
          });
        }

        return jsonErro(
          "A Meta retornou um erro temporário ao atualizar o perfil. Tente novamente em alguns instantes.",
          503,
          metaJson
        );
      }

      const diagnostico = diagnosticarErroMetaWhatsapp(
        metaJson,
        "Erro ao atualizar perfil no Meta."
      );

      if (diagnostico.bloqueiaOperacao) {
        await marcarIntegracaoComDiagnosticoMeta({
          integracao,
          empresaId,
          diagnostico,
          metaResponse: metaJson,
        });

        return NextResponse.json(
          {
            ok: false,
            error: diagnostico.descricao,
            diagnostico,
            meta: metaJson,
          },
          { status: metaRes.status }
        );
      }

      return jsonErro(
        extrairMensagemMeta(metaJson, "Erro ao atualizar perfil no Meta."),
        metaRes.status,
        metaJson
      );
    }

    await marcarIntegracaoSincronizada(integracao.id, empresaId);

    return NextResponse.json({
      ok: true,
      message: "Perfil atualizado com sucesso.",
      meta: metaJson,
    });
  } catch (error: unknown) {
    console.error("[WHATSAPP PERFIL PATCH ERROR]", error);
    if (isMetaApiError(error)) {
      return jsonErro(error.message, error.status, error.meta);
    }

    return jsonErro(
      error instanceof Error
        ? error.message
        : "Erro interno ao atualizar perfil.",
      500
    );
  }
}
