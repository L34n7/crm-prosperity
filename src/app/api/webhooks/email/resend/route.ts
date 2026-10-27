import { NextResponse } from "next/server";
import {
  getEmailMarketingResend,
  getEmailMarketingWebhookSecret,
} from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function primeiroEmail(valor: unknown) {
  if (!Array.isArray(valor)) return "";

  for (const item of valor) {
    const email = texto(item).toLowerCase();
    if (email) return email;
  }

  return "";
}

function deveAtualizarStatus(statusAtual: string, tipo: string) {
  if (tipo === "email.sent") {
    return statusAtual === "pendente" || statusAtual === "processando";
  }

  if (tipo === "email.delivered") {
    return !["aberto", "clicado", "bounce", "reclamacao", "suprimido"].includes(
      statusAtual
    );
  }

  if (tipo === "email.opened") {
    return !["clicado", "bounce", "reclamacao", "suprimido"].includes(
      statusAtual
    );
  }

  if (tipo === "email.clicked") {
    return !["bounce", "reclamacao", "suprimido"].includes(statusAtual);
  }

  if (tipo === "email.failed") {
    return ["pendente", "processando", "enviado"].includes(statusAtual);
  }

  return true;
}

async function registrarSupressao(params: {
  email: string;
  motivo: "bounce" | "reclamacao";
  providerMessageId: string;
  empresaId: string | null;
  payload: ResendWebhookEvent;
}) {
  if (!params.email) return;

  let consulta = supabaseAdmin
    .from("email_suppressions")
    .select("id")
    .ilike("email", params.email);

  consulta = params.empresaId
    ? consulta.eq("empresa_id", params.empresaId)
    : consulta.is("empresa_id", null);

  const { data: existente, error: buscaError } = await consulta.limit(1);

  if (buscaError) {
    console.error("[EMAIL MARKETING] Falha ao consultar supressão:", buscaError);
    return;
  }

  if (existente?.length) {
    const { error } = await supabaseAdmin
      .from("email_suppressions")
      .update({
        motivo: params.motivo,
        fonte: "resend",
        provider_message_id: params.providerMessageId || null,
        metadata_json: params.payload,
      })
      .eq("id", existente[0].id);

    if (error) {
      console.error("[EMAIL MARKETING] Falha ao atualizar supressão:", error);
    }

    return;
  }

  const { error } = await supabaseAdmin.from("email_suppressions").insert({
    empresa_id: params.empresaId,
    email: params.email,
    motivo: params.motivo,
    fonte: "resend",
    provider_message_id: params.providerMessageId || null,
    metadata_json: params.payload,
  });

  if (error && error.code !== "23505") {
    console.error("[EMAIL MARKETING] Falha ao registrar supressão:", error);
  }
}

export async function POST(request: Request) {
  const svixId = request.headers.get("svix-id") || "";
  const svixTimestamp = request.headers.get("svix-timestamp") || "";
  const svixSignature = request.headers.get("svix-signature") || "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { ok: false, error: "Assinatura do webhook ausente." },
      { status: 400 }
    );
  }

  const payload = await request.text();

  let evento: ResendWebhookEvent;

  try {
    const resend = getEmailMarketingResend();
    const webhookSecret = getEmailMarketingWebhookSecret();

    const eventoVerificado = await Promise.resolve(
      resend.webhooks.verify({
        payload,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret,
      })
    );

    evento = eventoVerificado as unknown as ResendWebhookEvent;
  } catch (error) {
    console.error("[EMAIL MARKETING] Webhook Resend inválido:", error);

    return NextResponse.json(
      { ok: false, error: "Webhook inválido." },
      { status: 400 }
    );
  }

  const tipo = texto(evento.type);
  const dados = evento.data ?? {};
  const providerMessageId = texto(dados.email_id);
  const destinatarioEmail = primeiroEmail(dados.to);
  const ocorridoEm = texto(evento.created_at) || new Date().toISOString();

  if (!tipo) {
    return NextResponse.json(
      { ok: false, error: "Evento sem tipo." },
      { status: 400 }
    );
  }

  const { data: destinatario } = providerMessageId
    ? await supabaseAdmin
        .from("email_campanha_destinatarios")
        .select("id, campanha_id, email, status")
        .eq("provider_message_id", providerMessageId)
        .maybeSingle()
    : { data: null };

  let empresaId: string | null = null;

  if (destinatario?.campanha_id) {
    const { data: campanha } = await supabaseAdmin
      .from("email_campanhas")
      .select("empresa_id")
      .eq("id", destinatario.campanha_id)
      .maybeSingle();

    empresaId = campanha?.empresa_id || null;
  }

  const { error: eventoError } = await supabaseAdmin
    .from("email_eventos")
    .insert({
      empresa_id: empresaId,
      campanha_id: destinatario?.campanha_id || null,
      destinatario_id: destinatario?.id || null,
      provider: "resend",
      provider_event_id: svixId,
      provider_message_id: providerMessageId || null,
      tipo,
      destinatario_email:
        destinatarioEmail || destinatario?.email || null,
      ocorrido_em: ocorridoEm,
      payload_json: evento,
    });

  if (eventoError) {
    if (eventoError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    console.error("[EMAIL MARKETING] Falha ao salvar webhook:", eventoError);

    return NextResponse.json(
      { ok: false, error: "Falha ao registrar evento." },
      { status: 500 }
    );
  }

  if (destinatario && deveAtualizarStatus(destinatario.status, tipo)) {
    const agora = ocorridoEm;
    const atualizacao: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (tipo === "email.sent") {
      atualizacao.status = "enviado";
      atualizacao.enviado_em = agora;
    } else if (tipo === "email.delivered") {
      atualizacao.status = "entregue";
      atualizacao.entregue_em = agora;
    } else if (tipo === "email.opened") {
      atualizacao.status = "aberto";
      atualizacao.aberto_em = agora;
    } else if (tipo === "email.clicked") {
      atualizacao.status = "clicado";
      atualizacao.clicado_em = agora;
    } else if (tipo === "email.bounced") {
      atualizacao.status = "bounce";
      atualizacao.bounce_em = agora;
    } else if (tipo === "email.complained") {
      atualizacao.status = "reclamacao";
      atualizacao.reclamacao_em = agora;
    } else if (tipo === "email.suppressed") {
      atualizacao.status = "suprimido";
      atualizacao.suprimido_em = agora;
    } else if (tipo === "email.failed") {
      atualizacao.status = "falha";
      atualizacao.erro =
        texto((dados.failed as Record<string, unknown> | undefined)?.reason) ||
        "Falha informada pelo provedor.";
    }

    if (Object.keys(atualizacao).length > 1) {
      const { error: atualizarError } = await supabaseAdmin
        .from("email_campanha_destinatarios")
        .update(atualizacao)
        .eq("id", destinatario.id);

      if (atualizarError) {
        console.error(
          "[EMAIL MARKETING] Falha ao atualizar destinatário:",
          atualizarError
        );
      }
    }
  }

  if (tipo === "email.bounced" || tipo === "email.complained") {
    await registrarSupressao({
      email: destinatarioEmail || destinatario?.email || "",
      motivo: tipo === "email.complained" ? "reclamacao" : "bounce",
      providerMessageId,
      empresaId,
      payload: evento,
    });
  }

  return NextResponse.json({ ok: true });
}
