import { Resend } from "resend";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptText } from "@/lib/security/crypto";

export const EMAIL_MARKETING_PROVIDER = "resend";
export const EMAIL_MARKETING_DOMAIN = "email.crmprosperity.com";
export const EMAIL_MARKETING_API_KEY_ENV = "RESEND_EMAIL_MARKETING_API_KEY";
export const EMAIL_MARKETING_WEBHOOK_SECRET_ENV =
  "RESEND_EMAIL_MARKETING_WEBHOOK_SECRET";
export const EMAIL_MARKETING_EMPRESA_LEGADA =
  "4fc69d8c-52e3-4756-aaa1-d86db217c376";

const supabaseAdmin = getSupabaseAdmin();

type IntegracaoEmailMarketing = {
  empresa_id: string;
  habilitado: boolean;
  api_key_criptografada: string | null;
  webhook_secret_criptografado: string | null;
  dominio: string | null;
  remetente_nome: string | null;
  remetente_email: string | null;
};

export async function buscarIntegracaoEmailMarketing(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("email_marketing_integracoes")
    .select("empresa_id, habilitado, api_key_criptografada, webhook_secret_criptografado, dominio, remetente_nome, remetente_email")
    .eq("empresa_id", empresaId)
    .maybeSingle<IntegracaoEmailMarketing>();
  if (error) throw new Error("Falha ao consultar E-mail Marketing: " + error.message);
  return data;
}

export async function emailMarketingHabilitado(empresaId: string) {
  const integracao = await buscarIntegracaoEmailMarketing(empresaId);
  return integracao?.habilitado === true;
}

function credencialApi(integracao: IntegracaoEmailMarketing | null, empresaId: string) {
  if (integracao?.api_key_criptografada) {
    return decryptText(integracao.api_key_criptografada);
  }
  if (empresaId === EMAIL_MARKETING_EMPRESA_LEGADA) {
    return process.env[EMAIL_MARKETING_API_KEY_ENV]?.trim() || null;
  }
  return null;
}

function segredoWebhook(integracao: IntegracaoEmailMarketing | null, empresaId: string) {
  if (integracao?.webhook_secret_criptografado) {
    return decryptText(integracao.webhook_secret_criptografado);
  }
  if (empresaId === EMAIL_MARKETING_EMPRESA_LEGADA) {
    return process.env[EMAIL_MARKETING_WEBHOOK_SECRET_ENV]?.trim() || null;
  }
  return null;
}

export async function emailMarketingResendConfigurado(empresaId: string) {
  const integracao = await buscarIntegracaoEmailMarketing(empresaId);
  return Boolean(integracao?.habilitado && credencialApi(integracao, empresaId));
}

export async function emailMarketingWebhookConfigurado(empresaId: string) {
  const integracao = await buscarIntegracaoEmailMarketing(empresaId);
  return Boolean(integracao?.habilitado && segredoWebhook(integracao, empresaId));
}

export async function getEmailMarketingResend(empresaId: string) {
  const integracao = await buscarIntegracaoEmailMarketing(empresaId);
  if (!integracao?.habilitado) {
    throw new Error("O módulo E-mail Marketing está desabilitado para esta empresa.");
  }
  const key = credencialApi(integracao, empresaId);
  if (!key) {
    throw new Error("Configure a API Key do Resend para esta empresa.");
  }
  return new Resend(key);
}

export async function getEmailMarketingWebhookSecret(empresaId: string) {
  const integracao = await buscarIntegracaoEmailMarketing(empresaId);
  // Receber eventos tardios após desabilitar a empresa permanece permitido.
  const secret = segredoWebhook(integracao, empresaId);
  if (!secret) throw new Error("Webhook do Resend não configurado para esta empresa.");
  return secret;
}

export async function validarAcessoEmailMarketing(
  permissao = "email_marketing.visualizar"
) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) {
    return { ok: false as const, status: contexto.status, error: contexto.error };
  }
  if (!contexto.usuario.empresa_id || !contexto.usuario.permissoes.includes(permissao)) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Sem permissão para acessar esta funcionalidade de E-mail Marketing.",
    };
  }
  if (!(await emailMarketingHabilitado(contexto.usuario.empresa_id))) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "E-mail Marketing não está habilitado para esta empresa.",
    };
  }
  return { ok: true as const, usuario: contexto.usuario };
}
