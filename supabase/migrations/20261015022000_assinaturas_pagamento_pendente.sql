begin;

alter table public.prosperity_pay_assinaturas
  add column if not exists pending_payment jsonb;

comment on column public.prosperity_pay_assinaturas.pending_payment is
  'Checkout de alteração/renovação ainda válido no gateway. Usado para bloquear mudanças concorrentes até expirar ou o pagamento ser confirmado.';

commit;
