create table if not exists public.agenda_disponibilidade_intervalos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agenda_id uuid not null references public.calendarios(id) on delete cascade,
  dia_semana integer not null check (dia_semana between 0 and 6),
  ordem integer not null check (ordem between 0 and 4),
  nome text not null default 'Intervalo' check (char_length(trim(nome)) between 1 and 80),
  hora_inicio time without time zone not null,
  hora_fim time without time zone not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_disponibilidade_intervalos_horario_check check (hora_fim > hora_inicio),
  constraint agenda_disponibilidade_intervalos_agenda_dia_ordem_key unique (agenda_id, dia_semana, ordem)
);

create index if not exists agenda_disponibilidade_intervalos_busca_idx
  on public.agenda_disponibilidade_intervalos (
    empresa_id,
    agenda_id,
    dia_semana,
    ativo,
    hora_inicio,
    hora_fim
  );

drop trigger if exists agenda_disponibilidade_intervalos_set_updated_at
  on public.agenda_disponibilidade_intervalos;
create trigger agenda_disponibilidade_intervalos_set_updated_at
before update on public.agenda_disponibilidade_intervalos
for each row execute function public.agenda_etapa1_set_updated_at();

alter table public.agenda_disponibilidade_intervalos enable row level security;

comment on table public.agenda_disponibilidade_intervalos is
  'Intervalos bloqueados dentro da disponibilidade semanal da agenda, limitados a cinco por dia pela aplicação.';
