alter table public.agentes_ia
  add column if not exists modo_atendimento text not null default 'economico',
  add column if not exists fluxos_ids uuid[] not null default '{}'::uuid[],
  add column if not exists fallback_exclusivo boolean not null default false,
  add column if not exists fallback_tipo text not null default 'nenhum',
  add column if not exists fallback_transferencia_json jsonb not null default '{"escopo_fila":"geral","estrategia_transferencia":"fila_setor","mensagem":"Aguarde que um dos nossos atendentes já vai te responder..."}'::jsonb,
  add column if not exists fallback_sem_contingencia_aceito boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agentes_ia_modo_atendimento_check'
      and conrelid = 'public.agentes_ia'::regclass
  ) then
    alter table public.agentes_ia
      add constraint agentes_ia_modo_atendimento_check
      check (modo_atendimento in ('economico', 'geral'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agentes_ia_fallback_tipo_check'
      and conrelid = 'public.agentes_ia'::regclass
  ) then
    alter table public.agentes_ia
      add constraint agentes_ia_fallback_tipo_check
      check (fallback_tipo in ('fluxo', 'transferir_humano', 'nenhum'));
  end if;
end
$$;

create table if not exists public.agente_ia_gatilhos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  tipo_gatilho text not null default 'palavra_chave',
  valor text,
  condicao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agente_ia_gatilhos_tipo_check check (tipo_gatilho = 'palavra_chave'),
  constraint agente_ia_gatilhos_condicao_check check (condicao in ('exata', 'inicia_com', 'contem', 'regex'))
);

create index if not exists agente_ia_gatilhos_empresa_agente_idx
  on public.agente_ia_gatilhos (empresa_id, agente_id);
create index if not exists agente_ia_gatilhos_empresa_ativo_idx
  on public.agente_ia_gatilhos (empresa_id, ativo);

alter table public.agente_ia_gatilhos enable row level security;

drop policy if exists agente_ia_gatilhos_mesma_empresa on public.agente_ia_gatilhos;
create policy agente_ia_gatilhos_mesma_empresa
on public.agente_ia_gatilhos
for all
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_gatilhos.empresa_id
      and u.status = 'ativo'
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_gatilhos.empresa_id
      and u.status = 'ativo'
  )
);

alter table public.conversas
  add column if not exists agente_ia_id uuid references public.agentes_ia(id) on delete set null,
  add column if not exists agente_ia_protocolo_id uuid references public.conversa_protocolos(id) on delete set null,
  add column if not exists agente_ia_fallback_ativo boolean not null default false;

create index if not exists conversas_agente_ia_idx
  on public.conversas (empresa_id, agente_ia_id)
  where agente_ia_id is not null;
create index if not exists conversas_agente_ia_protocolo_idx
  on public.conversas (empresa_id, agente_ia_protocolo_id)
  where agente_ia_protocolo_id is not null;

update public.agentes_ia
set
  modo_atendimento = 'geral',
  fallback_exclusivo = true,
  fallback_tipo = case when fallback_fluxo_id is not null then 'fluxo' else 'nenhum' end,
  fallback_sem_contingencia_aceito = (fallback_fluxo_id is null),
  updated_at = now()
where status <> 'arquivado';
