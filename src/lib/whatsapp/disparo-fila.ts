import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  aplicarBloqueioOperacionalWhatsappMeta,
  WHATSAPP_META_BLOCK_DESCRIPTION,
} from "@/lib/whatsapp/meta-block";
import {
  enviarTemplateDisparo,
  limparNumeroDisparo,
  type IntegracaoDisparo,
  type TemplateDisparo,
  type TemplatePayloadDisparo,
} from "@/lib/whatsapp/send-template-disparo";
import { notificarCampanhaDisparoPausada } from "@/lib/whatsapp/disparo-alertas";
import { qstash } from "@/lib/qstash/client";

const supabaseAdmin = getSupabaseAdmin();

type DisparoCampanhaRow = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  template_id: string;
  usuario_id: string | null;
  status: string;
  limite_meta_reserva_ids?: string[] | null;
  qstash_flow_control_key?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

type DisparoItemRow = {
  id: string;
  campanha_id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  template_id: string;
  usuario_id: string | null;
  numero: string;
  telefone_normalizado: string;
  nome_contato: string | null;
  variaveis: unknown;
  status: string;
  tentativas: number;
  max_tentativas: number;
  qstash_message_id?: string | null;
  qstash_publicado_at?: string | null;
  qstash_flow_control_key?: string | null;
  qstash_deduplication_id?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

type ItemPublicacaoQstash = {
  id: string;
  campanha_id: string;
  integracao_whatsapp_id: string;
};

type WebhookStatusUpdateParams = {
  messageId: string;
  statusNormalizado: string;
  erro?: string | null;
  erroCodigoMeta?: number | null;
  rawStatus?: unknown;
};

function normalizarInteiro(
  valor: number | string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numero)));
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizarVariaveis(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => String(item || ""));
}

function backoffSegundos(tentativas: number) {
  return Math.min(15 * Math.max(tentativas, 1), 5 * 60);
}

function obterBaseUrlAplicacao() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!host) {
    return "";
  }

  const base = host.startsWith("http") ? host : `https://${host}`;
  return base.replace(/\/$/, "");
}

export function obterUrlWorkerDisparoQstash() {
  const urlConfigurada =
    process.env.QSTASH_WHATSAPP_DISPARO_WORKER_URL ||
    process.env.WHATSAPP_DISPARO_QSTASH_WORKER_URL;

  if (urlConfigurada) {
    return urlConfigurada;
  }

  const base = obterBaseUrlAplicacao();
  return base ? `${base}/api/worker/whatsapp-disparo-item` : "";
}

export function obterFlowControlKeyDisparo(integracaoWhatsappId: string) {
  const prefixo =
    process.env.WHATSAPP_DISPARO_QSTASH_FLOW_PREFIX ||
    process.env.VERCEL_ENV ||
    "production";

  return `whatsapp-disparo:${prefixo}:${integracaoWhatsappId}`;
}

function obterConfigFlowControlDisparo() {
  const periodoRaw = String(
    process.env.WHATSAPP_DISPARO_QSTASH_PERIOD || "1m"
  ).trim();
  const periodoMatch = periodoRaw.match(/^(\d+)(s|m|h|d)?$/i);
  const periodoValor = periodoMatch ? Number(periodoMatch[1]) : 60;
  const unidade = String(periodoMatch?.[2] || "s").toLowerCase();
  const multiplicador =
    unidade === "d" ? 86400 : unidade === "h" ? 3600 : unidade === "m" ? 60 : 1;

  return {
    rate: normalizarInteiro(
      process.env.WHATSAPP_DISPARO_QSTASH_RATE,
      10,
      1,
      100
    ),
    period: Math.max(1, periodoValor * multiplicador),
    parallelism: normalizarInteiro(
      process.env.WHATSAPP_DISPARO_QSTASH_PARALLELISM,
      1,
      1,
      10
    ),
  };
}

function obterBatchQstash() {
  return normalizarInteiro(
    process.env.WHATSAPP_DISPARO_QSTASH_BATCH_SIZE,
    50,
    1,
    100
  );
}

