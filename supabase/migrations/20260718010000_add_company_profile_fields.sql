alter table public.empresas
  add column if not exists site text null,
  add column if not exists endereco text null,
  add column if not exists cidade text null,
  add column if not exists estado text null;

comment on column public.empresas.site is 'Site institucional da empresa.';
comment on column public.empresas.endereco is 'Endereço comercial da empresa.';
comment on column public.empresas.cidade is 'Cidade da empresa.';
comment on column public.empresas.estado is 'UF da empresa.';
