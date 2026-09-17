import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { calcularJanelaAssinatura } from "@/lib/assinaturas/status";
import { enviarPrimeiroAcesso } from "@/lib/auth/enviar-primeiro-acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
const MAX_TIMESTAMP_DRIFT_SECONDS = 5 * 60;

type ProsperityPayPayload = {
  event_id?: string;
  version?: string;
  event?:
    | "payment.approved"
    | "payment.failed"
    | "payment.refunded"
    | "payment.chargeback"
    | string;
  occurred_at?: string;
  payment?: {
    id?: string;
    external_id?: string | null;
    status?: string;
    amount_cents?: number;
    currency?: string;
    paid_at?: string | null;
    refunded_at?: string | null;
  };
  order?: { id?: string };
  offer?: {
    id?: string;
    reference?: string | null;
    name?: string | null;
    billing_type?: string | null;
  };
  product?: { id?: string; name?: string | null };
  customer?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  };
};

type WebhookEventRow = {
  id: string;
  status: "processing" | "processed" | "ignored" | "failed";
  attempts: number;
};

function normalizarEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizarPlanoRelacao(plano: any) {
  return Array.isArray(plano) ? plano[0] ?? null : plano ?? null;
}

function statusPagamento(event: string | undefined) {
  if (event === "payment.approved") return "paid";
  if (event === "payment.refunded") return "refunded";
  if (event === "payment.chargeback") return "chargeback";
  if (event === "payment.failed") return "failed";
  return null;
}

function transactionId(payload: ProsperityPayPayload) {
  return String(
    payload.payment?.external_id || payload.payment?.id || ""
  ).trim();
}