function obterRetryQstash() {
  return normalizarInteiro(
    process.env.WHATSAPP_DISPARO_QSTASH_RETRIES,
    5,
    0,
    10
  );
}

function extrairMessageIdQstash(resultado: unknown) {
  const registro = objeto(resultado);
  const messageId = registro.messageId || registro.message_id;
  return String(messageId || "").trim() || null;
}

function labelCampanhaQstash(campanhaId: string) {
  return `whatsapp-disparo-campanha:${campanhaId}`;
}

function dedupItemQstash(itemId: string, tentativaPublicacao = 0) {
  return `whatsapp-disparo-item-${itemId}-${tentativaPublicacao}`;
}

async function atualizarPublicacaoItemQstash(params: {
  itemId: string;
  messageId: string | null;
  flowControlKey: string;
  deduplicationId: string;
  erro?: string | null;
}) {
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .update({
      qstash_message_id: params.messageId,
      qstash_publicado_at: params.messageId ? agora : null,
      qstash_flow_control_key: params.flowControlKey,
      qstash_deduplication_id: params.deduplicationId,
      qstash_erro: params.erro || null,
      updated_at: agora,
    })
    .eq("id", params.itemId);
}

async function atualizarResumoPublicacaoCampanha(params: {
  campanhaId: string;
  flowControlKey: string;
  publicados: number;
  erro?: string | null;
  modo?: "qstash" | "cron_fallback";
}) {
  const agora = new Date().toISOString();

  await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .update({
      processamento_modo: params.modo || "qstash",
      qstash_flow_control_key: params.flowControlKey,
      qstash_publicados: params.publicados,
      qstash_erro: params.erro || null,
      updated_at: agora,
    })
    .eq("id", params.campanhaId);
}

export async function publicarItensDisparoQstash(params: {
  campanhaId: string;
  integracaoWhatsappId: string;
  itens: ItemPublicacaoQstash[];
}) {
  const flowControlKey = obterFlowControlKeyDisparo(params.integracaoWhatsappId);
  const url = obterUrlWorkerDisparoQstash();
  const qstashToken = process.env.QSTASH_TOKEN;

  if (!qstashToken || !url) {
    const erro = !qstashToken
      ? "QSTASH_TOKEN ausente. Cron fallback fara a retomada."
      : "URL do worker QStash ausente. Cron fallback fara a retomada.";

    console.warn("[WHATSAPP DISPARO QSTASH]", {
      campanhaId: params.campanhaId,
      erro,
    });

    await atualizarResumoPublicacaoCampanha({
      campanhaId: params.campanhaId,
      flowControlKey,
      publicados: 0,
      erro,
      modo: "cron_fallback",
    });

    return {
      ok: false,
      publicados: 0,
      total: params.itens.length,
      flowControlKey,
      erro,
    };
  }

  const flowControl = obterConfigFlowControlDisparo();
  const tamanhoBatch = obterBatchQstash();
  const retries = obterRetryQstash();
  let publicados = 0;
  let ultimoErro: string | null = null;

  for (let inicio = 0; inicio < params.itens.length; inicio += tamanhoBatch) {
    const lote = params.itens.slice(inicio, inicio + tamanhoBatch);

    try {
      const requests = lote.map((item) => {
        const deduplicationId = dedupItemQstash(item.id);

        return {
          url,
          body: {
            itemId: item.id,
          },
          retries,
          retryDelay: "30000 * (1 + retried)",
          timeout: 60,
          deduplicationId,
          flowControl: {
            key: flowControlKey,
            rate: flowControl.rate,
            period: flowControl.period,
            parallelism: flowControl.parallelism,
          },
          label: labelCampanhaQstash(params.campanhaId),
        };
      });

      const resultados = await qstash.batchJSON(requests);

      for (const [index, resultado] of resultados.entries()) {
        const item = lote[index];
        const messageId = extrairMessageIdQstash(resultado);
        const deduplicationId = dedupItemQstash(item.id);

        if (messageId) {
          publicados += 1;
        }

        await atualizarPublicacaoItemQstash({
          itemId: item.id,
          messageId,
          flowControlKey,
          deduplicationId,
          erro: messageId ? null : "QStash nao retornou messageId.",
        });
      }
    } catch (error) {
      ultimoErro =
        error instanceof Error ? error.message : "Erro ao publicar no QStash.";
      console.error("[WHATSAPP DISPARO QSTASH] Erro ao publicar lote:", {
        campanhaId: params.campanhaId,
        inicio,
        quantidade: lote.length,
        erro: ultimoErro,
      });

      for (const item of lote) {
        await atualizarPublicacaoItemQstash({
          itemId: item.id,
          messageId: null,
          flowControlKey,
          deduplicationId: dedupItemQstash(item.id),
          erro: ultimoErro,
        });
      }
    }
  }

  await atualizarResumoPublicacaoCampanha({
    campanhaId: params.campanhaId,
    flowControlKey,
    publicados,
    erro: ultimoErro,
    modo: publicados > 0 ? "qstash" : "cron_fallback",
  });

  return {
    ok: publicados > 0,
    publicados,
    total: params.itens.length,
    flowControlKey,
    erro: ultimoErro,
  };
}

