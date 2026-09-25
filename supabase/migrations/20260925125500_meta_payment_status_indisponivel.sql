alter table public.integracoes_whatsapp
  drop constraint if exists integracoes_whatsapp_meta_payment_status_check;

alter table public.integracoes_whatsapp
  add constraint integracoes_whatsapp_meta_payment_status_check
  check (
    meta_payment_status in (
      'nao_verificado',
      'configurado',
      'nao_configurado',
      'indisponivel',
      'erro'
    )
  );

comment on column public.integracoes_whatsapp.meta_payment_status is
  'Status da verificacao de cobranca da WABA: nao_verificado, configurado, nao_configurado, indisponivel ou erro.';
