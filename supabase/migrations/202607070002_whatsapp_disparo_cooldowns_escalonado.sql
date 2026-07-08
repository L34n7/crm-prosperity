alter table public.whatsapp_disparo_cooldowns
  add column if not exists ocorrencias_janela integer not null default 1,
  add column if not exists janela_inicio_em timestamptz not null default now(),
  add column if not exists ultima_ocorrencia_em timestamptz not null default now();

notify pgrst, 'reload schema';
