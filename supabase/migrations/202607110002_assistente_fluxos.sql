create table if not exists public.automacao_assistente_ia_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid null references public.automacao_fluxos(id) on delete set null,
  usuario_id uuid null references public.usuarios(id) on delete set null,
  modo text not null,
  instrucao text not null,
  contexto_json jsonb null,
  resposta_ia_json jsonb null,
  fluxo_gerado_json jsonb null,
  status text not null default 'processando',
  erro text null,
  aplicada boolean not null default false,
  aplicada_at timestamptz null,
  tokens_entrada bigint null,
  tokens_saida bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automacao_assistente_ia_execucoes_status_check
    check (status in ('processando', 'concluido', 'erro'))
);

create index if not exists automacao_assistente_exec_empresa_created_idx
  on public.automacao_assistente_ia_execucoes (empresa_id, created_at desc);

create index if not exists automacao_assistente_exec_automacao_created_idx
  on public.automacao_assistente_ia_execucoes (automacao_id, created_at desc);

alter table public.automacao_assistente_ia_execucoes enable row level security;

drop policy if exists automacao_assistente_exec_empresa_select
  on public.automacao_assistente_ia_execucoes;

create policy automacao_assistente_exec_empresa_select
  on public.automacao_assistente_ia_execucoes
  for select
  using (
    exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.empresa_id = automacao_assistente_ia_execucoes.empresa_id
        and u.status = 'ativo'
    )
  );

create table if not exists public.automacao_versoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.automacao_fluxos(id) on delete cascade,
  origem text not null default 'manual',
  descricao text null,
  nodes_json jsonb not null,
  edges_json jsonb not null,
  created_by uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists automacao_versoes_empresa_automacao_created_idx
  on public.automacao_versoes (empresa_id, automacao_id, created_at desc);

alter table public.automacao_versoes enable row level security;

drop policy if exists automacao_versoes_empresa_select
  on public.automacao_versoes;

create policy automacao_versoes_empresa_select
  on public.automacao_versoes
  for select
  using (
    exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.empresa_id = automacao_versoes.empresa_id
        and u.status = 'ativo'
    )
  );
