-- Categoria interna por código FIPE, isolada por empresa.
-- Classificação manual é preservada quando o catálogo é consultado novamente.
create table if not exists public.cotacao_veicular_classificacoes_fipe (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_fipe text not null check (tipo_fipe in ('cars','motorcycles','trucks')),
  codigo_fipe text not null check (length(trim(codigo_fipe)) between 3 and 40),
  modelo text not null default '',
  categoria text check (categoria is null or categoria in (
    'motocicleta','auto_leves','app_taxi','especiais','van_utilitario',
    'caminhao_leve','caminhao_pesado','agregado'
  )),
  origem text not null default 'automatica' check (origem in ('automatica','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id,tipo_fipe,codigo_fipe)
);
create index if not exists cotacao_classificacoes_pendentes_idx
  on public.cotacao_veicular_classificacoes_fipe(empresa_id,categoria)
  where categoria is null;
alter table public.cotacao_veicular_classificacoes_fipe enable row level security;
revoke all on public.cotacao_veicular_classificacoes_fipe from public,anon,authenticated;
