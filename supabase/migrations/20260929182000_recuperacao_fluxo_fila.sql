-- CRM_RECUPERACAO_FLUXO_FILA_V1
-- Permite jobs de recuperação de conversa que ainda não possuem execução/nó,
-- preservando a obrigatoriedade do contexto completo para os jobs normais.

alter table public.fila_processamento_auto
  alter column execucao_id drop not null,
  alter column fluxo_id drop not null,
  alter column no_id drop not null;

alter table public.fila_processamento_auto
  drop constraint if exists fila_processamento_auto_tipo_job_check;

alter table public.fila_processamento_auto
  add constraint fila_processamento_auto_tipo_job_check
  check (
    tipo_job = any (
      array[
        'delay_no'::text,
        'pos_midia'::text,
        'retry_envio_mensagem'::text,
        'arbitragem_hibrida'::text,
        'recuperar_fluxo_conversa'::text
      ]
    )
  );

alter table public.fila_processamento_auto
  drop constraint if exists fila_processamento_auto_contexto_check;

alter table public.fila_processamento_auto
  add constraint fila_processamento_auto_contexto_check
  check (
    tipo_job = 'recuperar_fluxo_conversa'
    or (
      execucao_id is not null
      and fluxo_id is not null
      and no_id is not null
    )
  );

create index if not exists fila_processamento_auto_recuperacao_idx
  on public.fila_processamento_auto (status, executar_em)
  where tipo_job = 'recuperar_fluxo_conversa';
