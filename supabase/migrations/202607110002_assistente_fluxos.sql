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

alter table public.automacao_assistente_ia_execucoes
  add column if not exists empresa_id uuid references public.empresas(id) on delete cascade,
  add column if not exists automacao_id uuid references public.automacao_fluxos(id) on delete set null,
  add column if not exists usuario_id uuid references public.usuarios(id) on delete set null,
  add column if not exists modo text,
  add column if not exists instrucao text,
  add column if not exists contexto_json jsonb,
  add column if not exists resposta_ia_json jsonb,
  add column if not exists fluxo_gerado_json jsonb,
  add column if not exists status text default 'processando',
  add column if not exists erro text,
  add column if not exists aplicada boolean default false,
  add column if not exists aplicada_at timestamptz,
  add column if not exists tokens_entrada bigint,
  add column if not exists tokens_saida bigint,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.automacao_assistente_ia_execucoes
  alter column status set default 'processando',
  alter column aplicada set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.automacao_assistente_ia_execucoes
  drop constraint if exists automacao_assistente_ia_execucoes_status_check;

alter table public.automacao_assistente_ia_execucoes
  add constraint automacao_assistente_ia_execucoes_status_check
    check (status in ('processando', 'concluido', 'erro'));

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

alter table public.automacao_versoes
  add column if not exists empresa_id uuid references public.empresas(id) on delete cascade,
  add column if not exists automacao_id uuid references public.automacao_fluxos(id) on delete cascade,
  add column if not exists origem text default 'manual',
  add column if not exists descricao text,
  add column if not exists nodes_json jsonb,
  add column if not exists edges_json jsonb,
  add column if not exists created_by uuid references public.usuarios(id) on delete set null,
  add column if not exists created_at timestamptz default now();

alter table public.automacao_versoes
  alter column origem set default 'manual',
  alter column created_at set default now();

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
