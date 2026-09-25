alter table public.integracoes_whatsapp
  add column if not exists meta_payment_status text not null default 'nao_verificado',
  add column if not exists meta_primary_funding_id text,
  add column if not exists meta_payment_checked_at timestamptz,
  add column if not exists meta_payment_check_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'integracoes_whatsapp_meta_payment_status_check'
      and conrelid = 'public.integracoes_whatsapp'::regclass
  ) then
    alter table public.integracoes_whatsapp
      add constraint integracoes_whatsapp_meta_payment_status_check
      check (
        meta_payment_status in (
          'nao_verificado',
          'configurado',
          'nao_configurado',
          'erro'
        )
      );
  end if;
end
$$;

comment on column public.integracoes_whatsapp.payment_method_added is
  'Indica se a ultima consulta bem sucedida a WABA retornou primary_funding_id.';

comment on column public.integracoes_whatsapp.meta_payment_status is
  'Status da verificacao de cobranca da WABA: nao_verificado, configurado, nao_configurado ou erro.';

comment on column public.integracoes_whatsapp.meta_primary_funding_id is
  'ID da forma de pagamento principal retornado pela Meta no campo primary_funding_id.';

comment on column public.integracoes_whatsapp.meta_payment_checked_at is
  'Data/hora da ultima tentativa de verificar primary_funding_id na Meta.';

comment on column public.integracoes_whatsapp.meta_payment_check_error is
  'Ultimo erro ao consultar a forma de pagamento na Meta, quando houver.';
