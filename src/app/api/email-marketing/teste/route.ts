import { NextResponse } from "next/server";
import {
  getEmailMarketingResend,
  validarAcessoEmailMarketing,
} from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function escaparHtml(valor: string) {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(request: Request) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.remetentes");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const body = await request.json().catch(() => null);
  const destinatario = String(body?.email || "").trim().toLowerCase();

  if (!emailValido(destinatario)) {
    return NextResponse.json(
      { ok: false, error: "Informe um e-mail válido para o teste." },
      { status: 400 }
    );
  }

  const [{ data: remetente, error: remetenteError }, { data: supressoes, error: supressaoError }] =
    await Promise.all([
      supabaseAdmin
        .from("email_remetentes")
        .select("id, nome, email, dominio, provider, status")
        .or("empresa_id.eq." + acesso.usuario.empresa_id +
          (acesso.usuario.empresa_id === "4fc69d8c-52e3-4756-aaa1-d86db217c376"
            ? ",and(empresa_id.is.null,escopo.eq.sistema)" : ""))
        .eq("is_default", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("email_suppressions")
        .select("id, motivo")
        .ilike("email", destinatario)
        .limit(1),
    ]);

  if (remetenteError || !remetente) {
    return NextResponse.json(
      {
        ok: false,
        error:
          remetenteError?.message ||
          "Nenhum remetente padrão foi configurado para o E-mail Marketing.",
      },
      { status: 500 }
    );
  }

  if (supressaoError) {
    return NextResponse.json(
      { ok: false, error: supressaoError.message },
      { status: 500 }
    );
  }

  if (supressoes?.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Este endereço está na lista de supressão e não pode receber novos envios.",
      },
      { status: 409 }
    );
  }

  if (remetente.status !== "verificado") {
    return NextResponse.json(
      { ok: false, error: "O domínio remetente ainda não está verificado." },
      { status: 409 }
    );
  }

  const assunto = "[Teste] E-mail Marketing CRM Prosperity";
  const dataHora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const html = `
    <div style="margin:0;padding:32px 16px;background:#f6f8fb;font-family:Arial,sans-serif;color:#172033">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e9f0;border-radius:16px;overflow:hidden">
        <div style="padding:24px 28px;background:#0f509a;color:#ffffff">
          <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85">CRM Prosperity</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25">E-mail Marketing conectado</h1>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.6">Este é um envio de teste do novo módulo de E-mail Marketing.</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#566176">Se esta mensagem chegou normalmente, a API do Resend e o domínio de envio estão funcionando no CRM.</p>
          <div style="margin-top:22px;padding:14px 16px;border-radius:10px;background:#f6f8fb;font-size:13px;color:#566176">
            Remetente: ${escaparHtml(remetente.email)}<br/>
            Teste realizado em: ${escaparHtml(dataHora)}
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    const resend = await getEmailMarketingResend(acesso.usuario.empresa_id!);
    const { data, error } = await resend.emails.send({
      from: `${remetente.nome} <${remetente.email}>`,
      to: [destinatario],
      subject: assunto,
      html,
      text:
        "Este é um envio de teste do novo módulo de E-mail Marketing do CRM Prosperity.",
    });

    if (error || !data?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: error?.message || "O Resend não retornou o ID do envio.",
        },
        { status: 502 }
      );
    }

    const { error: eventoError } = await supabaseAdmin
      .from("email_eventos")
      .insert({
        empresa_id: acesso.usuario.empresa_id || null,
        provider: "resend",
        provider_message_id: data.id,
        tipo: "email.sent",
        destinatario_email: destinatario,
        ocorrido_em: new Date().toISOString(),
        payload_json: {
          origem: "teste_admin",
          assunto,
          remetente_id: remetente.id,
        },
      });

    if (eventoError) {
      console.error(
        "[EMAIL MARKETING] Envio realizado, mas o evento inicial não foi salvo:",
        eventoError
      );
    }

    return NextResponse.json({
      ok: true,
      message: `E-mail de teste enviado para ${destinatario}.`,
      provider_message_id: data.id,
      evento_registrado: !eventoError,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível realizar o envio de teste.",
      },
      { status: 500 }
    );
  }
}
