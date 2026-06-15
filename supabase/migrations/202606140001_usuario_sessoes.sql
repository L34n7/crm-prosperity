create table if not exists public.usuario_sessoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  auth_user_id uuid,
  client_session_id text not null,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logout_at timestamptz,
  status text not null default 'online',
  ip text,
  user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuario_sessoes_status_check check (status in ('online', 'offline'))
);

create unique index if not exists usuario_sessoes_usuario_client_aberta_idx
  on public.usuario_sessoes (usuario_id, client_session_id)
  where logout_at is null;

create index if not exists usuario_sessoes_empresa_status_seen_idx
  on public.usuario_sessoes (empresa_id, status, last_seen_at desc);

create index if not exists usuario_sessoes_usuario_seen_idx
  on public.usuario_sessoes (usuario_id, last_seen_at desc);

alter table public.usuarios
  add column if not exists ultimo_logout timestamptz;
