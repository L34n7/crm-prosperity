-- Permite lembretes por email na fila de agendamentos da automacao.
do $$
declare
  constraint_item record;
begin
  for constraint_item in
    select conname
    from pg_constraint
    where conrelid = 'public.automacao_agendamentos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo_agendamento%'
  loop
    execute format(
      'alter table public.automacao_agendamentos drop constraint if exists %I',
      constraint_item.conname
    );
  end loop;
end $$;

alter table public.automacao_agendamentos
  drop constraint if exists automacao_agendamentos_tipo_agendamento_check;

alter table public.automacao_agendamentos
  add constraint automacao_agendamentos_tipo_agendamento_check
  check (
    tipo_agendamento in (
      'disparo_template',
      'timeout_sem_resposta',
      'encerramento_inatividade_fluxo',
      'email_lembrete_agendamento'
    )
  ) not valid;

create index if not exists automacao_agendamentos_email_lembrete_idx
  on public.automacao_agendamentos (empresa_id, status, executar_em)
  where tipo_agendamento = 'email_lembrete_agendamento';
