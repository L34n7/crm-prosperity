create table if not exists public.prosperity_external_api_keys (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default '{}'::text[],
  ativo boolean not null default true,
  ultimo_uso_em timestamptz null,
  expira_em timestamptz null,
  revogado_em timestamptz null,
  created_at timestamptz not null default now(),
  constraint prosperity_external_api_keys_token_hash_check check (length(token_hash) = 64)
);

create index if not exists prosperity_external_api_keys_ativas_idx
  on public.prosperity_external_api_keys (ativo, expira_em)
  where ativo = true;

alter table public.prosperity_external_api_keys enable row level security;
revoke all on table public.prosperity_external_api_keys from anon, authenticated;
grant select, insert, update, delete on table public.prosperity_external_api_keys to service_role;

comment on table public.prosperity_external_api_keys is
  'Chaves hash para consumo autenticado da API externa operacional do CRM Prosperity.';
