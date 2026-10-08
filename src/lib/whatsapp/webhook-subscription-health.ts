import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";

const supabase = getSupabaseAdmin();

export type IntegracaoWebhookHealth = {
  id: string;
  empresa_id: string;
  waba_id?: string | null;
  phone_number_id?: string | null;
  token_ref?: string | null;
  config_json?: Record<string, unknown> | null;
  webhook_callback_status?: string | null;
};

type ResultadoStatus =
  | "ativa"
  | "reparada"
  | "ausente"
  | "rota_incorreta"
  | "erro";

type Resultado = {
  ok: boolean;
  ativa: boolean;
  reparada: boolean;
  status: ResultadoStatus;
  callbackStatus: string | null;
  overrideCallbackUri: string | null;
  error: string | null;
};

type AssinaturaInfo = {
  inscrita: boolean;
  overrideCallbackUri: string | null;
};

function objeto(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function texto(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function meta(
  method: "GET" | "POST",
  wabaId: string,
  accessToken: string
) {
  const response = await fetch(
    getWhatsAppGraphUrl(`${wabaId}/subscribed_apps`),
    {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

function assinaturaDoApp(payload: unknown, appId: string): AssinaturaInfo {
  const root = objeto(payload);
  const rows = Array.isArray(root.data) ? root.data : [];

  for (const item of rows) {
    const row = objeto(item);
    const api = objeto(row.whatsapp_business_api_data);
    const application = objeto(row.application);
    const ids = [row.id, row.app_id, api.id, api.app_id, application.id]
      .map(texto)
      .filter(Boolean);

    if (ids.includes(appId)) {
      return {
        inscrita: true,
        overrideCallbackUri:
          texto(row.override_callback_uri) ||
          texto(api.override_callback_uri) ||
          null,
      };
    }
  }

  return { inscrita: false, overrideCallbackUri: null };
}

function erroMeta(payload: unknown, fallback: string) {
  return texto(objeto(objeto(payload).error).message) || fallback;
}

async function salvar(params: {
  id: string;
  status: ResultadoStatus;
  ativa?: boolean;
  reparada?: boolean;
  callbackStatus?: string | null;
  callbackUri?: string | null;
  error?: string | null;
}) {
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    webhook_assinatura_status: params.status,
    webhook_assinatura_verificada_em: agora,
    webhook_assinatura_erro: params.error || null,
    updated_at: agora,
  };

  if (params.callbackStatus !== undefined) {
    patch.webhook_callback_status = params.callbackStatus;
    patch.webhook_callback_uri_detectada = params.callbackUri || null;
    patch.webhook_callback_verificada_em = agora;
  }

  if (typeof params.ativa === "boolean") {
    patch.webhook_verificado = params.ativa;
    patch.app_assigned = params.ativa;
  }

  if (params.reparada) {
    patch.webhook_assinatura_reparada_em = agora;
  }

  const { error } = await supabase
    .from("integracoes_whatsapp")
    .update(patch)
    .eq("id", params.id);

  if (error) {
    throw new Error(`Erro ao salvar health-check do webhook: ${error.message}`);
  }
}

function resultado(params: {
  ok: boolean;
  ativa: boolean;
  reparada: boolean;
  status: ResultadoStatus;
  callbackStatus?: string | null;
  overrideCallbackUri?: string | null;
  error?: string | null;
}): Resultado {
  return {
    ok: params.ok,
    ativa: params.ativa,
    reparada: params.reparada,
    status: params.status,
    callbackStatus: params.callbackStatus ?? null,
    overrideCallbackUri: params.overrideCallbackUri ?? null,
    error: params.error ?? null,
  };
}

export async function verificarAssinaturaWebhookIntegracao(
  integracao: IntegracaoWebhookHealth,
  options: { reparar?: boolean } = {}
): Promise<Resultado> {
  const appId = texto(process.env.META_APP_ID);
  const wabaId = texto(integracao.waba_id);
  const token = getWhatsAppAccessToken(integracao, {
    allowGlobalFallback: false,
  });

  if (!appId || !wabaId || !token) {
    const error = !appId
      ? "META_APP_ID não configurado."
      : !wabaId
        ? "WABA não informada na integração."
        : "Token da Meta não encontrado na integração.";
    await salvar({
      id: integracao.id,
      status: "erro",
      callbackStatus: "erro",
      error,
    });
    return resultado({
      ok: false,
      ativa: false,
      reparada: false,
      status: "erro",
      callbackStatus: "erro",
      error,
    });
  }

  const atual = await meta("GET", wabaId, token);
  if (!atual.ok) {
    const error = erroMeta(
      atual.data,
      `Meta retornou HTTP ${atual.status} ao consultar subscribed_apps.`
    );
    await salvar({
      id: integracao.id,
      status: "erro",
      callbackStatus: "erro",
      error,
    });
    return resultado({
      ok: false,
      ativa: false,
      reparada: false,
      status: "erro",
      callbackStatus: "erro",
      error,
    });
  }

  const assinaturaAtual = assinaturaDoApp(atual.data, appId);
  const possuiOverride = Boolean(assinaturaAtual.overrideCallbackUri);

  // A arquitetura do CRM usa um único callback configurado no App da Meta.
  // Qualquer override por WABA é removido para impedir que somente uma
  // integração fique "surda" enquanto o restante do aplicativo segue normal.
  // Na primeira verificação após esta evolução também fazemos um POST
  // idempotente para normalizar assinaturas antigas e registrar o estado.
  const rotaJaNormalizada =
    integracao.webhook_callback_status === "padrao_app";
  const precisaNormalizar =
    !assinaturaAtual.inscrita || possuiOverride || !rotaJaNormalizada;

  if (!precisaNormalizar) {
    await salvar({
      id: integracao.id,
      status: "ativa",
      ativa: true,
      callbackStatus: "padrao_app",
      callbackUri: null,
    });
    return resultado({
      ok: true,
      ativa: true,
      reparada: false,
      status: "ativa",
      callbackStatus: "padrao_app",
    });
  }

  if (options.reparar === false) {
    const error = !assinaturaAtual.inscrita
      ? "Aplicativo do CRM não está inscrito na WABA."
      : possuiOverride
        ? "A WABA está usando um callback alternativo em vez do callback padrão do CRM."
        : "A rota do webhook ainda não foi normalizada.";
    const status: ResultadoStatus = !assinaturaAtual.inscrita
      ? "ausente"
      : "rota_incorreta";

    await salvar({
      id: integracao.id,
      status,
      ativa: assinaturaAtual.inscrita,
      callbackStatus: possuiOverride ? "override_detectado" : "nao_normalizada",
      callbackUri: assinaturaAtual.overrideCallbackUri,
      error,
    });

    return resultado({
      ok: false,
      ativa: assinaturaAtual.inscrita,
      reparada: false,
      status,
      callbackStatus: possuiOverride ? "override_detectado" : "nao_normalizada",
      overrideCallbackUri: assinaturaAtual.overrideCallbackUri,
      error,
    });
  }

  // POST sem body é deliberado. Pela API da Meta ele (re)inscreve o app na
  // WABA e remove um override_callback_uri existente, voltando o campo
  // messages para o callback configurado no App Dashboard.
  const reparo = await meta("POST", wabaId, token);
  if (!reparo.ok) {
    const error = erroMeta(
      reparo.data,
      `Meta retornou HTTP ${reparo.status} ao normalizar subscribed_apps.`
    );
    await salvar({
      id: integracao.id,
      status: "erro",
      callbackStatus: possuiOverride ? "override_detectado" : "erro",
      callbackUri: assinaturaAtual.overrideCallbackUri,
      error,
    });
    return resultado({
      ok: false,
      ativa: assinaturaAtual.inscrita,
      reparada: false,
      status: "erro",
      callbackStatus: possuiOverride ? "override_detectado" : "erro",
      overrideCallbackUri: assinaturaAtual.overrideCallbackUri,
      error,
    });
  }

  const confirmacao = await meta("GET", wabaId, token);
  if (!confirmacao.ok) {
    const error = erroMeta(
      confirmacao.data,
      `Meta retornou HTTP ${confirmacao.status} ao confirmar a normalização do webhook.`
    );
    await salvar({
      id: integracao.id,
      status: "erro",
      callbackStatus: "verificacao_pendente",
      error,
    });
    return resultado({
      ok: false,
      ativa: true,
      reparada: true,
      status: "erro",
      callbackStatus: "verificacao_pendente",
      error,
    });
  }

  const assinaturaConfirmada = assinaturaDoApp(confirmacao.data, appId);

  if (assinaturaConfirmada.inscrita && !assinaturaConfirmada.overrideCallbackUri) {
    await salvar({
      id: integracao.id,
      status: "reparada",
      ativa: true,
      reparada: true,
      callbackStatus: "padrao_app",
      callbackUri: null,
    });
    return resultado({
      ok: true,
      ativa: true,
      reparada: true,
      status: "reparada",
      callbackStatus: "padrao_app",
    });
  }

  const error = !assinaturaConfirmada.inscrita
    ? "A Meta aceitou o reparo, mas o app não apareceu em subscribed_apps."
    : "A Meta aceitou o reparo, mas o callback alternativo permaneceu configurado.";

  await salvar({
    id: integracao.id,
    status: "erro",
    ativa: assinaturaConfirmada.inscrita,
    callbackStatus: assinaturaConfirmada.overrideCallbackUri
      ? "override_detectado"
      : "erro",
    callbackUri: assinaturaConfirmada.overrideCallbackUri,
    error,
  });

  return resultado({
    ok: false,
    ativa: assinaturaConfirmada.inscrita,
    reparada: false,
    status: "erro",
    callbackStatus: assinaturaConfirmada.overrideCallbackUri
      ? "override_detectado"
      : "erro",
    overrideCallbackUri: assinaturaConfirmada.overrideCallbackUri,
    error,
  });
}

export async function processarSaudeAssinaturasWhatsapp(params: {
  limite?: number;
  intervaloMinutos?: number;
} = {}) {
  const limite = Math.max(1, Math.min(20, Math.floor(params.limite || 5)));
  const intervalo = Math.max(
    5,
    Math.min(24 * 60, Math.floor(params.intervaloMinutos || 30))
  );
  const antesDe = new Date(Date.now() - intervalo * 60_000).toISOString();

  const { data, error } = await supabase
    .from("integracoes_whatsapp")
    .select(
      "id,empresa_id,waba_id,phone_number_id,token_ref,config_json,webhook_callback_status"
    )
    .eq("provider", "meta_official")
    .eq("status", "ativa")
    .not("waba_id", "is", null)
    .not("phone_number_id", "is", null)
    .or(
      `webhook_assinatura_verificada_em.is.null,webhook_assinatura_verificada_em.lt.${antesDe}`
    )
    .order("webhook_assinatura_verificada_em", {
      ascending: true,
      nullsFirst: false,
    })
    .limit(limite);

  if (error) {
    throw new Error(`Erro ao buscar health-checks do webhook: ${error.message}`);
  }

  const resumo = {
    verificadas: 0,
    reparadas: 0,
    ausentes: 0,
    rotasIncorretas: 0,
    falhas: 0,
    resultados: [] as Array<{
      integracaoId: string;
      status: Resultado["status"];
      callbackStatus: string | null;
      reparada: boolean;
      error: string | null;
    }>,
  };

  for (const integracao of (data || []) as IntegracaoWebhookHealth[]) {
    try {
      const health = await verificarAssinaturaWebhookIntegracao(integracao, {
        reparar: true,
      });
      resumo.verificadas += 1;
      if (health.reparada) resumo.reparadas += 1;
      if (health.status === "ausente") resumo.ausentes += 1;
      if (health.status === "rota_incorreta") resumo.rotasIncorretas += 1;
      if (!health.ok) resumo.falhas += 1;
      resumo.resultados.push({
        integracaoId: integracao.id,
        status: health.status,
        callbackStatus: health.callbackStatus,
        reparada: health.reparada,
        error: health.error,
      });
    } catch (healthError) {
      resumo.verificadas += 1;
      resumo.falhas += 1;
      resumo.resultados.push({
        integracaoId: integracao.id,
        status: "erro",
        callbackStatus: "erro",
        reparada: false,
        error:
          healthError instanceof Error
            ? healthError.message
            : "Erro desconhecido no health-check do webhook.",
      });
    }
  }

  return resumo;
}
