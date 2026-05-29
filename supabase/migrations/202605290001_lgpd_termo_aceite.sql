alter table if exists public.leads_cadastro
  add column if not exists termo_aceite boolean not null default false,
  add column if not exists termo_aceite_em timestamptz,
  add column if not exists termo_aceite_ip text,
  add column if not exists termo_aceite_user_agent text,
  add column if not exists termo_aceite_versao text,
  add column if not exists politica_privacidade_versao text,
  add column if not exists contrato_responsabilidades_versao text,
  add column if not exists termo_aceite_texto text;

alter table if exists public.empresas
  add column if not exists termo_aceite boolean not null default false,
  add column if not exists termo_aceite_em timestamptz,
  add column if not exists termo_aceite_ip text,
  add column if not exists termo_aceite_user_agent text,
  add column if not exists termo_aceite_versao text,
  add column if not exists politica_privacidade_versao text,
  add column if not exists contrato_responsabilidades_versao text,
  add column if not exists termo_aceite_texto text;

comment on column public.leads_cadastro.termo_aceite is
  'Confirma que o lead aceitou os termos, politica de privacidade e contrato de responsabilidades.';
comment on column public.leads_cadastro.termo_aceite_em is
  'Data e hora do aceite informado no cadastro publico.';
comment on column public.empresas.termo_aceite is
  'Confirma que a empresa aceitou os termos, politica de privacidade e contrato de responsabilidades.';
comment on column public.empresas.termo_aceite_em is
  'Data e hora do aceite usado para habilitar a empresa.';
