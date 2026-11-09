-- Condições de contratação independentes das tabelas de mensalidades FIPE.
-- Configurações padrão por empresa e substituições completas por plano.
-- Cotações antigas preservam valores no campo regras_snapshot já existente.
create table if not exists public.cotacao_veicular_taxas_empresa(
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config_json)='object'),
  updated_at timestamptz not null default now()
);
alter table public.cotacao_veicular_taxas_empresa enable row level security;
revoke all on public.cotacao_veicular_taxas_empresa from anon,authenticated;

create table if not exists public.cotacao_veicular_taxas_planos(
  empresa_id uuid not null,
  plano text not null,
  config_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config_json)='object'),
  updated_at timestamptz not null default now(),
  primary key(empresa_id,plano),
  foreign key(empresa_id,plano)
    references public.cotacao_veicular_planos(empresa_id,codigo)
    on delete cascade
);
alter table public.cotacao_veicular_taxas_planos enable row level security;
revoke all on public.cotacao_veicular_taxas_planos from anon,authenticated;
