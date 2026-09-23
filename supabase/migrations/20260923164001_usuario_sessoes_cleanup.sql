create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create index if not exists usuario_sessoes_client_aberta_idx
  on public.usuario_sessoes (client_session_id)
  where logout_at is null;

create or replace function public.encerrar_sessoes_expiradas()
returns table (
  suporte_encerradas integer,
  sessoes_inativas_encerradas integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_suporte integer := 0;
  v_inativas integer := 0;
begin
  with candidatas as (
    select
      s.id,
      (s.metadata_json->>'expira_em')::timestamptz as expira_em
    from public.usuario_sessoes s
    where s.status = 'online'
      and s.logout_at is null
      and s.metadata_json->>'tipo' = 'acesso_temporario_empresa'
      and nullif(s.metadata_json->>'expira_em', '') is not null
      and (s.metadata_json->>'expira_em')::timestamptz <= now()
  ),
  encerradas as (
    update public.usuario_sessoes s
       set status = 'offline',
           logout_at = c.expira_em,
           updated_at = now(),
           metadata_json = coalesce(s.metadata_json, '{}'::jsonb)
             || jsonb_build_object(
                  'encerrado_em', c.expira_em,
                  'encerrado_motivo', 'expiracao'
                )
      from candidatas c
     where s.id = c.id
     returning 1
  )
  select count(*)::integer
    into v_suporte
    from encerradas;

  with encerradas as (
    update public.usuario_sessoes s
       set status = 'offline',
           logout_at = s.last_seen_at,
           updated_at = now(),
           metadata_json = coalesce(s.metadata_json, '{}'::jsonb)
             || jsonb_build_object(
                  'encerrado_motivo', 'inatividade',
                  'limpeza_em', now()
                )
     where s.status = 'online'
       and s.logout_at is null
       and s.last_seen_at < now() - interval '24 hours'
       and coalesce(s.metadata_json->>'tipo', '') <> 'acesso_temporario_empresa'
     returning 1
  )
  select count(*)::integer
    into v_inativas
    from encerradas;

  return query
  select v_suporte, v_inativas;
end;
$$;

revoke all on function public.encerrar_sessoes_expiradas() from public;
revoke all on function public.encerrar_sessoes_expiradas() from anon;
revoke all on function public.encerrar_sessoes_expiradas() from authenticated;
grant execute on function public.encerrar_sessoes_expiradas() to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'encerrar-sessoes-expiradas'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'encerrar-sessoes-expiradas',
  '*/5 * * * *',
  'select public.encerrar_sessoes_expiradas();'
);

select * from public.encerrar_sessoes_expiradas();
