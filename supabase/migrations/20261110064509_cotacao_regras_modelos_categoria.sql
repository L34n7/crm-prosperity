-- Classificação comercial de famílias de modelos para todas as versões/anos FIPE.
-- Mantém os códigos FIPE e suas classificações individuais independentes.
create table if not exists public.cotacao_veicular_regras_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_fipe text not null check(tipo_fipe in ('cars','motorcycles','trucks')),
  marca text not null check(length(btrim(marca)) between 2 and 80),
  modelo text not null check(length(btrim(modelo)) between 2 and 100),
  marca_chave text not null check(length(btrim(marca_chave)) between 2 and 80),
  modelo_chave text not null check(length(btrim(modelo_chave)) between 2 and 100),
  categoria text not null check(
    (tipo_fipe='cars' and categoria in ('auto_leves','van_utilitario','app_taxi','especiais'))
    or (tipo_fipe='motorcycles' and categoria='motocicleta')
    or (tipo_fipe='trucks' and categoria in ('caminhao_leve','caminhao_pesado','agregado'))
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id,tipo_fipe,marca_chave,modelo_chave)
);
create index if not exists cotacao_regras_modelos_empresa_tipo_idx
  on public.cotacao_veicular_regras_modelos(empresa_id,tipo_fipe);
alter table public.cotacao_veicular_regras_modelos enable row level security;
revoke all on public.cotacao_veicular_regras_modelos from public,anon,authenticated;
grant select,insert,update,delete on public.cotacao_veicular_regras_modelos to service_role;
