import {
  WHATSAPP_META_BLOCK_HELP_URL,
  WHATSAPP_META_MANAGER_URL,
} from "@/lib/whatsapp/meta-block";

export type MetaErrorBody = {
  error?: {
    message?: string;
    code?: number | string;
    error_subcode?: number | string;
    type?: string;
    fbtrace_id?: string;
    error_data?: {
      details?: string;
    };
    error_user_msg?: string;
  };
};

export type WhatsAppMetaErrorDiagnostic = {
  motivo:
    | "business_account_locked"
    | "payment_error"
    | "recipient_unavailable"
    | "account_temporarily_blocked"
    | "unknown";
  codigoMeta: number | null;
  titulo: string;
  descricao: string;
  detalheTecnico: string | null;
  acaoCliente: string | null;
  acaoInterna: string | null;
  metaManagerUrl: string | null;
  helpWhatsappUrl: string | null;
  bloqueiaOperacao: boolean;
  statusIntegracao?: "erro";
  statusNumeroMeta?: "BANNED";
};

function textoNormalizado(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase();
}

export function extrairErroMeta(body: MetaErrorBody | null | undefined) {
  const erro = body?.error || null;
  const codigo = Number(erro?.code || 0);
  const codigoMeta = Number.isFinite(codigo) && codigo > 0 ? codigo : null;

  const detalheTecnico =
    erro?.error_data?.details?.trim() ||
    erro?.error_user_msg?.trim() ||
    erro?.message?.trim() ||
    null;

  return {
    erro,
    codigoMeta,
    detalheTecnico,
    textoBusca: textoNormalizado(
      [
        erro?.message,
        erro?.error_data?.details,
        erro?.error_user_msg,
        erro?.type,
      ]
        .filter(Boolean)
        .join(" ")
    ),
  };
}

export function diagnosticarErroMetaWhatsapp(
  body: MetaErrorBody | null | undefined,
  fallback?: string
): WhatsAppMetaErrorDiagnostic {
  const { codigoMeta, detalheTecnico, textoBusca } = extrairErroMeta(body);
  const detalhe = detalheTecnico || fallback || null;

  if (
    codigoMeta === 131031 ||
    textoBusca.includes("business account locked") ||
    textoBusca.includes("account locked")
  ) {
    return {
      motivo: "business_account_locked",
      codigoMeta,
      titulo: "Conta WhatsApp Business bloqueada pela Meta",
      descricao:
        "A Meta bloqueou ou desativou a conta WhatsApp Business vinculada a este número. Enquanto o status estiver banido/bloqueado, o CRM não consegue buscar o perfil, alterar dados nem enviar mensagens por esse número.",
      detalheTecnico: detalhe,
      acaoCliente:
        "Acesse o Gerenciador do WhatsApp/Business Support Home da Meta, abra o alerta da conta desativada e solicite uma análise se acreditar que foi um engano.",
      acaoInterna:
        "Pause novos disparos, revise opt-in/lista de contatos e conteudo enviado, e aguarde a decisão da Meta ou conecte outro número aprovado.",
      metaManagerUrl: WHATSAPP_META_MANAGER_URL,
      helpWhatsappUrl: WHATSAPP_META_BLOCK_HELP_URL,
      bloqueiaOperacao: true,
      statusIntegracao: "erro",
      statusNumeroMeta: "BANNED",
    };
  }

  if (
    codigoMeta === 131042 ||
    textoBusca.includes("payment") ||
    textoBusca.includes("billing") ||
    textoBusca.includes("pagamento") ||
    textoBusca.includes("cobranca")
  ) {
    return {
      motivo: "payment_error",
      codigoMeta,
      titulo: "Falha por pendencia financeira na Meta",
      descricao:
        "A conta WhatsApp Business possui pendencia financeira ou metodo de pagamento invalido na Meta.",
      detalheTecnico: detalhe,
      acaoCliente:
        "Acesse Cobranca/Pagamentos no Gerenciador de Negocios da Meta e regularize a conta WhatsApp Business.",
      acaoInterna: null,
      metaManagerUrl: WHATSAPP_META_MANAGER_URL,
      helpWhatsappUrl: null,
      bloqueiaOperacao: true,
    };
  }

  if (codigoMeta === 131026) {
    return {
      motivo: "recipient_unavailable",
      codigoMeta,
      titulo: "Numero indisponivel no WhatsApp",
      descricao:
        "O numero do destinatario pode estar invalido, bloqueado ou indisponivel para receber mensagens pelo WhatsApp.",
      detalheTecnico: detalhe,
      acaoCliente: null,
      acaoInterna: "Revise o telefone do contato antes de reenviar.",
      metaManagerUrl: null,
      helpWhatsappUrl: null,
      bloqueiaOperacao: false,
    };
  }

  if (codigoMeta === 368) {
    return {
      motivo: "account_temporarily_blocked",
      codigoMeta,
      titulo: "Conta temporariamente bloqueada pela Meta",
      descricao:
        "A Meta bloqueou temporariamente o envio de mensagens desta conta WhatsApp.",
      detalheTecnico: detalhe,
      acaoCliente:
        "Verifique os alertas no Gerenciador do WhatsApp e aguarde ou solicite revisao quando a Meta disponibilizar essa opcao.",
      acaoInterna: "Pause disparos ate o bloqueio ser resolvido.",
      metaManagerUrl: WHATSAPP_META_MANAGER_URL,
      helpWhatsappUrl: WHATSAPP_META_BLOCK_HELP_URL,
      bloqueiaOperacao: true,
    };
  }

  return {
    motivo: "unknown",
    codigoMeta,
    titulo: "Falha retornada pela Meta",
    descricao: detalhe || "A Meta retornou uma falha ao processar a solicitacao.",
    detalheTecnico: detalhe,
    acaoCliente: null,
    acaoInterna: null,
    metaManagerUrl: null,
    helpWhatsappUrl: null,
    bloqueiaOperacao: false,
  };
}