async function republicarItemDisparoQstash(params: {
  item: DisparoItemRow;
  delaySegundos: number;
}) {
  const url = obterUrlWorkerDisparoQstash();

  if (!process.env.QSTASH_TOKEN || !url) {
    return false;
  }

  const flowControlKey =
    params.item.qstash_flow_control_key ||
    obterFlowControlKeyDisparo(params.item.integracao_whatsapp_id);
  const flowControl = obterConfigFlowControlDisparo();
  const proximaTentativa = Number(params.item.tentativas || 0) + 1;
  const deduplicationId = dedupItemQstash(params.item.id, proximaTentativa);

  const resultado = await qstash.publishJSON({
    url,
    body: {
      itemId: params.item.id,
    },
    delay: params.delaySegundos,
    retries: obterRetryQstash(),
    retryDelay: "30000 * (1 + retried)",
    timeout: 60,
    deduplicationId,
    flowControl: {
      key: flowControlKey,
      rate: flowControl.rate,
      period: flowControl.period,
      parallelism: flowControl.parallelism,
    },
    label: labelCampanhaQstash(params.item.campanha_id),
  });

  await atualizarPublicacaoItemQstash({
    itemId: params.item.id,
    messageId: extrairMessageIdQstash(resultado),
    flowControlKey,
    deduplicationId,
  });

  return true;
}

async function cancelarMensagensCampanhaQstash(campanhaId: string) {
  if (!process.env.QSTASH_TOKEN) {
    return;
  }

  try {
    await qstash.messages.cancel({
      filter: {
        label: labelCampanhaQstash(campanhaId),
      },
      count: 1000,
    });
  } catch (error) {
    console.warn("[WHATSAPP DISPARO QSTASH] Erro ao cancelar campanha:", {
      campanhaId,
      erro: error,
    });
  }
}

async function pausarFlowControlIntegracaoQstash(integracaoWhatsappId: string) {
  if (!process.env.QSTASH_TOKEN) {
    return;
  }

  const flowControlKey = obterFlowControlKeyDisparo(integracaoWhatsappId);

  try {
    await qstash.flowControl.pause(flowControlKey);
  } catch (error) {
    console.warn("[WHATSAPP DISPARO QSTASH] Erro ao pausar flow control:", {
      flowControlKey,
      erro: error,
    });
  }
}

async function recalcularCampanha(campanhaId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "recalcular_whatsapp_disparo_campanha",
    {
      p_campanha_id: campanhaId,
    }
  );

  if (error) {
    console.error("[WHATSAPP DISPARO FILA] Erro ao recalcular campanha:", error);
    return null;
  }

  return Array.isArray(data) ? data[0] || null : data || null;
}

