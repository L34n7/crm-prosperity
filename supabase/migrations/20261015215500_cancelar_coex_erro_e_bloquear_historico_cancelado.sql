begin;

create or replace function public.cancelar_whatsapp_coex_fila_integracao(
  p_integracao_id uuid
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_cancelados integer := 0;
  v_agora timestamptz := now();
  v_status text;
  v_motivo text;
begin
  select status
    into v_status
  from public.integracoes_whatsapp
  where id = p_integracao_id;

  v_motivo := case
    when v_status = 'desconectada'
      then 'Cancelado automaticamente: integração WhatsApp desconectada.'
    when v_status = 'erro'
      then 'Cancelado automaticamente: integração WhatsApp com status de erro.'
    else 'Cancelado manualmente: importação de conversas não necessária.'
  end;

  update public.whatsapp_coex_historico_itens
  set
    status = 'ignorado',
    erro = v_motivo,
    locked_at = null,
    payload_json = '{}'::jsonb,
    processado_em = coalesce(processado_em, v_agora),
    updated_at = v_agora
  where integracao_whatsapp_id = p_integracao_id
    and status in ('pendente', 'processando', 'erro');

  get diagnostics v_cancelados = row_count;

  update public.whatsapp_coex_sync_jobs
  set
    status = 'recusado_usuario',
    itens_ignorados = coalesce(itens_ignorados, 0) + v_cancelados,
    processamento_progresso = 100,
    worker_qstash_message_id = null,
    worker_agendado_em = null,
    worker_erro = null,
    concluido_em = coalesce(concluido_em, v_agora),
    erro_codigo = null,
    erro_mensagem = v_motivo,
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'history_cancelled_at', v_agora,
      'history_cancel_reason',
        case
          when v_status = 'desconectada' then 'integration_disconnected'
          when v_status = 'erro' then 'integration_error'
          else 'manual'
        end
    ),
    updated_at = v_agora
  where integracao_whatsapp_id = p_integracao_id
    and tipo = 'history'
    and status in ('pendente', 'solicitado', 'processando', 'erro');

  return v_cancelados;
end;
$function$;

create or replace function public.cancelar_whatsapp_coex_ao_inativar()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.status in ('desconectada', 'erro')
     and old.status is distinct from new.status then
    perform public.cancelar_whatsapp_coex_fila_integracao(new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists integracoes_whatsapp_cancelar_coex_ao_desconectar
  on public.integracoes_whatsapp;
drop trigger if exists integracoes_whatsapp_cancelar_coex_ao_inativar
  on public.integracoes_whatsapp;

create trigger integracoes_whatsapp_cancelar_coex_ao_inativar
after update of status on public.integracoes_whatsapp
for each row
when (
  new.status in ('desconectada', 'erro')
  and old.status is distinct from new.status
)
execute function public.cancelar_whatsapp_coex_ao_inativar();

create or replace function public.whatsapp_coex_claim_historico_itens(
  p_integracao_id uuid,
  p_limite integer default 50,
  p_max_tentativas integer default 5,
  p_lock_timeout_minutos integer default 5
)
returns setof public.whatsapp_coex_historico_itens
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200));
  v_max_tentativas integer :=
    greatest(1, least(coalesce(p_max_tentativas, 5), 20));
  v_timeout integer :=
    greatest(1, least(coalesce(p_lock_timeout_minutos, 5), 60));
begin
  if not exists (
    select 1
    from public.integracoes_whatsapp integracao
    where integracao.id = p_integracao_id
      and integracao.status not in ('desconectada', 'erro')
      and coalesce(
        integracao.config_json ->> 'coexistence_sync_mode',
        'contacts_and_history'
      ) <> 'contacts_only'
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.whatsapp_coex_sync_jobs job
    where job.integracao_whatsapp_id = p_integracao_id
      and job.tipo = 'history'
      and job.status = 'recusado_usuario'
  ) then
    return;
  end if;

  update public.whatsapp_coex_historico_itens
  set
    status = 'erro',
    erro = coalesce(
      erro,
      'Lock de processamento expirado; item liberado para nova tentativa.'
    ),
    locked_at = null,
    updated_at = now()
  where integracao_whatsapp_id = p_integracao_id
    and status = 'processando'
    and locked_at < now() - make_interval(mins => v_timeout);

  return query
  with candidatos as (
    select item.id
    from public.whatsapp_coex_historico_itens item
    where item.integracao_whatsapp_id = p_integracao_id
      and item.status in ('pendente', 'erro')
      and item.tentativas < v_max_tentativas
    order by item.created_at asc, item.id asc
    for update skip locked
    limit v_limite
  ),
  atualizados as (
    update public.whatsapp_coex_historico_itens item
    set
      status = 'processando',
      tentativas = item.tentativas + 1,
      erro = null,
      locked_at = now(),
      updated_at = now()
    from candidatos
    where item.id = candidatos.id
    returning item.*
  )
  select *
  from atualizados
  order by created_at asc, id asc;
end;
$function$;

create or replace function public.bloquear_whatsapp_coex_historico_cancelado()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_status text;
  v_sync_mode text;
  v_job_status text;
begin
  select
    integracao.status,
    coalesce(
      integracao.config_json ->> 'coexistence_sync_mode',
      'contacts_and_history'
    )
  into v_status, v_sync_mode
  from public.integracoes_whatsapp integracao
  where integracao.id = new.integracao_whatsapp_id;

  select job.status
    into v_job_status
  from public.whatsapp_coex_sync_jobs job
  where job.integracao_whatsapp_id = new.integracao_whatsapp_id
    and job.tipo = 'history'
  limit 1;

  if v_status in ('desconectada', 'erro')
     or v_sync_mode = 'contacts_only'
     or v_job_status = 'recusado_usuario' then
    new.status := 'ignorado';
    new.erro := case
      when v_status = 'desconectada'
        then 'Histórico ignorado: integração desconectada.'
      when v_status = 'erro'
        then 'Histórico ignorado: integração com status de erro.'
      when v_sync_mode = 'contacts_only'
        then 'Histórico ignorado: configuração definida para importar apenas contatos.'
      else 'Histórico ignorado: importação de conversas cancelada.'
    end;
    new.payload_json := '{}'::jsonb;
    new.locked_at := null;
    new.processado_em := coalesce(new.processado_em, now());
    new.updated_at := now();
  end if;

  return new;
end;
$function$;

drop trigger if exists whatsapp_coex_bloquear_historico_cancelado
  on public.whatsapp_coex_historico_itens;

create trigger whatsapp_coex_bloquear_historico_cancelado
before insert or update of status on public.whatsapp_coex_historico_itens
for each row
execute function public.bloquear_whatsapp_coex_historico_cancelado();

do $$
declare
  integracao record;
begin
  for integracao in
    select distinct i.id
    from public.integracoes_whatsapp i
    join public.whatsapp_coex_historico_itens h
      on h.integracao_whatsapp_id = i.id
    where i.status in ('desconectada', 'erro')
      and h.status in ('pendente', 'processando', 'erro')
  loop
    perform public.cancelar_whatsapp_coex_fila_integracao(integracao.id);
  end loop;
end;
$$;

commit;
