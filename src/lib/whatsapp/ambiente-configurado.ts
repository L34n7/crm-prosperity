import {
  isCoexistencePhoneReady,
  normalizeWhatsAppIntegrationMode,
} from "@/lib/whatsapp/integration-mode";

export type IntegracaoWhatsappAmbiente = {
  status?: string | null;
  webhook_verificado?: boolean | null;
  onboarding_etapa?: string | null;
  onboarding_status?: string | null;
  setup_completed_at?: string | null;
  phone_registered?: boolean | null;
  app_assigned?: boolean | null;
  waba_id?: string | null;
  phone_number_id?: string | null;
  modo_integracao?: string | null;
  coex_status?: string | null;
  is_on_biz_app?: boolean | null;
  platform_type?: string | null;
};

export function isAmbienteConfigurado(
  integracao: IntegracaoWhatsappAmbiente | null | undefined
) {
  if (!integracao) return false;

  const numeroPronto =
    normalizeWhatsAppIntegrationMode(integracao.modo_integracao) ===
    "coexistence"
      ? isCoexistencePhoneReady(integracao)
      : integracao.phone_registered === true;

  return (
    integracao.status === "ativa" &&
    integracao.webhook_verificado === true &&
    integracao.onboarding_etapa === "concluido" &&
    integracao.onboarding_status === "concluido" &&
    numeroPronto &&
    integracao.app_assigned === true &&
    !!integracao.waba_id &&
    !!integracao.phone_number_id &&
    !!integracao.setup_completed_at
  );
}
