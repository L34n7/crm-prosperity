alter table public.imovel_leads_portal
  add column if not exists integracao_id uuid null references public.imobiliario_integracoes_webhook(id) on delete set null,
  add column if not exists external_id text null,
  add column if not exists imovel_externo_id uuid null references public.imoveis_externos(id) on delete set null,
  add column if not exists imovel_external_id text null;

create unique index if not exists imovel_leads_portal_integracao_external_uidx
  on public.imovel_leads_portal (integracao_id, external_id)
  where integracao_id is not null
    and external_id is not null
    and btrim(external_id) <> '';

create index if not exists imovel_leads_portal_empresa_imovel_externo_idx
  on public.imovel_leads_portal (empresa_id, imovel_externo_id, recebido_em desc);

create index if not exists imovel_leads_portal_integracao_imovel_external_idx
  on public.imovel_leads_portal (integracao_id, imovel_external_id)
  where integracao_id is not null
    and imovel_external_id is not null
    and btrim(imovel_external_id) <> '';

comment on column public.imovel_leads_portal.integracao_id is
  'Integracao webhook que originou o lead externo.';
comment on column public.imovel_leads_portal.external_id is
  'Identificador do lead no sistema de origem.';
comment on column public.imovel_leads_portal.imovel_externo_id is
  'Imovel externo vinculado ao lead quando recebido por integracao.';
comment on column public.imovel_leads_portal.imovel_external_id is
  'Identificador do imovel no sistema de origem, preservado mesmo se o catalogo ainda nao tiver sido sincronizado.';
