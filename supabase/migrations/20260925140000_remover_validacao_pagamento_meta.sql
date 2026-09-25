-- Remove a validacao automatica de forma de pagamento da Meta.
-- A consulta de primary_funding_id e restrita pela Meta ao nivel de parceiro/BSP.
-- Mantemos apenas payment_method_added, que ja existia e e usado pelo onboarding.

alter table public.integracoes_whatsapp
  drop constraint if exists integracoes_whatsapp_meta_payment_status_check;

alter table public.integracoes_whatsapp
  drop column if exists meta_payment_status,
  drop column if exists meta_primary_funding_id,
  drop column if exists meta_payment_checked_at,
  drop column if exists meta_payment_check_error;
