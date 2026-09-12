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
        'mensagem_manual'::text,
        'horario_fluxo'::text
      ]
    )
  ) not valid;

comment on constraint automacao_agendamentos_tipo_agendamento_check
  on public.automacao_agendamentos
  is 'Tipos de agendamento suportados pelo motor de automacoes, incluindo retomada de fluxo por horario de atendimento.';
