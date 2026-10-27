import { Resend } from "resend";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

export const EMAIL_MARKETING_PROVIDER = "resend";
export const EMAIL_MARKETING_DOMAIN = "email.crmprosperity.com";
export const EMAIL_MARKETING_API_KEY_ENV = "RESEND_EMAIL_MARKETING_API_KEY";
export const EMAIL_MARKETING_WEBHOOK_SECRET_ENV =
  "RESEND_EMAIL_MARKETING_WEBHOOK_SECRET";

export async function validarAcessoEmailMarketing() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) {
    return {
      ok: false as const,
      status: contexto.status,
      error: contexto.error,
    };
  }

  const permitido = await can(
    contexto.usuario.id,
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!permitido) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Sem permissão para acessar o E-mail Marketing.",
    };
  }

  return {
    ok: true as const,
    usuario: contexto.usuario,
  };
}

export function emailMarketingResendConfigurado() {
  return Boolean(process.env[EMAIL_MARKETING_API_KEY_ENV]?.trim());
}

export function emailMarketingWebhookConfigurado() {
  return Boolean(process.env[EMAIL_MARKETING_WEBHOOK_SECRET_ENV]?.trim());
}

export function getEmailMarketingResend() {
  const apiKey = process.env[EMAIL_MARKETING_API_KEY_ENV]?.trim();

  if (!apiKey) {
    throw new Error(
      `${EMAIL_MARKETING_API_KEY_ENV} não está configurada no ambiente.`
    );
  }

  return new Resend(apiKey);
}

export function getEmailMarketingWebhookSecret() {
  const secret = process.env[EMAIL_MARKETING_WEBHOOK_SECRET_ENV]?.trim();

  if (!secret) {
    throw new Error(
      `${EMAIL_MARKETING_WEBHOOK_SECRET_ENV} não está configurada no ambiente.`
    );
  }

  return secret;
}
