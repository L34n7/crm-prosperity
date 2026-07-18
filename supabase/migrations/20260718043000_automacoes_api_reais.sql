create table if not exists public.integracoes_api_externas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'api_rest',
  base_url text not null,
  token_criptografado text null,
  codigo_empresa text null,
  status text not null default 'nao_testada' check (status in ('nao_testada','ativa','erro','inativa')),
  ultimo_teste_em timestamptz null,
  ultimo_erro text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automacoes_api_rotinas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_id uuid not null references public.integracoes_api_externas(id) on delete cascade,
  nome text not null,
  consulta_chave text not null,
  endpoint text not null,
  metodo text not null default 'GET' check (metodo in ('GET','POST')),
  template_id uuid null references public.whatsapp_templates(id) on delete set null,
  frequencia text not null default 'diaria' check (frequencia in ('diaria','semanal','mensal')),
  horario time not null default '09:00',
  status text not null default 'pausada' check (status in ('ativa','pausada','erro')),
  proxima_execucao_em timestamptz null,
  ultima_execucao_em timestamptz null,
  ultimo_erro text null,
  total_processados bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automacoes_api_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  rotina_id uuid not null references public.automacoes_api_rotinas(id) on delete cascade,
  status text not null check (status in ('sucesso','erro','executando')),
  registros_recebidos integer not null default 0,
  mensagens_enviadas integer not null default 0,
  erro text null,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz null
);

create index if not exists integracoes_api_externas_empresa_idx on public.integracoes_api_externas(empresa_id);
create index if not exists automacoes_api_rotinas_empresa_status_idx on public.automacoes_api_rotinas(empresa_id, status);
create index if not exists automacoes_api_execucoes_empresa_rotina_idx on public.automacoes_api_execucoes(empresa_id, rotina_id, iniciada_em desc);

alter table public.integracoes_api_externas enable row level security;
alter table public.automacoes_api_rotinas enable row level security;
alter table public.automacoes_api_execucoes enable row level security;

comment on table public.integracoes_api_externas is 'Conexoes externas usadas pelas automacoes por API.';
comment on table public.automacoes_api_rotinas is 'Rotinas reais configuradas na pagina automacoes-api.';
comment on table public.automacoes_api_execucoes is 'Historico de execucao das rotinas por API.';