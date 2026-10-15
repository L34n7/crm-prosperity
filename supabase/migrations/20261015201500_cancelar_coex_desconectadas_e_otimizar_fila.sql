begin;

create index if not exists whatsapp_coex_historico_abertos_created_idx
  on public.whatsapp_coex_historico_itens (
    integracao_whatsapp_id,
    created_at,
    id
  )
  include (tentativas)
  where status in ('pendente', 'erro');

create index if not exists whatsapp_coex_historico_processando_lock_integracao_idx
  on public.whatsapp_coex_historico_itens (
    integracao_whatsapp_id,
    locked_at
  )
  where status = 'processando';

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
begin
  update public.whatsapp_coex_historico_itens
  set
    status = 'ignorado',
    erro = 'Cancelado automaticamente: integração WhatsApp desconectada.',
    locked_at = null,
    processado_em = coalesce(processado_em, v_agora),
    updated_at = v_agora
  where integracao_whatsapp_id = p_integracao_id
    and status in ('pendente', 'processando', 'erro');

  get diagnostics v_cancelados = row_count;

  update public.whatsapp_coex_sync_jobs
  set
    status = 'recusado_usuario',
    itens_ignorados = itens_ignorados + v_cancelados,
    processamento_progresso = 100,
    worker_qstash_message_id = null,
    worker_agendado_em = null,
    worker_erro = null,
    concluido_em = coalesce(concluido_em, v_agora),
    erro_codigo = null,
    erro_mensagem = 'Fila de histórico cancelada automaticamente porque a integração foi desconectada.',
    updated_at = v_agora
  where integracao_whatsapp_id = p_integracao_id
    and tipo = 'history'
    and status in ('pendente', 'solicitado', 'processando', 'erro');

  return v_cancelados;
end;
$function$;

revoke all on function public.cancelar_whatsapp_coex_fila_integracao(uuid)
  from public, anon, authenticated;
grant execute on function public.cancelar_whatsapp_coex_fila_integracao(uuid)
  to service_role;

create or replace function public.cancelar_whatsapp_coex_ao_desconectar()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.status = 'desconectada'
     and old.status is distinct from new.status then
    perform public.cancelar_whatsapp_coex_fila_integracao(new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists integracoes_whatsapp_cancelar_coex_ao_desconectar
  on public.integracoes_whatsapp;

create trigger integracoes_whatsapp_cancelar_coex_ao_desconectar
after update of status on public.integracoes_whatsapp
for each row
when (new.status = 'desconectada' and old.status is distinct from new.status)
execute function public.cancelar_whatsapp_coex_ao_desconectar();

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
      and integracao.status <> 'desconectada'
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

do $$
declare
  integracao record;
begin
  for integracao in
    select distinct i.id
    from public.integracoes_whatsapp i
    join public.whatsapp_coex_historico_itens h
      on h.integracao_whatsapp_id = i.id
    where i.status = 'desconectada'
      and h.status in ('pendente', 'processando', 'erro')
  loop
    perform public.cancelar_whatsapp_coex_fila_integracao(integracao.id);
  end loop;
end;
$$;

commit;
