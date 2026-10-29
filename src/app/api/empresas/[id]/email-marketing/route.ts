import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptText, encryptText } from "@/lib/security/crypto";
import { buscarIntegracaoEmailMarketing } from "@/lib/email-marketing/admin";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();

function credencialMascarada(
  cifrada: string | null | undefined,
  variavelLegada: string | undefined,
  prefixo: string
) {
  try {
    const valor = cifrada ? decryptText(cifrada) : (variavelLegada?.trim() || null);
    return valor ? prefixo + "••••••••" + valor.slice(-5) : null;
  } catch {
    return null;
  }
}

async function autorizar() {
  const resultado = await getUsuarioContexto({ ignorarAcessoTemporario: true });
  if (!resultado.ok) return { ok: false as const, status: resultado.status };
  if (
    !resultado.usuario.permissoes.includes(PERMISSAO_INTERNA_EMPRESAS) ||
    !resultado.usuario.permissoes.includes("empresas.editar")
  ) return { ok: false as const, status: 403 };
  return { ok: true as const, usuario: resultado.usuario };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await autorizar();
  if (!acesso.ok) return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: acesso.status });
  const { id } = await context.params;
  const { data: empresa } = await supabaseAdmin.from("empresas").select("id").eq("id", id).maybeSingle();
  if (!empresa) return NextResponse.json({ ok: false, error: "Empresa não encontrada." }, { status: 404 });
  const config = await buscarIntegracaoEmailMarketing(id);
  return NextResponse.json({
    ok: true,
    configuracao: {
      habilitado: config?.habilitado || false,
      dominio: config?.dominio || "",
      remetente_nome: config?.remetente_nome || "",
      remetente_email: config?.remetente_email || "",
      api_key_configurada: Boolean(config?.api_key_criptografada || (id === "4fc69d8c-52e3-4756-aaa1-d86db217c376" && process.env.RESEND_EMAIL_MARKETING_API_KEY)),
      webhook_configurado: Boolean(config?.webhook_secret_criptografado || (id === "4fc69d8c-52e3-4756-aaa1-d86db217c376" && process.env.RESEND_EMAIL_MARKETING_WEBHOOK_SECRET)),
      api_key_mascarada: credencialMascarada(
        config?.api_key_criptografada,
        id === "4fc69d8c-52e3-4756-aaa1-d86db217c376"
          ? process.env.RESEND_EMAIL_MARKETING_API_KEY : undefined,
        "re_"
      ),
      webhook_mascarado: credencialMascarada(
        config?.webhook_secret_criptografado,
        id === "4fc69d8c-52e3-4756-aaa1-d86db217c376"
          ? process.env.RESEND_EMAIL_MARKETING_WEBHOOK_SECRET : undefined,
        "whsec_"
      ),
      webhook_url: `https://crmprosperity.com/api/webhooks/email/resend?empresa_id=${encodeURIComponent(id)}`,
    },
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await autorizar();
  if (!acesso.ok) return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: acesso.status });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const habilitado = body?.habilitado === true;
  const dominio = String(body?.dominio || "").trim().toLowerCase();
  const remetenteNome = String(body?.remetente_nome || "").trim();
  const remetenteEmail = String(body?.remetente_email || "").trim().toLowerCase();
  const apiKey = String(body?.api_key || "").trim();
  const webhookSecret = String(body?.webhook_secret || "").trim();

  const { data: empresa } = await supabaseAdmin.from("empresas").select("id").eq("id", id).maybeSingle();
  if (!empresa) return NextResponse.json({ ok: false, error: "Empresa não encontrada." }, { status: 404 });

  const anterior = await buscarIntegracaoEmailMarketing(id);
  const possuiApi = Boolean(apiKey || anterior?.api_key_criptografada ||
    (id === "4fc69d8c-52e3-4756-aaa1-d86db217c376" && process.env.RESEND_EMAIL_MARKETING_API_KEY));
  const possuiWebhook = Boolean(webhookSecret || anterior?.webhook_secret_criptografado ||
    (id === "4fc69d8c-52e3-4756-aaa1-d86db217c376" && process.env.RESEND_EMAIL_MARKETING_WEBHOOK_SECRET));

  if (habilitado && (
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(dominio) ||
    !remetenteNome || !remetenteEmail.endsWith("@" + dominio) ||
    !possuiApi || !possuiWebhook
  )) {
    return NextResponse.json({
      ok: false,
      error: "Para habilitar, informe domínio, nome e e-mail remetente do mesmo domínio, API Key e segredo do webhook.",
    }, { status: 400 });
  }
  if (apiKey && !apiKey.startsWith("re_")) {
    return NextResponse.json({ ok: false, error: "API Key do Resend inválida." }, { status: 400 });
  }
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    return NextResponse.json({ ok: false, error: "Signing Secret do webhook inválido." }, { status: 400 });
  }

  const dados: Record<string, unknown> = {
    empresa_id: id,
    habilitado,
    dominio: dominio || null,
    remetente_nome: remetenteNome || null,
    remetente_email: remetenteEmail || null,
    updated_at: new Date().toISOString(),
  };
  if (apiKey) dados.api_key_criptografada = encryptText(apiKey);
  if (webhookSecret) dados.webhook_secret_criptografado = encryptText(webhookSecret);

  const { error } = await supabaseAdmin
    .from("email_marketing_integracoes")
    .upsert(dados, { onConflict: "empresa_id" });
  if (error) return NextResponse.json({ ok: false, error: "Não foi possível salvar a integração." }, { status: 500 });

  if (habilitado) {
    const { data: sender, error: buscarErro } = await supabaseAdmin
      .from("email_remetentes").select("id").eq("empresa_id", id).eq("is_default", true).maybeSingle();
    if (buscarErro) return NextResponse.json({ ok: false, error: "Integração salva, mas falhou ao consultar o remetente." }, { status: 500 });
    const senderData = {
      nome: remetenteNome,
      email: remetenteEmail,
      dominio,
      status: "verificado",
      provider: "resend",
      escopo: "empresa",
      is_default: true,
      updated_at: new Date().toISOString(),
    };
    const salvar = sender
      ? supabaseAdmin.from("email_remetentes").update(senderData).eq("id", sender.id)
      : supabaseAdmin.from("email_remetentes").insert({ ...senderData, empresa_id: id });
    const { error: senderError } = await salvar;
    if (senderError) return NextResponse.json({ ok: false, error: "Integração salva, mas falhou ao configurar o remetente: " + senderError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: habilitado ? "E-mail Marketing habilitado e configurado." : "E-mail Marketing desabilitado." });
}