function offerReferences(payload: ProsperityPayPayload) {
  return [payload.offer?.reference, payload.offer?.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function pagoEm(payload: ProsperityPayPayload) {
  const candidates = [payload.payment?.paid_at, payload.occurred_at];

  for (const value of candidates) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return new Date().toISOString();
}

function verifySignature(rawBody: string, request: Request) {
  const secret = process.env.PROSPERITY_PAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("PROSPERITY_PAY_WEBHOOK_SECRET não configurado.");
  }

  const timestamp = request.headers.get("x-prosperity-timestamp")?.trim() || "";
  const signatureHeader =
    request.headers.get("x-prosperity-signature")?.trim() || "";
  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : "";
  const numericTimestamp = Number(timestamp);

  if (
    !timestamp ||
    !Number.isFinite(numericTimestamp) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - numericTimestamp) > MAX_TIMESTAMP_DRIFT_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && timingSafeEqual(received, expected);
}

function validatePayload(
  payload: ProsperityPayPayload,
  headerEventId: string | null
) {
  if (!payload.event_id || !payload.event || !payload.payment?.id) {
    throw new Error("Payload do Prosperity Pay incompleto.");
  }

  if (headerEventId && headerEventId !== payload.event_id) {
    throw new Error("Event ID do cabeçalho difere do payload.");
  }

  if (!transactionId(payload)) {
    throw new Error("Pagamento sem identificador de transação.");
  }
}

async function registerEvent(payload: ProsperityPayPayload) {
  const inserted = await supabase
    .from("prosperity_pay_webhook_eventos")
    .insert({
      event_id: payload.event_id,
      event_type: payload.event,
      payment_id: transactionId(payload),
      payload,
      status: "processing",
      attempts: 1,
    })
    .select("id,status,attempts")
    .single();

  if (!inserted.error && inserted.data) {
    return { row: inserted.data as WebhookEventRow, duplicate: false };
  }

  if (inserted.error?.code !== "23505") throw inserted.error;

  const existing = await supabase
    .from("prosperity_pay_webhook_eventos")
    .select("id,status,attempts")
    .eq("event_id", payload.event_id!)
    .single();

  if (existing.error || !existing.data) {
    throw existing.error ?? new Error("Evento duplicado não encontrado.");
  }

  const row = existing.data as WebhookEventRow;

  if (row.status === "processed" || row.status === "ignored") {
    return { row, duplicate: true };
  }

  if (row.status === "processing") {
    return { row, duplicate: true };
  }

  const retry = await supabase
    .from("prosperity_pay_webhook_eventos")
    .update({
      status: "processing",
      attempts: row.attempts + 1,
      error_message: null,
    })
    .eq("id", row.id)
    .eq("status", "failed")
    .select("id,status,attempts")
    .single();

  if (retry.error || !retry.data) {
    throw retry.error ?? new Error("Falha ao reabrir evento para nova tentativa.");
  }

  return { row: retry.data as WebhookEventRow, duplicate: false };
}

async function buscarLead(email: string) {
  if (!email) return null;

  const { data, error } = await supabase
    .from("leads_cadastro")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function buscarOferta(
  payload: ProsperityPayPayload,
  empresaId?: string | null
) {
  const referencias = offerReferences(payload);
  if (!referencias.length) return null;

  let query = supabase
    .from("ia_token_ofertas")
    .select(`
      id,
      gateway,
      referencia,
      tipo,
      nome,
      plano_id,
      empresa_id,
      quantidade_tokens,
      ativa,
      metadata_json,
      planos (id,nome,slug)
    `)
    .eq("gateway", "prosperity_pay")
    .eq("ativa", true)
    .in("referencia", referencias);

  query = empresaId
    ? query.or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
    : query.is("empresa_id", null);

  const { data, error } = await query
    .order("empresa_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function tipoOferta(oferta: any) {
  const metadata =
    oferta?.metadata_json && typeof oferta.metadata_json === "object"
      ? oferta.metadata_json
      : {};
  const tipo = String(metadata.tipo_oferta || "normal")
    .trim()
    .toLowerCase();

  return ["normal", "vip", "jv", "af", "free"].includes(tipo)
    ? tipo
    : "normal";
}

async function criarLead(payload: ProsperityPayPayload, oferta: any) {
  const plano = normalizarPlanoRelacao(oferta?.planos);
  const email = normalizarEmail(payload.customer?.email);

  if (!email) {
    throw new Error("Pagamento aprovado sem email do cliente.");
  }

  const { data, error } = await supabase
    .from("leads_cadastro")
    .insert({
      nome: payload.customer?.name || "Cliente",
      email,
      empresa:
        payload.product?.name ||
        payload.offer?.name ||
        "Cliente Prosperity Pay",
      status: "novo",
      pago: false,
      plano_slug: plano?.slug || null,
      tipo_oferta: tipoOferta(oferta),
      metadata_json: payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Falha ao criar lead do pagamento.");
  }

  return data;
}

async function salvarPagamento(
  payload: ProsperityPayPayload,
  leadId: string | null
) {
  const status = statusPagamento(payload.event);
  if (!status) {
    throw new Error(`Evento não suportado: ${payload.event}`);
  }

  const { data, error } = await supabase
    .from("pagamentos")
    .upsert(
      {
        gateway: "prosperity_pay",
        evento: payload.event,
        transaction_id: transactionId(payload),
        status,
        valor: Math.round(Number(payload.payment?.amount_cents || 0)),
        customer_id: payload.customer?.id || null,
        customer_email: normalizarEmail(payload.customer?.email) || null,
        customer_nome: payload.customer?.name || null,
        offer_hash:
          String(payload.offer?.reference || payload.offer?.id || "") || null,
        offer_titulo: payload.offer?.name || null,
        offer_preco: Math.round(Number(payload.payment?.amount_cents || 0)),
        paid_at: status === "paid" ? pagoEm(payload) : null,
        refunded_at:
          status === "refunded"
            ? payload.payment?.refunded_at ||
              payload.occurred_at ||
              new Date().toISOString()
            : null,
        lead_id: leadId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gateway,transaction_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Falha ao salvar pagamento do Prosperity Pay.");
  }

  return data;
}

async function obterOuCriarEmpresa(input: {
  lead: any;
  payload: ProsperityPayPayload;
  planoId: string;
}) {
  if (input.lead?.empresa_id) {
    const existing = await supabase
      .from("empresas")
      .select("*")
      .eq("id", input.lead.empresa_id)
      .maybeSingle();

    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
  }

  const email = normalizarEmail(
    input.lead?.email || input.payload.customer?.email
  );

  if (!email) {
    throw new Error("Não foi possível identificar o email da empresa.");
  }

  const byEmail = await supabase
    .from("empresas")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;
  if (byEmail.data) return byEmail.data;

  const nome = String(
    input.lead?.empresa ||
      input.payload.customer?.name ||
      input.payload.product?.name ||
      "Empresa Cliente"
  ).trim();

  const created = await supabase
    .from("empresas")
    .insert({
      plano_id: input.planoId,
      nicho_id:
        input.lead?.nicho_id ?? "10000000-0000-4000-8000-000000000001",
      nome_fantasia: nome,
      razao_social: nome,
      email,
      nome_responsavel:
        input.payload.customer?.name || input.lead?.nome || null,
      status: "ativa",
      timezone: "America/Sao_Paulo",
      observacoes: "Criada automaticamente via webhook Prosperity Pay",
      termo_aceite: input.lead?.termo_aceite ?? false,
      termo_aceite_em: input.lead?.termo_aceite_em ?? null,
      termo_aceite_ip: input.lead?.termo_aceite_ip ?? null,
      termo_aceite_user_agent: input.lead?.termo_aceite_user_agent ?? null,
      termo_aceite_versao: input.lead?.termo_aceite_versao ?? null,
      politica_privacidade_versao:
        input.lead?.politica_privacidade_versao ?? null,
      contrato_responsabilidades_versao:
        input.lead?.contrato_responsabilidades_versao ?? null,
      termo_aceite_texto: input.lead?.termo_aceite_texto ?? null,
    })
    .select("*")
    .single();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Falha ao criar empresa.");
  }

  return created.data;
}

async function aplicarAssinatura(input: {
  empresaId: string;
  planoId: string;
  planoSlug: string;
  oferta: any;
  payload: ProsperityPayPayload;
}) {
  const inicio = pagoEm(input.payload);
  const janela = calcularJanelaAssinatura(inicio);
  const referencia = transactionId(input.payload);

  const update = await supabase
    .from("empresas")
    .update({
      plano_id: input.planoId,
      assinatura_status: "ativa",
      assinatura_inicio_em: janela.inicioEm,
      assinatura_vencimento_em: janela.vencimentoEm,
      assinatura_bloqueio_em: janela.bloqueioEm,
      assinatura_renovada_em: janela.inicioEm,
      assinatura_gateway: "prosperity_pay",
      assinatura_referencia: referencia,
      assinatura_metadata_json: {
        origem: "webhook_prosperity_pay",
        event_id: input.payload.event_id,
        plano_slug: input.planoSlug,
        tipo_oferta: tipoOferta(input.oferta),
        oferta_id: input.oferta?.id || null,
        oferta_referencia:
          input.oferta?.referencia ||
          input.payload.offer?.reference ||
          input.payload.offer?.id ||
          null,
        prosperity_pay_offer_id: input.payload.offer?.id || null,
        transaction_id: referencia,
      },
      assinatura_fluxos_pausados_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.empresaId);

  if (update.error) throw update.error;

  const tokens = await supabase.rpc("renovar_tokens_assinatura_plano", {
    p_empresa_id: input.empresaId,
    p_referencia: referencia,
    p_pago_em: inicio,
    p_metadata_json: {
      origem: "webhook_prosperity_pay",
      event_id: input.payload.event_id,
      offer_reference:
        input.payload.offer?.reference || input.payload.offer?.id || null,
      amount_cents: input.payload.payment?.amount_cents || 0,
    },
  });

  if (tokens.error) {
    throw new Error(`Erro ao renovar tokens do plano: ${tokens.error.message}`);
  }
}

async function processarAprovado(
  payload: ProsperityPayPayload,
  leadInicial: any,
  pagamentoId: string
) {
  const oferta = await buscarOferta(payload, leadInicial?.empresa_id ?? null);

  if (!oferta) {
    throw new Error(
      `Oferta do Prosperity Pay não mapeada no CRM: ${
        offerReferences(payload).join(", ") || "sem referência"
      }.`
    );
  }

  const plano = normalizarPlanoRelacao(oferta.planos);

  if (!oferta.plano_id || !plano?.slug) {
    throw new Error(
      "Oferta do Prosperity Pay sem plano mensal vinculado no CRM."
    );
  }

  const lead = leadInicial || (await criarLead(payload, oferta));
  const primeiroPagamento = lead.pago !== true;
  const empresa = await obterOuCriarEmpresa({
    lead,
    payload,
    planoId: oferta.plano_id,
  });

  await aplicarAssinatura({
    empresaId: empresa.id,
    planoId: oferta.plano_id,
    planoSlug: plano.slug,
    oferta,
    payload,
  });

  const pagamentoUpdate = await supabase
    .from("pagamentos")
    .update({
      empresa_id: empresa.id,
      lead_id: lead.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pagamentoId);

  if (pagamentoUpdate.error) throw pagamentoUpdate.error;

  const leadUpdate = await supabase
    .from("leads_cadastro")
    .update({
      status: "pago",
      pago: true,
      pago_em: pagoEm(payload),
      empresa_id: empresa.id,
      plano_slug: plano.slug,
      tipo_oferta: tipoOferta(oferta),
      metadata_json: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (leadUpdate.error) throw leadUpdate.error;

  if (primeiroPagamento) {
    const email = normalizarEmail(lead.email || payload.customer?.email);

    if (email) {
      try {
        await enviarPrimeiroAcesso({
          email,
          nome: lead.nome || payload.customer?.name || "Cliente",
          empresaId: empresa.id,
          telefone: lead.telefone ?? null,
        });
      } catch (error) {
        console.error(
          "[PROSPERITY PAY] Pagamento ativado, mas primeiro acesso falhou:",
          error
        );
      }
    }
  }

  return { lead, empresa, oferta, plano };
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request)) {
    return NextResponse.json(
      { ok: false, error: "Assinatura inválida ou expirada." },
      { status: 401 }
    );
  }

  let payload: ProsperityPayPayload;

  try {
    payload = JSON.parse(rawBody) as ProsperityPayPayload;
    validatePayload(payload, request.headers.get("x-prosperity-event-id"));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Payload inválido.",
      },
      { status: 400 }
    );
  }

  const supportedEvents = new Set([
    "payment.approved",
    "payment.failed",
    "payment.refunded",
    "payment.chargeback",
  ]);

  if (!supportedEvents.has(payload.event!)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      event_id: payload.event_id,
    });
  }

  let eventRow: WebhookEventRow;

  try {
    const registered = await registerEvent(payload);
    eventRow = registered.row;

    if (registered.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        event_id: payload.event_id,
      });
    }
  } catch (error) {
    console.error("[PROSPERITY PAY] Falha ao registrar evento:", error);
    return NextResponse.json(
      { ok: false, error: "Falha ao registrar evento." },
      { status: 500 }
    );
  }

  try {
    const email = normalizarEmail(payload.customer?.email);
    let lead = await buscarLead(email);

    if (!lead && payload.event === "payment.approved") {
      const oferta = await buscarOferta(payload, null);

      if (!oferta) {
        throw new Error(
          `Oferta do Prosperity Pay não mapeada no CRM: ${
            offerReferences(payload).join(", ") || "sem referência"
          }.`
        );
      }

      lead = await criarLead(payload, oferta);
    }

    const pagamento = await salvarPagamento(payload, lead?.id ?? null);
    let empresaId: string | null = lead?.empresa_id ?? null;

    if (payload.event === "payment.approved") {
      const resultado = await processarAprovado(payload, lead, pagamento.id);
      empresaId = resultado.empresa.id;
    }

    await supabase
      .from("prosperity_pay_webhook_eventos")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", eventRow.id);

    return NextResponse.json({
      ok: true,
      event_id: payload.event_id,
      event: payload.event,
      transaction_id: transactionId(payload),
      pagamento_id: pagamento.id,
      empresa_id: empresaId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido.";

    await supabase
      .from("prosperity_pay_webhook_eventos")
      .update({ status: "failed", error_message: message.slice(0, 1000) })
      .eq("id", eventRow.id);

    console.error("[PROSPERITY PAY WEBHOOK]", error);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
