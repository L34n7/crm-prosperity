begin;

create table if not exists public.prosperity_pay_recursos_agendados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  external_subscription_id text not null,
  addon_code text not null,
  recurso_tipo text not null,
  recurso_id uuid,
  acao text not null,
  status text not null default 'scheduled',
  effective_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prosperity_pay_recursos_agendados_acao_check
    check (acao in ('remove')),
  constraint prosperity_pay_recursos_agendados_status_check
    check (status in ('scheduled','applied','cancelled'))
);

create unique index if not exists prosperity_pay_recursos_agendados_recurso_pendente_uq
  on public.prosperity_pay_recursos_agendados(empresa_id, recurso_tipo, recurso_id, acao)
  where status = 'scheduled' and recurso_id is not null;

create index if not exists prosperity_pay_recursos_agendados_empresa_status_idx
  on public.prosperity_pay_recursos_agendados(empresa_id, status, effective_at);

alter table public.prosperity_pay_recursos_agendados enable row level security;
alter table public.prosperity_pay_recursos_agendados force row level security;

revoke all on table public.prosperity_pay_recursos_agendados from public, anon, authenticated;
grant select, insert, update, delete on table public.prosperity_pay_recursos_agendados to service_role;

commit;
