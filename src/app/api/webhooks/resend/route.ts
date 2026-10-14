import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notificarFalhaEntregaPrimeiroAcesso } from "@/lib/auth/primeiro-acesso-email-contingencia";

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function primeiroTexto(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function extrairDetalheFalha(data: Record<string, unknown>) {
  const bounce = objeto(data.bounce);
  const failed = objeto(data.failed);
  const error = objeto(data.error);

  return (
    primeiroTexto(bounce.message) ||
    primeiroTexto(failed.message) ||
    primeiroTexto(failed.reason) ||
    primeiroTexto(error.message) ||
    primeiroTexto(data.reason) ||
    primeiroTexto(data.message) ||
    null
  );
}

function tag(data: Record<string, unknown>, nome: string) {
  const tags = objeto(data.tags);
  return primeiroTexto(tags[nome]);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;

  if (!webhookSecret || !apiKey) {
    console.error(
      "[RESEND WEBHOOK] RESEND_WEBHOOK_SECRET ou RESEND_API_KEY não configurado."
    );
    return NextResponse.json(
      { ok: false, error: "Webhook não configurado." },
      { status: 503 }
    );
  }

  const payload = await request.text();
  const resend = new Resend(apiKey);

  let event: Record<string, unknown>;

  try {
    event = (await resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") || "",
        timestamp: request.headers.get("svix-timestamp") || "",
        signature: request.headers.get("svix-signature") || "",
      },
      webhookSecret,
    })) as unknown as Record<string, unknown>;
  } catch (error) {
    console.warn("[RESEND WEBHOOK] Assinatura inválida:", error);
    return NextResponse.json(
      { ok: false, error: "Assinatura inválida." },
      { status: 400 }
    );
  }

  const tipo = String(event.type || "");
  if (tipo !== "email.bounced" && tipo !== "email.failed") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = objeto(event.data);
  const resendEmailId = primeiroTexto(data.email_id);
  const tokenIdTag = tag(data, "token_id");
  const empresaIdTag = tag(data, "empresa_id");
  const tipoTag = tag(data, "tipo");
  const destinatarios = Array.isArray(data.to)
    ? data.to.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const email = destinatarios[0] || "";
  const eventId =
    request.headers.get("svix-id") ||
    primeiroTexto(event.id) ||
    null;

  if (tipoTag && tipoTag !== "primeiro_acesso") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let tokenQuery = supabaseAdmin
    .from("primeiro_acesso_tokens")
    .select(
      "id,empresa_id,email,resend_email_id,email_delivery_status,email_failure_notified_at"
    );

  if (resendEmailId) {
    tokenQuery = tokenQuery.eq("resend_email_id", resendEmailId);
  } else if (tokenIdTag) {
    tokenQuery = tokenQuery.eq("id", tokenIdTag);
  } else if (empresaIdTag && email) {
    tokenQuery = tokenQuery
      .eq("empresa_id", empresaIdTag)
      .ilike("email", email)
      .order("created_at", { ascending: false });
  } else {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: token, error: tokenError } = await tokenQuery.limit(1).maybeSingle();

  if (tokenError) {
    console.error("[RESEND WEBHOOK] Erro ao localizar primeiro acesso:", tokenError);
    return NextResponse.json(
      { ok: false, error: "Falha ao localizar primeiro acesso." },
      { status: 500 }
    );
  }

  if (!token) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const status = tipo === "email.bounced" ? "bounced" : "failed";
  const detalhe = extrairDetalheFalha(data);
  const agora = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("primeiro_acesso_tokens")
    .update({
      resend_email_id: resendEmailId || token.resend_email_id || null,
      email_delivery_status: status,
      email_delivery_updated_at: agora,
      email_delivery_event_id: eventId,
      email_delivery_error: detalhe,
      updated_at: agora,
    })
    .eq("id", token.id);

  if (updateError) {
    console.error("[RESEND WEBHOOK] Erro ao registrar falha de entrega:", updateError);
    return NextResponse.json(
      { ok: false, error: "Falha ao registrar evento." },
      { status: 500 }
    );
  }

  if (!token.email_failure_notified_at) {
    try {
      await notificarFalhaEntregaPrimeiroAcesso({
        empresaId: token.empresa_id,
        email: email || token.email,
        status,
        detalhe,
        tokenId: token.id,
        resendEmailId: resendEmailId || token.resend_email_id,
        eventId,
      });
    } catch (error) {
      console.error(
        "[RESEND WEBHOOK] Falha ao notificar administradores sobre primeiro acesso:",
        error
      );
      return NextResponse.json(
        { ok: false, error: "Falha ao acionar contingência." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
