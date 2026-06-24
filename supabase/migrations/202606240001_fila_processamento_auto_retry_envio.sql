alter table public.fila_processamento_auto
  drop constraint if exists fila_processamento_auto_tipo_job_check;

alter table public.fila_processamento_auto
  add constraint fila_processamento_auto_tipo_job_check
  check (tipo_job in ('delay_no', 'pos_midia', 'retry_envio_mensagem'));
