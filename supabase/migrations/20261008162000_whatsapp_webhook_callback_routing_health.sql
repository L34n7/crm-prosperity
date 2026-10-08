alter table public.integracoes_whatsapp
  add column if not exists webhook_callback_status text,
  add column if not exists webhook_callback_uri_detectada text,
  add column if not exists webhook_callback_verificada_em timestamptz;
