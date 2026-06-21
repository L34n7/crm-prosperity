create table if not exists public.fila_processamento_auto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  execucao_id uuid not null,
  fluxo_id uuid not null,
  conversa_id uuid not null,
  no_id uuid not null,
  tipo_job text not null check (
    tipo_job in ('delay_no', 'pos_midia')
  ),
  status text not null default 'pendente' check (
    status in ('pendente', 'executando', 'executado', 'cancelado', 'erro')
  ),
  executar_em timestamptz not null,
  payload_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  tentativas integer not null default 0 check (tentativas >= 0),
  qstash_message_id text,
  qstash_publicado_at timestamptz,
  locked_at timestamptz,
  executed_at timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fila_processamento_auto_pendentes_idx
  on public.fila_processamento_auto (executar_em asc, created_at asc)
  where status = 'pendente';

create index if not exists fila_processamento_auto_execucao_idx
  on public.fila_processamento_auto (empresa_id, execucao_id, status);

create index if not exists fila_processamento_auto_executando_idx
  on public.fila_processamento_auto (status, locked_at)
  where status = 'executando';

create index if not exists fila_processamento_auto_tipo_status_idx
  on public.fila_processamento_auto (tipo_job, status, executar_em);

comment on table public.fila_processamento_auto is
  'Fila tecnica para pausar e retomar processamentos de automacao sem misturar com agendamentos de negocio.';

comment on column public.fila_processamento_auto.idempotency_key is
  'Chave unica por execucao/no/visita/tipo de job para impedir retomadas duplicadas.';