async function buscarCampanha(campanhaId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .select(
      "id, empresa_id, integracao_whatsapp_id, template_id, usuario_id, status, limite_meta_reserva_ids, qstash_flow_control_key, metadata_json"
    )
    .eq("id", campanhaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Campanha de disparo nao encontrada: ${error?.message || campanhaId}`
    );
  }

  return data as DisparoCampanhaRow;
}

async function buscarTemplate(templateId: string, empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("id, empresa_id, integracao_whatsapp_id, nome, idioma, status, payload")
    .eq("id", templateId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Template nao encontrado: ${error?.message || templateId}`);
  }

  if (String(data.status || "").toUpperCase() !== "APPROVED") {
    throw new Error("Template nao esta aprovado.");
  }

  return {
    id: data.id,
    nome: data.nome,
    idioma: data.idioma || null,
    payload: (data.payload || null) as TemplatePayloadDisparo | null,
  } satisfies TemplateDisparo;
}

async function buscarIntegracao(integracaoId: string, empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      "id, empresa_id, status, phone_number_status, onboarding_erro, phone_number_id, token_ref, config_json"
    )
    .eq("id", integracaoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Integracao WhatsApp nao encontrada: ${error?.message || integracaoId}`
    );
  }

  const status = String(data.status || "").toLowerCase();
  const phoneStatus = String(data.phone_number_status || "").toLowerCase();

  if (
    ["bloqueado", "banido", "blocked", "banned"].includes(status) ||
    ["blocked", "banned"].includes(phoneStatus)
  ) {
    throw new Error(
      data.onboarding_erro || WHATSAPP_META_BLOCK_DESCRIPTION
    );
  }

  return {
    id: data.id,
    phone_number_id: data.phone_number_id || null,
    token_ref: data.token_ref || null,
    config_json: objeto(data.config_json),
  } satisfies IntegracaoDisparo;
}

async function pausarCampanha(params: {
  campanhaId: string;
  empresaId: string;
  integracaoWhatsappId: string;
  status: string;
  motivo: string;
  erroCodigoMeta?: number | null;
}) {
  const agora = new Date().toISOString();

  const { data: campanhaPausada, error: pausaError } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .update({
      status: params.status,
      pausa_motivo: params.motivo,
      erro: params.motivo,
      paused_at: agora,
      updated_at: agora,
      metadata_json: {
        erro_codigo_meta: params.erroCodigoMeta || null,
        pausa_automatica: true,
      },
    })
    .eq("id", params.campanhaId)
    .eq("empresa_id", params.empresaId)
    .in("status", ["pendente", "enviando"])
    .select("id, usuario_id")
    .maybeSingle();

  if (pausaError) {
    console.error("[WHATSAPP DISPARO FILA] Erro ao pausar campanha:", {
      campanhaId: params.campanhaId,
      erro: pausaError,
    });
    return;
  }

  if (!campanhaPausada) {
    return;
  }

  await cancelarMensagensCampanhaQstash(params.campanhaId);

  await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .update({
      status: "pendente",
      locked_at: null,
      updated_at: agora,
      metadata_json: {
        motivo_liberacao: "campanha_pausada",
      },
    })
    .eq("campanha_id", params.campanhaId)
    .eq("status", "processando");

  if (params.status === "pausada_por_conta_bloqueada") {
    await pausarFlowControlIntegracaoQstash(params.integracaoWhatsappId);

    await supabaseAdmin
      .from("integracoes_whatsapp")
      .update({
        status: "erro",
        phone_number_status: "BANNED",
        onboarding_erro: params.motivo,
        updated_at: agora,
      })
      .eq("id", params.integracaoWhatsappId)
      .eq("empresa_id", params.empresaId);

    await aplicarBloqueioOperacionalWhatsappMeta({
      empresaId: params.empresaId,
      integracaoId: params.integracaoWhatsappId,
      motivo: params.motivo,
    });
  }

  await recalcularCampanha(params.campanhaId);

  await notificarCampanhaDisparoPausada({
    empresaId: params.empresaId,
    campanhaId: params.campanhaId,
    integracaoWhatsappId: params.integracaoWhatsappId,
    usuarioId: campanhaPausada.usuario_id || null,
    statusPausa: params.status,
    motivo: params.motivo,
    erroCodigoMeta: params.erroCodigoMeta || null,
  });
}

async function avaliarCircuitBreakerCampanha(params: {
  campanhaId: string;
  empresaId: string;
  integracaoWhatsappId: string;
  erroCodigoMeta?: number | null;
  erroMensagem?: string | null;
}) {
  const erroCodigo = params.erroCodigoMeta || null;
  const mensagem = params.erroMensagem || "Campanha pausada automaticamente.";

  if (erroCodigo === 131031) {
    await pausarCampanha({
      campanhaId: params.campanhaId,
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
      status: "pausada_por_conta_bloqueada",
      motivo:
        "A Meta bloqueou/desativou a conta WhatsApp Business durante o disparo.",
      erroCodigoMeta: erroCodigo,
    });
    return;
  }

  if (erroCodigo === 131042 || erroCodigo === 131049 || erroCodigo === 368) {
    await pausarCampanha({
      campanhaId: params.campanhaId,
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
      status: "pausada_por_erro_meta",
      motivo: mensagem,
      erroCodigoMeta: erroCodigo,
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .select("status, erro_codigo_meta")
    .eq("campanha_id", params.campanhaId)
    .in("status", ["enviado", "falha"])
    .order("processed_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error || !data || data.length < 50) {
    return;
  }

  const falhas = data.filter((item) => item.status === "falha");
  const falhasNumeroInvalido = falhas.filter(
    (item) => Number(item.erro_codigo_meta || 0) === 131026
  );

  if (falhasNumeroInvalido.length >= 10) {
    await pausarCampanha({
      campanhaId: params.campanhaId,
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
      status: "pausada_por_lista_invalida",
      motivo:
        "Campanha pausada porque a lista apresentou muitos numeros invalidos ou indisponiveis.",
      erroCodigoMeta: 131026,
    });
    return;
  }

  if (falhas.length >= 10) {
    await pausarCampanha({
      campanhaId: params.campanhaId,
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
      status: "pausada_por_falhas",
      motivo:
        "Campanha pausada automaticamente porque muitas mensagens falharam no ultimo lote.",
      erroCodigoMeta: erroCodigo,
    });
  }
}

async function atualizarItemComResultado(
  item: DisparoItemRow,
  resultado: Awaited<ReturnType<typeof enviarTemplateDisparo>>
) {
  const agora = new Date().toISOString();
  const metadataAtual = objeto(item.metadata_json);

  const { error } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .update({
      status: resultado.ok ? "enviado" : "falha",
      contato_id: resultado.contatoId,
      conversa_id: resultado.conversaId,
      conversa_protocolo_id: resultado.conversaProtocoloId,
      message_id: resultado.messageId,
      status_http: resultado.statusHttp,
      erro: resultado.erro,
      erro_codigo_meta: resultado.erroCodigoMeta,
      meta_response: resultado.metaResponse,
      locked_at: null,
      processed_at: agora,
      updated_at: agora,
      metadata_json: {
        ...metadataAtual,
        nome_contato_final: resultado.nomeContato,
        mensagem_template: resultado.mensagemTemplate,
      },
    })
    .eq("id", item.id);

  if (error) {
    throw new Error(`Erro ao atualizar item de disparo: ${error.message}`);
  }
}

async function reagendarItemComErro(item: DisparoItemRow, erro: string) {
  const agora = new Date();
  const tentativas = Number(item.tentativas || 0);
  const maxTentativas = Number(item.max_tentativas || 3);
  const metadataAtual = objeto(item.metadata_json);

  if (tentativas >= maxTentativas) {
    await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .update({
        status: "falha",
        erro,
        locked_at: null,
        processed_at: agora.toISOString(),
        updated_at: agora.toISOString(),
        metadata_json: {
          ...metadataAtual,
          falha_interna: true,
        },
      })
      .eq("id", item.id);

    return "falha";
  }

  const nextAttemptAt = new Date(
    agora.getTime() + backoffSegundos(tentativas) * 1000
  ).toISOString();

  await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .update({
      status: "pendente",
      erro,
      locked_at: null,
      next_attempt_at: nextAttemptAt,
      qstash_message_id: null,
      qstash_publicado_at: null,
      qstash_erro: null,
      updated_at: agora.toISOString(),
      metadata_json: {
        ...metadataAtual,
        retry_agendado_em: nextAttemptAt,
      },
    })
    .eq("id", item.id);

  return "reagendado";
}

async function processarItemDisparo(item: DisparoItemRow) {
  const campanha = await buscarCampanha(item.campanha_id);

  if (!["pendente", "enviando"].includes(campanha.status)) {
    await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .update({
        status: "pendente",
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    return { status: "ignorado" as const };
  }

  const [template, integracao] = await Promise.all([
    buscarTemplate(campanha.template_id, campanha.empresa_id),
    buscarIntegracao(campanha.integracao_whatsapp_id, campanha.empresa_id),
  ]);

  const resultado = await enviarTemplateDisparo({
    empresaId: item.empresa_id,
    integracaoWhatsappId: item.integracao_whatsapp_id,
    usuarioId: item.usuario_id || campanha.usuario_id,
    numero: item.numero,
    nomeContato: item.nome_contato,
    variaveis: normalizarVariaveis(item.variaveis),
    template,
    integracao,
    reservaIdsLimiteMeta: campanha.limite_meta_reserva_ids || [],
    campanhaId: campanha.id,
    itemId: item.id,
    origem: "disparo_template_fila",
  });

  await atualizarItemComResultado(item, resultado);
  await recalcularCampanha(campanha.id);

  if (!resultado.ok) {
    await avaliarCircuitBreakerCampanha({
      campanhaId: campanha.id,
      empresaId: campanha.empresa_id,
      integracaoWhatsappId: campanha.integracao_whatsapp_id,
      erroCodigoMeta: resultado.erroCodigoMeta,
      erroMensagem: resultado.erro,
    });
  }

  return { status: resultado.ok ? "enviado" as const : "falha" as const };
}

async function buscarItemDisparoStatus(itemId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .select("id, campanha_id, status, tentativas, max_tentativas")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar item de disparo: ${error.message}`);
  }

  return data || null;
}

