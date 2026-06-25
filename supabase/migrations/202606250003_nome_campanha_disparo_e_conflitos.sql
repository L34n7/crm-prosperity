alter table public.whatsapp_disparo_campanhas
  add column if not exists nome text;

create index if not exists whatsapp_disparo_campanhas_empresa_nome_idx
  on public.whatsapp_disparo_campanhas (empresa_id, nome)
  where nome is not null;

create index if not exists whatsapp_disparo_itens_empresa_telefone_created_idx
  on public.whatsapp_disparo_itens (empresa_id, telefone_normalizado, created_at desc);

create index if not exists whatsapp_disparos_logs_empresa_campanha_created_idx
  on public.whatsapp_disparos_logs (empresa_id, campanha_disparo_id, created_at desc)
  where campanha_disparo_id is not null;
