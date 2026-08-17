create table if not exists public.rotina_automacao_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  evento text not null,
  evento_chave text not null,
  entidade_tipo text,
  entidade_id text,
  status text not null default 'pendente'
    check (status in ('pendente','processando','processado','ignorado','erro')),
  payload_json jsonb not null default '{}'::jsonb,
  erro text,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, evento_chave)
);

alter table public.rotina_automacao_eventos enable row level security;
revoke all on table public.rotina_automacao_eventos from anon, authenticated;
grant select, insert, update, delete on table public.rotina_automacao_eventos to service_role;

drop trigger if exists rotina_automacao_eventos_set_updated_at
  on public.rotina_automacao_eventos;
create trigger rotina_automacao_eventos_set_updated_at
before update on public.rotina_automacao_eventos
for each row execute function public.set_updated_at();

create index if not exists idx_rotina_automacao_eventos_empresa_evento_status
  on public.rotina_automacao_eventos (empresa_id, evento, status, created_at);

create unique index if not exists idx_rotina_automacao_execucoes_automacao_evento_unico
  on public.rotina_automacao_execucoes (automacao_id, evento_chave);
