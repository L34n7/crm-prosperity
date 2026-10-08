alter table public.integracoes_whatsapp
  add column if not exists webhook_ultima_entrega_em timestamptz,
  add column if not exists webhook_assinatura_status text,
  add column if not exists webhook_assinatura_verificada_em timestamptz,
  add column if not exists webhook_assinatura_reparada_em timestamptz,
  add column if not exists webhook_assinatura_erro text;

create index if not exists integracoes_whatsapp_webhook_health_due_idx
  on public.integracoes_whatsapp (webhook_assinatura_verificada_em)
  where provider = 'meta_official' and status = 'ativa';
