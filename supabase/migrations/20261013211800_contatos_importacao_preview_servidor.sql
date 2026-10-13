create table if not exists public.contatos_importacoes_previews (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  arquivo_nome text,
  payload_json jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint contatos_importacoes_previews_total_check check (total >= 0),
  constraint contatos_importacoes_previews_payload_array_check
    check (jsonb_typeof(payload_json) = 'array')
);

create index if not exists contatos_importacoes_previews_empresa_usuario_created_idx
  on public.contatos_importacoes_previews (empresa_id, usuario_id, created_at desc);

create index if not exists contatos_importacoes_previews_expires_idx
  on public.contatos_importacoes_previews (expires_at);

alter table public.contatos_importacoes_previews enable row level security;

revoke all on table public.contatos_importacoes_previews
  from public, anon, authenticated;

grant select, insert, update, delete on table public.contatos_importacoes_previews
  to service_role;
