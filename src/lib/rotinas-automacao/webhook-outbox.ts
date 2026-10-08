import { createHmac, randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { qstash } from "@/lib/qstash/client";
import { descriptografarTokenIntegracao } from "@/lib/integracoes/credenciais";

const supabase = getSupabaseAdmin();

function erroTexto(error: unknown) {
  return error instanceof Error ? error.message : "Erro desconhecido.";
}

function obterBaseUrlAplicacao() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function obterUrlWorkerWebhookIntegracao() {
  const configurada = String(process.env.QSTASH_INTEGRACAO_WEBHOOK_WORKER_URL || "").trim();
  if (configurada) return configurada;
  const base = obterBaseUrlAplicacao();
  return base ? `${base}/api/worker/processar-webhook-integracao` : "";
}

function extrairMessageId(resultado: unknown) {
  if (!resultado || typeof resultado !== "object") return null;
  const registro = resultado as Record<string, unknown>;
  return String(registro.messageId || registro.message_id || "").trim() || null;
}

export async function publicarWebhookIntegracaoQstash(outboxId: string) {
  const id = String(outboxId || "").trim();
  const url = obterUrlWorkerWebhookIntegracao();

  if (!id || !process.env.QSTASH_TOKEN || !url) {
    return {
      ok: false as const,
      messageId: null,
      erro: !id
        ? "Identificador do webhook ausente."
        : !process.env.QSTASH_TOKEN
          ? "QSTASH_TOKEN ausente."
          : "URL do worker de integração ausente.",
    };
  }

  try {
    const resultado = await qstash.publishJSON({
      url,
      body: { outboxId: id },
      retries: 5,
      retryDelay: "60000 * (1 + retried)",
      timeout: 30,
      deduplicationId: `integracao-webhook-${id}`,
      label: "integracao-webhook",
    });

    return {
      ok: true as const,
      messageId: extrairMessageId(resultado),
      erro: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      messageId: null,
      erro: erroTexto(error),
    };
  }
}

function metadataRecord(valor: unknown) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
}

