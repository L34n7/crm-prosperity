-- Melhorias consolidadas para os crons avaliados.

-- disparos_agendados
create index if not exists automacao_agendamentos_disparo_pendentes_global_idx
  on public.automacao_agendamentos (executar_em asc, created_at asc)
  where status = 'pendente'
    and tipo_agendamento = 'disparo_template';

create index if not exists automacao_agendamentos_email_pendentes_global_idx
  on public.automacao_agendamentos (executar_em asc, id)
  where status = 'pendente'
    and tipo_agendamento = 'email_lembrete_agendamento';

do $$
begin
  if to_regclass('public.whatsapp_display_name_changes') is not null then
    execute $sql$
      create index if not exists whatsapp_display_name_changes_verificacao_pendente_idx
        on public.whatsapp_display_name_changes (proxima_verificacao_em asc, created_at asc)
        where auto_aplicar = true
          and precisa_registro = true
          and status in (
            'solicitado',
            'em_analise',
            'aguardando_liberacao_meta',
            'erro_verificacao',
            'pronto_para_registro'
          )
    $sql$;
  end if;
end $$;

-- timeout_sem_resposta
alter table public.automacao_agendamentos
  add column if not exists locked_at timestamptz;

alter table public.automacao_agendamentos
  drop constraint if exists automacao_agendamentos_tipo_agendamento_check;

alter table public.automacao_agendamentos
  add constraint automacao_agendamentos_tipo_agendamento_check
  check (
    tipo_agendamento in (
      'disparo_template',
      'timeout_sem_resposta',
      'encerramento_inatividade_fluxo',
      'email_lembrete_agendamento',
      'delay_bloco'
    )
  ) not valid;

create index if not exists automacao_agendamentos_timeout_pendentes_global_idx
  on public.automacao_agendamentos (executar_em asc, id)
  where status = 'pendente'
    and tipo_agendamento in (
      'timeout_sem_resposta',
      'encerramento_inatividade_fluxo',
      'delay_bloco'
    );

create index if not exists automacao_agendamentos_timeout_executando_lock_idx
  on public.automacao_agendamentos (locked_at)
  where status = 'executando'
    and tipo_agendamento in (
      'timeout_sem_resposta',
      'encerramento_inatividade_fluxo',
      'delay_bloco'
    );

update public.automacao_agendamentos
set locked_at = now()
where status = 'executando'
  and locked_at is null
  and tipo_agendamento in (
    'timeout_sem_resposta',
    'encerramento_inatividade_fluxo',
    'delay_bloco'
  );

create or replace function public.reivindicar_automacao_agendamentos_timeout(
  p_limite integer default 50,
  p_lock_timeout_minutos integer default 10
)
returns setof public.automacao_agendamentos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_timeout integer := least(greatest(coalesce(p_lock_timeout_minutos, 10), 1), 60);
  v_lock_expirado timestamptz := now() - make_interval(mins => v_timeout);
begin
  update public.automacao_agendamentos a
  set
    status = 'pendente',
    locked_at = null
  where a.status = 'executando'
    and a.tipo_agendamento in (
      'timeout_sem_resposta',
      'encerramento_inatividade_fluxo',
      'delay_bloco'
    )
    and a.locked_at is not null
    and a.locked_at < v_lock_expirado;

  return query
    with candidatos as (
      select a.id
      from public.automacao_agendamentos a
      where a.status = 'pendente'
        and a.tipo_agendamento in (
          'timeout_sem_resposta',
          'encerramento_inatividade_fluxo',
          'delay_bloco'
        )
        and a.executar_em <= now()
      order by a.executar_em asc, a.id asc
      limit v_limite
      for update skip locked
    ),
    atualizados as (
      update public.automacao_agendamentos a
      set
        status = 'executando',
        locked_at = now()
      from candidatos c
      where a.id = c.id
      returning a.*
    )
    select *
    from atualizados a
    order by a.executar_em asc, a.id asc;
end;
$$;

revoke all
  on function public.reivindicar_automacao_agendamentos_timeout(integer, integer)
  from public;

grant execute
  on function public.reivindicar_automacao_agendamentos_timeout(integer, integer)
  to service_role;

-- whatsapp_coex_history
create index if not exists whatsapp_coex_sync_jobs_history_fallback_idx
  on public.whatsapp_coex_sync_jobs (
    updated_at asc,
    worker_agendado_em asc,
    integracao_whatsapp_id
  )
  where tipo = 'history'
    and status in ('solicitado', 'processando', 'erro');

-- whatsapp_disparos_fila
create index if not exists whatsapp_disparo_itens_fallback_sem_qstash_idx
  on public.whatsapp_disparo_itens (
    (coalesce(next_attempt_at, created_at)),
    created_at,
    campanha_id,
    id
  )
  where status = 'pendente'
    and qstash_message_id is null;
