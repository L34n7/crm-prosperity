create table if not exists public.mercado_pago_integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conectado_por uuid references public.usuarios(id) on delete set null,
  mercado_pago_user_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  public_key text,
  token_type text not null default 'bearer',
  scope text,
  live_mode boolean not null default false,
  expires_at timestamptz not null,
  status text not null default 'ativa',
  conectado_em timestamptz not null default now(),
  ultimo_refresh_em timestamptz,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercado_pago_integracoes_empresa_id_key unique (empresa_id),
  constraint mercado_pago_integracoes_status_check
    check (status in ('ativa', 'erro', 'revogada'))
);

create index if not exists mercado_pago_integracoes_user_id_idx
  on public.mercado_pago_integracoes (mercado_pago_user_id);

create index if not exists mercado_pago_integracoes_status_idx
  on public.mercado_pago_integracoes (status, expires_at);

alter table public.mercado_pago_integracoes enable row level security;

comment on table public.mercado_pago_integracoes is
  'Credenciais OAuth do Mercado Pago por empresa. Tokens sao armazenados somente de forma criptografada.';

comment on column public.mercado_pago_integracoes.access_token_encrypted is
  'Access Token criptografado com AES-256-GCM no backend.';

comment on column public.mercado_pago_integracoes.refresh_token_encrypted is
  'Refresh Token criptografado com AES-256-GCM no backend.';