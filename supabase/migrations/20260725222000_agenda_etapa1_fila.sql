-- Etapas 1 e 3: fila idempotente, planejamento e execução das automações da agenda.

create table if not exists public.agenda_automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agenda_id uuid not null references public.agenda_calendarios(id) on delete cascade,
  agendamento_id uuid not null references public.agenda_agendamentos(id) on delete cascade,
  regra_id uuid references public.agenda_automacao_regras(id) on delete set null,
  tipo text not null check (tipo = any (array[
    'confirmacao'::text,
    'lembrete'::text,
    'aviso_responsavel'::text,
    'pos_atendimento'::text
  ])),
  canal text not null check (canal = any (array[
    'whatsapp'::text,
    'email'::text,
    'sistema'::text,
    'fluxo'::text
  ])),
  chave_idempotencia text not null unique,
  executar_em timestamptz not null,
  status text not null default 'pendente' check (status = any (array[
    'pendente'::text,
    'processando'::text,
    'concluido'::text,
    'cancelado'::text,
    'erro'::text
  ])),
  tentativas integer not null default 0 check (tentativas between 0 and 100),
  max_tentativas integer not null default 5 check (max_tentativas between 1 and 20),
  proxima_tentativa_em timestamptz,
  bloqueado_em timestamptz,
  executado_em timestamptz,
  mensagem_externa_id text,
  erro text,
  payload_json jsonb not null default '{}'::jsonb,
  resultado_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_automacao_execucoes_fila_idx
  on public.agenda_automacao_execucoes(status, executar_em, proxima_tentativa_em)
  where status = 'pendente';
create index if not exists agenda_automacao_execucoes_agendamento_idx
  on public.agenda_automacao_execucoes(empresa_id, agendamento_id, tipo, canal);
create index if not exists agenda_automacao_execucoes_agenda_idx
  on public.agenda_automacao_execucoes(empresa_id, agenda_id, status, executar_em);

alter table public.agenda_automacao_execucoes enable row level security;
