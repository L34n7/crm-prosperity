export type WhatsAppProfileAvailabilityInput = {
  status?: string | null;
  onboarding_status?: string | null;
  setup_completed_at?: string | null;
  phone_number_id?: string | null;
};

export function isWhatsAppProfileMetaAvailable(
  integration: WhatsAppProfileAvailabilityInput
) {
  const onboardingCompleted =
    integration.onboarding_status === "concluido" ||
    (!!integration.setup_completed_at && integration.status === "ativa");

  return (
    integration.status === "ativa" &&
    onboardingCompleted &&
    !!integration.phone_number_id
  );
}
