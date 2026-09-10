alter table public.automacao_agendamentos
  drop constraint if exists automacao_agendamentos_tipo_agendamento_check;

alter table public.automacao_agendamentos
  add constraint automacao_agendamentos_tipo_agendamento_check
  check (
    tipo_agendamento = any (
      array[
        'disparo_template'::text,
        'timeout_sem_resposta'::text,
        'encerramento_inatividade_fluxo'::text,
        'email_lembrete_agendamento'::text,
        'delay_bloco'::text,
        'followup_agente_ia'::text,
        'mensagem_manual'::text
      ]
    )
  ) not valid;

create index if not exists idx_automacao_agendamentos_mensagem_manual
  on public.automacao_agendamentos (executar_em, status)
  where tipo_agendamento = 'mensagem_manual';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'whatsapp-agendamentos',
  'whatsapp-agendamentos',
  false,
  52428800
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit;
