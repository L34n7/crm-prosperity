-- Corrige ambiguidade de nomes entre colunas do job e variáveis OUT da função.
-- Sem esta qualificação, o cron conseguia localizar a fila, mas falhava ao
-- reivindicar o job com "column reference integracao_id is ambiguous".

create or replace function public.reivindicar_whatsapp_integracao_desconexao(
  p_job_id uuid default null
)
returns table (
  job_id uuid,
  empresa_id uuid,
  integracao_id uuid,
  usuario_id uuid,
  backup_id uuid,
  tentativas integer,
  max_tentativas integer
)
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_job public.whatsapp_integracao_desconexao_jobs%rowtype;
begin
  select j.*
    into v_job
  from public.whatsapp_integracao_desconexao_jobs j
  where (p_job_id is null or j.id = p_job_id)
    and j.tentativas < j.max_tentativas
    and (
      (j.status in ('pendente', 'erro') and j.next_attempt_at <= now())
      or (
        j.status = 'processando'
        and j.locked_at < now() - interval '10 minutes'
      )
    )
  order by j.next_attempt_at asc, j.created_at asc
  for update skip locked
  limit 1;

  if v_job.id is null then
    return;
  end if;

  update public.whatsapp_integracao_desconexao_jobs as j
  set
    status = 'processando',
    tentativas = j.tentativas + 1,
    locked_at = now(),
    iniciado_em = coalesce(j.iniciado_em, now()),
    erro = null,
    updated_at = now()
  where j.id = v_job.id
  returning
    j.id,
    j.empresa_id,
    j.integracao_id,
    j.usuario_id,
    j.backup_id,
    j.tentativas,
    j.max_tentativas
  into
    job_id,
    empresa_id,
    integracao_id,
    usuario_id,
    backup_id,
    tentativas,
    max_tentativas;

  return next;
end;
$$;

revoke all on function public.reivindicar_whatsapp_integracao_desconexao(uuid)
  from public, anon, authenticated;
grant execute on function public.reivindicar_whatsapp_integracao_desconexao(uuid)
  to service_role;

notify pgrst, 'reload schema';