export async function processarItemDisparoPorId(itemId: string) {
  const itemIdNormalizado = String(itemId || "").trim();

  if (!itemIdNormalizado) {
    return {
      ok: false,
      processado: false,
      status: "item_id_ausente",
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "reivindicar_whatsapp_disparo_item",
    {
      p_item_id: itemIdNormalizado,
    }
  );

  if (error) {
    throw new Error(`Erro ao reivindicar item de disparo: ${error.message}`);
  }

  const item = (Array.isArray(data) ? data[0] || null : data || null) as
    | DisparoItemRow
    | null;

  if (!item) {
    const atual = await buscarItemDisparoStatus(itemIdNormalizado);

    return {
      ok: true,
      processado: false,
      status: "ignorado",
      motivo: atual ? `status_atual_${atual.status}` : "item_nao_encontrado",
      itemId: itemIdNormalizado,
    };
  }

  try {
    const resultado = await processarItemDisparo(item);

    return {
      ok: true,
      processado: resultado.status !== "ignorado",
      status: resultado.status,
      itemId: item.id,
      campanhaId: item.campanha_id,
    };
  } catch (errorItem) {
    const erro =
      errorItem instanceof Error ? errorItem.message : "Erro desconhecido.";

    console.error("[WHATSAPP DISPARO QSTASH] Erro ao processar item:", {
      itemId: item.id,
      campanhaId: item.campanha_id,
      erro,
    });

    const status = await reagendarItemComErro(item, erro);
    await recalcularCampanha(item.campanha_id);

    if (status === "reagendado") {
      const delaySegundos = backoffSegundos(Number(item.tentativas || 1));
      const republicado = await republicarItemDisparoQstash({
        item,
        delaySegundos,
      });

      return {
        ok: true,
        processado: false,
        status,
        itemId: item.id,
        campanhaId: item.campanha_id,
        republicado,
        proximaTentativaEmSegundos: delaySegundos,
      };
    }

    return {
      ok: true,
      processado: true,
      status,
      itemId: item.id,
      campanhaId: item.campanha_id,
    };
  }
}

export async function processarFilaDisparosWhatsapp(params: {
  limite?: number;
  lockTimeoutMinutos?: number;
  apenasSemQstash?: boolean;
} = {}) {
  const limite = normalizarInteiro(
    params.limite ?? process.env.WHATSAPP_DISPARO_QUEUE_BATCH_LIMIT,
    10,
    1,
    50
  );
  const lockTimeoutMinutos = normalizarInteiro(
    params.lockTimeoutMinutos ??
      process.env.WHATSAPP_DISPARO_QUEUE_LOCK_TIMEOUT_MINUTES,
    5,
    1,
    60
  );

  const { data, error } = await supabaseAdmin.rpc(
    "reivindicar_whatsapp_disparo_itens",
    {
      p_limite: limite,
      p_lock_timeout_minutos: lockTimeoutMinutos,
      p_apenas_sem_qstash: params.apenasSemQstash || false,
    }
  );

  if (error) {
    throw new Error(`Erro ao buscar fila de disparos: ${error.message}`);
  }

  const itens = ((Array.isArray(data) ? data : []) || []) as DisparoItemRow[];
  let enviados = 0;
  let falhas = 0;
  let reagendados = 0;
  let ignorados = 0;

  for (const item of itens) {
    try {
      const resultado = await processarItemDisparo(item);

      if (resultado.status === "enviado") enviados += 1;
      if (resultado.status === "falha") falhas += 1;
      if (resultado.status === "ignorado") ignorados += 1;
    } catch (errorItem) {
      const erro =
        errorItem instanceof Error ? errorItem.message : "Erro desconhecido.";
      console.error("[WHATSAPP DISPARO FILA] Erro ao processar item:", {
        itemId: item.id,
        campanhaId: item.campanha_id,
        erro,
      });

      const status = await reagendarItemComErro(item, erro);
      if (status === "reagendado") reagendados += 1;
      if (status === "falha") falhas += 1;

      await recalcularCampanha(item.campanha_id);
    }
  }

  return {
    ok: true,
    buscados: itens.length,
    enviados,
    falhas,
    reagendados,
    ignorados,
    limite,
    lockTimeoutMinutos,
    apenasSemQstash: params.apenasSemQstash || false,
  };
}

export async function atualizarItemDisparoPeloWebhook({
  messageId,
  statusNormalizado,
  erro,
  erroCodigoMeta,
  rawStatus,
}: WebhookStatusUpdateParams) {
  const mensagemExternaId = String(messageId || "").trim();

  if (!mensagemExternaId) {
    return { found: false, updated: false, reason: "message_id_ausente" };
  }

  const { data: item, error } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .select(
      "id, campanha_id, empresa_id, integracao_whatsapp_id, status, metadata_json"
    )
    .eq("message_id", mensagemExternaId)
    .maybeSingle();

  if (error || !item) {
    return {
      found: false,
      updated: false,
      reason: error?.message || "item_nao_encontrado",
    };
  }

  const metadataAtual = objeto(item.metadata_json);
  const agora = new Date().toISOString();
  const falhou = statusNormalizado === "falha";

  const { error: updateError } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .update({
      status: falhou ? "falha" : "enviado",
      erro: falhou ? erro || "Falha informada pela Meta." : null,
      erro_codigo_meta: falhou ? erroCodigoMeta || null : null,
      processed_at: agora,
      updated_at: agora,
      metadata_json: {
        ...metadataAtual,
        ultimo_status_meta: statusNormalizado,
        webhook_status_raw: rawStatus || null,
        status_meta_recebido_em: agora,
      },
    })
    .eq("id", item.id);

  if (updateError) {
    throw new Error(
      `Erro ao atualizar item de disparo pelo webhook: ${updateError.message}`
    );
  }

  await recalcularCampanha(String(item.campanha_id));

  if (falhou) {
    await avaliarCircuitBreakerCampanha({
      campanhaId: String(item.campanha_id),
      empresaId: String(item.empresa_id),
      integracaoWhatsappId: String(item.integracao_whatsapp_id),
      erroCodigoMeta: erroCodigoMeta || null,
      erroMensagem: erro || null,
    });
  }

  return {
    found: true,
    updated: true,
    itemId: item.id,
    status: falhou ? "falha" : "enviado",
  };
}

export function normalizarTelefoneItemDisparo(valor: string) {
  return limparNumeroDisparo(valor);
}