export async function enfileirarWebhookAutomacao(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  acaoId: string;
  mensagemId?: string | null;
  evento: string;
  config: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  try {
    const integracaoId = String(params.config.integracao_id || "").trim();
    const endpoint = String(params.config.endpoint || "").trim();

    if (!integracaoId || !endpoint.startsWith("/")) {
      return {
        webhook_enfileirado: false,
        entrega_assincrona: true,
        ignorado: true,
        motivo: "Configure uma conexão externa e um endpoint iniciado por /.",
      };
    }

    const { data: conexao, error: conexaoError } = await supabase
      .from("integracoes_api_externas")
      .select("id,nome,status")
      .eq("id", integracaoId)
      .eq("empresa_id", params.empresaId)
      .maybeSingle();

    if (conexaoError) throw conexaoError;
    if (!conexao || conexao.status !== "ativa") {
      return {
        webhook_enfileirado: false,
        entrega_assincrona: true,
        ignorado: true,
        motivo: "Conexão externa inativa ou não encontrada.",
      };
    }

    const [conversaResult, mensagemResult] = await Promise.all([
      supabase
        .from("conversas")
        .select("id,contato_id,integracao_whatsapp_id,status,setor_id,responsavel_id,aguardando_atendente,created_at,updated_at")
        .eq("id", params.conversaId)
        .eq("empresa_id", params.empresaId)
        .maybeSingle(),
      params.mensagemId
        ? supabase
            .from("mensagens")
            .select("id,conteudo,tipo_mensagem,remetente_tipo,origem,status_envio,mensagem_externa_id,metadata_json,created_at")
            .eq("id", params.mensagemId)
            .eq("empresa_id", params.empresaId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (conversaResult.error) throw conversaResult.error;
    if (mensagemResult.error) throw mensagemResult.error;
    const conversa = conversaResult.data;
    const mensagem = mensagemResult.data;

    const [contatoResult, whatsappResult] = await Promise.all([
      conversa?.contato_id
        ? supabase
            .from("contatos")
            .select("id,nome,whatsapp_profile_name,email,telefone,origem,status_lead,classificacao")
            .eq("id", conversa.contato_id)
            .eq("empresa_id", params.empresaId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      conversa?.integracao_whatsapp_id
        ? supabase
            .from("integracoes_whatsapp")
            .select("id,nome_conexao,numero,phone_number_id,status")
            .eq("id", conversa.integracao_whatsapp_id)
            .eq("empresa_id", params.empresaId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (contatoResult.error) throw contatoResult.error;
    if (whatsappResult.error) throw whatsappResult.error;

    const contato = contatoResult.data;
    const whatsapp = whatsappResult.data;
    const metadata = metadataRecord(mensagem?.metadata_json);
    const outboxId = randomUUID();
    const eventName = params.evento === "mensagem.recebida"
      ? "message.received"
      : params.evento.replace(/_/g, ".");

    const payload = {
      event: eventName,
      event_id: outboxId,
      created_at: new Date().toISOString(),
      provider: "prosperity",
      company: {
        id: params.empresaId,
      },
      integration: {
        id: whatsapp?.id || conversa?.integracao_whatsapp_id || null,
        name: whatsapp?.nome_conexao || null,
        phone: whatsapp?.numero || null,
        phone_number_id: whatsapp?.phone_number_id || null,
        channel: "whatsapp",
      },
      conversation: {
        id: conversa?.id || params.conversaId,
        status: conversa?.status || null,
        sector_id: conversa?.setor_id || null,
        assignee_id: conversa?.responsavel_id || null,
        waiting_for_agent: conversa?.aguardando_atendente === true,
        created_at: conversa?.created_at || null,
        updated_at: conversa?.updated_at || null,
      },
      contact: {
        id: contato?.id || conversa?.contato_id || null,
        name: contato?.nome || contato?.whatsapp_profile_name || null,
        whatsapp_name: contato?.whatsapp_profile_name || null,
        phone: contato?.telefone || null,
        email: contato?.email || null,
        origin: contato?.origem || null,
        lead_status: contato?.status_lead || null,
        classification: contato?.classificacao || null,
      },
      message: {
        id: mensagem?.id || params.mensagemId || null,
        external_id: mensagem?.mensagem_externa_id || null,
        direction: "incoming",
        type: mensagem?.tipo_mensagem || null,
        content: mensagem?.conteudo || null,
        source: mensagem?.origem || mensagem?.remetente_tipo || "whatsapp",
        status: mensagem?.status_envio || null,
        created_at: mensagem?.created_at || null,
        media: {
          id: metadata.media_id || null,
          mime_type: metadata.mime_type || null,
          filename: metadata.filename || null,
        },
      },
    };

    const chaveIdempotencia = [
      params.execucaoId,
      params.acaoId,
      params.mensagemId || params.conversaId,
    ].join(":");

    const { data: inserido, error: insertError } = await supabase
      .from("integracao_webhooks_outbox")
      .upsert({
        id: outboxId,
        empresa_id: params.empresaId,
        automacao_id: params.automacaoId,
        execucao_id: params.execucaoId,
        acao_id: params.acaoId,
        integracao_id: integracaoId,
        conversa_id: params.conversaId,
        mensagem_id: params.mensagemId || null,
        evento: eventName,
        endpoint,
        payload_json: payload,
        status: "pendente",
        chave_idempotencia: chaveIdempotencia,
      }, {
        onConflict: "chave_idempotencia",
        ignoreDuplicates: true,
      })
      .select("id,status,qstash_message_id")
      .maybeSingle();

    if (insertError) throw insertError;

    let registro = inserido;
    if (!registro) {
      const existente = await supabase
        .from("integracao_webhooks_outbox")
        .select("id,status,qstash_message_id")
        .eq("chave_idempotencia", chaveIdempotencia)
        .maybeSingle();
      if (existente.error) throw existente.error;
      registro = existente.data;
    }

    if (!registro?.id) {
      throw new Error("Não foi possível registrar o webhook para envio.");
    }

    let publicacao: Awaited<ReturnType<typeof publicarWebhookIntegracaoQstash>> | null = null;
    if (registro.status === "pendente" && !registro.qstash_message_id) {
      publicacao = await publicarWebhookIntegracaoQstash(registro.id);
      if (publicacao.ok && publicacao.messageId) {
        await supabase
          .from("integracao_webhooks_outbox")
          .update({
            qstash_message_id: publicacao.messageId,
            qstash_publicado_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", registro.id);
      }
    }

    return {
      webhook_enfileirado: true,
      entrega_assincrona: true,
      outbox_id: registro.id,
      conexao: conexao.nome,
      endpoint,
      qstash_publicado: publicacao?.ok === true || Boolean(registro.qstash_message_id),
      aviso: publicacao && !publicacao.ok
        ? "Evento salvo. A recuperação automática tentará publicá-lo novamente."
        : null,
    };
  } catch (error) {
    console.error("[WEBHOOK INTEGRACAO] Falha ao enfileirar evento:", error);
    return {
      webhook_enfileirado: false,
      entrega_assincrona: true,
      erro: erroTexto(error),
    };
  }
}

function urlDestino(baseUrl: string, endpoint: string) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") {
    throw new Error("A conexão externa precisa usar HTTPS.");
  }
  if (!endpoint.startsWith("/")) {
    throw new Error("Endpoint inválido. Use um caminho iniciado por /.");
  }
  const destino = new URL(endpoint, base);
  if (destino.origin !== base.origin || destino.protocol !== "https:") {
    throw new Error("O endpoint precisa permanecer no mesmo servidor da conexão.");
  }
  return destino;
}

async function atualizarFalha(params: {
  id: string;
  tentativas: number;
  maxTentativas: number;
  erro: string;
  statusHttp?: number | null;
}) {
  const final = params.tentativas >= params.maxTentativas;
  await supabase
    .from("integracao_webhooks_outbox")
    .update({
      status: final ? "descartado" : "erro",
      ultimo_erro: params.erro,
      ultimo_status_http: params.statusHttp ?? null,
      processado_em: final ? new Date().toISOString() : null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  return final;
}

export async function processarWebhookIntegracaoPorId(outboxId: string) {
  const { data, error } = await supabase.rpc("claim_integracao_webhook_outbox", {
    p_id: outboxId,
  });
  if (error) throw error;

  const item = Array.isArray(data) ? data[0] : data;
  if (!item) {
    return { ok: true, ignorado: true, motivo: "Evento já processado ou sem tentativas disponíveis." };
  }

  const tentativas = Number(item.tentativas || 0);
  const maxTentativas = Number(item.max_tentativas || 5);

  try {
    const { data: conexao, error: conexaoError } = await supabase
      .from("integracoes_api_externas")
      .select("id,base_url,token_criptografado,status")
      .eq("id", item.integracao_id)
      .eq("empresa_id", item.empresa_id)
      .maybeSingle();

    if (conexaoError) throw conexaoError;
    if (!conexao || conexao.status !== "ativa") {
      await supabase
        .from("integracao_webhooks_outbox")
        .update({
          status: "descartado",
          ultimo_erro: "Conexão externa inativa ou removida.",
          processado_em: new Date().toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      return { ok: true, final: true, motivo: "Conexão externa inativa ou removida." };
    }

    const destino = urlDestino(conexao.base_url, item.endpoint);
    const body = JSON.stringify(item.payload_json || {});
    const token = conexao.token_criptografado
      ? descriptografarTokenIntegracao(conexao.token_criptografado)
      : "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const assinatura = token
      ? `sha256=${createHmac("sha256", token).update(body).digest("hex")}`
      : "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let resposta: Response;

    try {
      resposta = await fetch(destino, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          "User-Agent": "CRM-Prosperity-Webhook/1.0",
          "X-Prosperity-Delivery": item.id,
          "X-Prosperity-Timestamp": timestamp,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(assinatura ? { "X-Prosperity-Signature": assinatura } : {}),
        },
        body,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (resposta.ok) {
      await supabase
        .from("integracao_webhooks_outbox")
        .update({
          status: "processado",
          ultimo_status_http: resposta.status,
          ultimo_erro: null,
          processado_em: new Date().toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      return {
        ok: true,
        entregue: true,
        status_http: resposta.status,
      };
    }

    const transitorio =
      [408, 425, 429].includes(resposta.status) || resposta.status >= 500;
    const mensagem = `Servidor externo respondeu HTTP ${resposta.status}.`;

    if (!transitorio) {
      await supabase
        .from("integracao_webhooks_outbox")
        .update({
          status: "descartado",
          ultimo_status_http: resposta.status,
          ultimo_erro: mensagem,
          processado_em: new Date().toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      return { ok: true, final: true, status_http: resposta.status, motivo: mensagem };
    }

    const final = await atualizarFalha({
      id: item.id,
      tentativas,
      maxTentativas,
      erro: mensagem,
      statusHttp: resposta.status,
    });
    if (final) return { ok: true, final: true, motivo: mensagem };
    throw new Error(mensagem);
  } catch (error) {
    const mensagem = error instanceof Error && error.name === "AbortError"
      ? "Timeout ao enviar webhook para o sistema externo."
      : erroTexto(error);

    const { data: atual } = await supabase
      .from("integracao_webhooks_outbox")
      .select("status")
      .eq("id", item.id)
      .maybeSingle();

    if (atual?.status === "processando") {
      const final = await atualizarFalha({
        id: item.id,
        tentativas,
        maxTentativas,
        erro: mensagem,
      });
      if (final) return { ok: true, final: true, motivo: mensagem };
    }

    throw error instanceof Error ? error : new Error(mensagem);
  }
}

export async function republicarWebhooksIntegracaoPendentes(params: {
  limite?: number;
  idadeMinimaSegundos?: number;
} = {}) {
  const limite = Math.min(Math.max(Number(params.limite || 10), 1), 25);
  const idade = Math.min(Math.max(Number(params.idadeMinimaSegundos || 90), 30), 600);
  const antesDe = new Date(Date.now() - idade * 1000).toISOString();

  const { data, error } = await supabase
    .from("integracao_webhooks_outbox")
    .select("id")
    .eq("status", "pendente")
    .is("qstash_message_id", null)
    .lt("updated_at", antesDe)
    .order("created_at", { ascending: true })
    .limit(limite);

  if (error) throw error;

  let republicados = 0;
  let falhas = 0;

  for (const item of data || []) {
    const resultado = await publicarWebhookIntegracaoQstash(item.id);
    if (resultado.ok) {
      republicados += 1;
      await supabase
        .from("integracao_webhooks_outbox")
        .update({
          qstash_message_id: resultado.messageId,
          qstash_publicado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    } else {
      falhas += 1;
    }
  }

  return {
    buscados: data?.length || 0,
    republicados,
    falhas,
  };
}
