create table if not exists public.usuarios_avisos_confirmados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  aviso_codigo text not null,
  confirmado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint usuarios_avisos_confirmados_usuario_aviso_key
    unique (usuario_id, aviso_codigo)
);

create index if not exists usuarios_avisos_confirmados_empresa_id_idx
  on public.usuarios_avisos_confirmados (empresa_id);

create index if not exists usuarios_avisos_confirmados_aviso_codigo_idx
  on public.usuarios_avisos_confirmados (aviso_codigo);

alter table public.usuarios_avisos_confirmados enable row level security;

revoke all on table public.usuarios_avisos_confirmados from anon, authenticated;
grant select, insert, update, delete on table public.usuarios_avisos_confirmados to service_role;

comment on table public.usuarios_avisos_confirmados is
  'Registra a ciencia individual de avisos obrigatorios exibidos no CRM.';
comment on column public.usuarios_avisos_confirmados.aviso_codigo is
  'Identificador estavel do aviso confirmado pelo usuario.';
