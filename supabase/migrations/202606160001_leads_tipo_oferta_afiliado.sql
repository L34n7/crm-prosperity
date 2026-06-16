alter table if exists public.leads_cadastro
  drop constraint if exists leads_cadastro_tipo_oferta_check;

alter table if exists public.leads_cadastro
  add constraint leads_cadastro_tipo_oferta_check
  check (tipo_oferta in ('normal', 'vip', 'jv', 'af', 'free'));
