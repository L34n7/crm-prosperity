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
};

export function isAmbienteConfigurado(
  integracao: IntegracaoWhatsappAmbiente | null | undefined
) {
  if (!integracao) return false;

  return (
    integracao.status === "ativa" &&
    integracao.webhook_verificado === true &&
    integracao.onboarding_etapa === "concluido" &&
    integracao.onboarding_status === "concluido" &&
    integracao.phone_registered === true &&
    integracao.app_assigned === true &&
    !!integracao.waba_id &&
    !!integracao.phone_number_id &&
    !!integracao.setup_completed_at
  );
}