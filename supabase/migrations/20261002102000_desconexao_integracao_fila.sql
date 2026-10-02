-- Desconexão em duas fases:
-- 1) bloqueio operacional + liberação imediata do slot;
-- 2) limpeza pesada em background, reaproveitando a rotina atômica existente.

create table if not exists public.whatsapp_integracao_desconexao_jobs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_id uuid not null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  backup_id uuid references public.integracoes_whatsapp_backups(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'concluido', 'erro')),
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 8 check (max_tentativas >= 1),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  erro text,
  integracao_snapshot jsonb not null,
  posicao_original integer,
  meta_ja_desconectado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integracao_id)
);

create index if not exists whatsapp_integracao_desconexao_jobs_fila_idx
  on public.whatsapp_integracao_desconexao_jobs (
    status,
    next_attempt_at,
    created_at
  )
  where status in ('pendente', 'erro', 'processando');

alter table public.whatsapp_integracao_desconexao_jobs enable row level security;
revoke all on table public.whatsapp_integracao_desconexao_jobs
  from anon, authenticated;
grant all on table public.whatsapp_integracao_desconexao_jobs
  to service_role;

-- Corrige a limpeza legada: desconectar uma integração não pode cancelar
-- execuções do mesmo fluxo que pertencem a outro número.
do $do$
declare
  v_oid oid;
  v_def text;
  v_nova text;
  v_antigo text := E'  select coalesce(array_agg(e.id), ''{}''::uuid[])\n    into v_execucao_ids\n  from public.automacao_execucoes e\n  where e.empresa_id = p_empresa_id\n    and e.fluxo_id = any(v_fluxo_ids)\n    and e.status in (''rodando'', ''aguardando'');';
  v_novo text := E'  select coalesce(array_agg(e.id), ''{}''::uuid[])\n    into v_execucao_ids\n  from public.automacao_execucoes e\n  left join public.conversas c\n    on c.id = e.conversa_id\n   and c.empresa_id = e.empresa_id\n  where e.empresa_id = p_empresa_id\n    and e.fluxo_id = any(v_fluxo_ids)\n    and e.status in (''rodando'', ''aguardando'')\n    and (\n      c.integracao_whatsapp_id = p_integracao_id\n      or coalesce(e.metadata_json, ''{}''::jsonb) ->> ''integracao_whatsapp_id'' = p_integracao_id::text\n    );';
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'backup_e_excluir_integracao_whatsapp'
    and pg_get_function_identity_arguments(p.oid) =
      'p_integracao_id uuid, p_empresa_id uuid, p_usuario_id uuid'
  limit 1;

  if v_oid is null then
    raise exception 'Funcao backup_e_excluir_integracao_whatsapp nao encontrada.';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  if position(v_novo in v_def) > 0 then
    return;
  end if;

  v_nova := replace(v_def, v_antigo, v_novo);

  if v_nova = v_def then
    raise exception 'Bloco de execucoes da desconexao nao localizado.';
  end if;

  execute v_nova;
end
$do$;

create or replace function public.solicitar_desconexao_integracao_whatsapp(
  p_integracao_id uuid,
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_meta_ja_desconectado boolean default false
)
returns table (
  job_id uuid,
  backup_id uuid,
  posicao_liberada integer,
  integracao_nome text,
  numero_original text,
  phone_number_id_original text,
  ja_enfileirada boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_integracao public.integracoes_whatsapp%rowtype;
  v_job public.whatsapp_integracao_desconexao_jobs%rowtype;
  v_backup_id uuid;
  v_snapshot jsonb;
  v_agora timestamptz := now();
begin
  select i.*
    into v_integracao
  from public.integracoes_whatsapp i
  where i.id = p_integracao_id
    and i.empresa_id = p_empresa_id
    and i.provider = 'meta_official'
  for update;

  if v_integracao.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Integracao WhatsApp nao encontrada para a empresa.';
  end if;

  select *
    into v_job
  from public.whatsapp_integracao_desconexao_jobs j
  where j.integracao_id = p_integracao_id
  limit 1;

  if v_job.id is not null then
    return query
    select
      v_job.id,
      v_job.backup_id,
      v_job.posicao_original,
      coalesce(v_job.integracao_snapshot ->> 'nome_conexao', v_integracao.nome_conexao),
      coalesce(v_job.integracao_snapshot ->> 'numero', v_integracao.numero),
      v_job.integracao_snapshot ->> 'phone_number_id',
      true;
    return;
  end if;

  v_snapshot := to_jsonb(v_integracao);

  insert into public.integracoes_whatsapp_backups (
    integracao_id_original,
    empresa_id,
    backup_json,
    contexto_json,
    excluida_por_usuario_id,
    motivo
  )
  values (
    v_integracao.id,
    v_integracao.empresa_id,
    v_snapshot,
    jsonb_build_object(
      'desconexao_fila',
      jsonb_build_object(
        'solicitada_em', v_agora,
        'fase', 'bloqueio_operacional',
        'meta_ja_desconectado', coalesce(p_meta_ja_desconectado, false)
      )
    ),
    p_usuario_id,
    'desconexao_enfileirada'
  )
  returning id into v_backup_id;

  insert into public.whatsapp_integracao_desconexao_jobs (
    empresa_id,
    integracao_id,
    usuario_id,
    backup_id,
    status,
    integracao_snapshot,
    posicao_original,
    meta_ja_desconectado,
    next_attempt_at,
    created_at,
    updated_at
  )
  values (
    p_empresa_id,
    p_integracao_id,
    p_usuario_id,
    v_backup_id,
    'pendente',
    v_snapshot,
    v_integracao.posicao,
    coalesce(p_meta_ja_desconectado, false),
    v_agora,
    v_agora,
    v_agora
  )
  returning * into v_job;

  -- Bloqueia imediatamente novos disparos sem varrer os itens da campanha.
  update public.whatsapp_disparo_campanhas c
  set
    status = 'cancelada',
    pausa_motivo = 'Campanha cancelada porque a integração WhatsApp foi desconectada.',
    erro = null,
    finished_at = coalesce(c.finished_at, v_agora),
    updated_at = v_agora,
    metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'cancelamento_automatico', true,
      'motivo_cancelamento', 'integracao_whatsapp_desconectada',
      'integracao_whatsapp_id', p_integracao_id,
      'cancelado_em', v_agora
    )
  where c.empresa_id = p_empresa_id
    and c.integracao_whatsapp_id = p_integracao_id
    and c.status in ('pendente', 'enviando');

  -- Bloqueia agendamentos novos do número antes da limpeza pesada.
  update public.automacao_agendamentos a
  set
    status = 'cancelado',
    payload_json = coalesce(a.payload_json, '{}'::jsonb) || jsonb_build_object(
      'cancelado_em', v_agora,
      'cancelado_por', p_usuario_id,
      'origem_cancelamento', 'integracao_whatsapp_desconectada_fila'
    )
  where a.empresa_id = p_empresa_id
    and a.tipo_agendamento = 'disparo_template'
    and a.status = 'pendente'
    and a.payload_json ->> 'integracao_whatsapp_id' = p_integracao_id::text;

  -- Libera o slot e o número imediatamente. Credenciais e IDs operacionais
  -- são removidos para que nenhum processo novo consiga enviar por esta linha.
  update public.integracoes_whatsapp
  set
    status = 'desconectada',
    posicao = null,
    numero = 'desconectada_' || p_integracao_id::text,
    business_account_id = null,
    meta_business_id = null,
    business_portfolio_id = null,
    phone_number_id = null,
    waba_id = null,
    token_ref = null,
    webhook_verificado = false,
    phone_registered = false,
    app_assigned = false,
    phone_number_status = 'DISCONNECTED',
    coex_status = case
      when v_integracao.modo_integracao = 'coexistence'
      then 'desconectado'
      else v_integracao.coex_status
    end,
    config_json = jsonb_build_object(
      'desconexao_job_id', v_job.id,
      'desconexao_solicitada_em', v_agora,
      'limpeza_pendente', true
    ),
    updated_at = v_agora
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  return query
  select
    v_job.id,
    v_backup_id,
    v_integracao.posicao,
    v_integracao.nome_conexao,
    v_integracao.numero,
    v_integracao.phone_number_id,
    false;
end;
$$;

revoke all on function public.solicitar_desconexao_integracao_whatsapp(
  uuid, uuid, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.solicitar_desconexao_integracao_whatsapp(
  uuid, uuid, uuid, boolean
) to service_role;

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

  update public.whatsapp_integracao_desconexao_jobs
  set
    status = 'processando',
    tentativas = tentativas + 1,
    locked_at = now(),
    iniciado_em = coalesce(iniciado_em, now()),
    erro = null,
    updated_at = now()
  where id = v_job.id
  returning
    id,
    whatsapp_integracao_desconexao_jobs.empresa_id,
    integracao_id,
    whatsapp_integracao_desconexao_jobs.usuario_id,
    whatsapp_integracao_desconexao_jobs.backup_id,
    whatsapp_integracao_desconexao_jobs.tentativas,
    whatsapp_integracao_desconexao_jobs.max_tentativas
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

create or replace function public.finalizar_whatsapp_integracao_desconexao(
  p_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
set statement_timeout = '240s'
as $$
declare
  v_job public.whatsapp_integracao_desconexao_jobs%rowtype;
  v_phone_number_id text;
  v_backup_temporario uuid;
  v_contexto_temporario jsonb := '{}'::jsonb;
  v_nova_integracao_id uuid;
  v_recuperadas integer := 0;
begin
  select j.*
    into v_job
  from public.whatsapp_integracao_desconexao_jobs j
  where j.id = p_job_id
  for update;

  if v_job.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Job de desconexao nao encontrado.';
  end if;

  if v_job.status = 'concluido' then
    return v_job.backup_id;
  end if;

  v_phone_number_id := nullif(v_job.integracao_snapshot ->> 'phone_number_id', '');

  -- A rotina legada usa phone_number_id para marcar as conversas com o
  -- identificador anterior. Restauramos apenas este campo dentro da mesma
  -- transação; o registro será excluído antes do commit.
  if v_phone_number_id is not null then
    update public.integracoes_whatsapp
    set phone_number_id = v_phone_number_id
    where id = v_job.integracao_id
      and empresa_id = v_job.empresa_id;
  end if;

  if exists (
    select 1
    from public.integracoes_whatsapp i
    where i.id = v_job.integracao_id
      and i.empresa_id = v_job.empresa_id
  ) then
    v_backup_temporario := public.backup_e_excluir_integracao_whatsapp(
      v_job.integracao_id,
      v_job.empresa_id,
      v_job.usuario_id
    );

    if v_backup_temporario is not null
      and v_backup_temporario is distinct from v_job.backup_id
    then
      select coalesce(b.contexto_json, '{}'::jsonb)
        into v_contexto_temporario
      from public.integracoes_whatsapp_backups b
      where b.id = v_backup_temporario;

      update public.integracoes_whatsapp_backups b
      set contexto_json =
        coalesce(b.contexto_json, '{}'::jsonb)
        || jsonb_build_object(
          'limpeza_background',
          jsonb_build_object(
            'concluida_em', now(),
            'job_id', v_job.id,
            'contexto_limpeza', coalesce(v_contexto_temporario, '{}'::jsonb)
          )
        )
      where b.id = v_job.backup_id;

      delete from public.integracoes_whatsapp_backups
      where id = v_backup_temporario;
    end if;
  end if;

  -- Se o usuário já reconectou o mesmo phone_number_id enquanto a limpeza
  -- rodava, recupera agora as conversas que o trigger de ativação ainda não
  -- conseguia ver.
  if v_phone_number_id is not null then
    select i.id
      into v_nova_integracao_id
    from public.integracoes_whatsapp i
    where i.empresa_id = v_job.empresa_id
      and i.provider = 'meta_official'
      and i.status = 'ativa'
      and i.phone_number_id = v_phone_number_id
      and i.id <> v_job.integracao_id
    order by i.updated_at desc, i.created_at desc
    limit 1;

    if v_nova_integracao_id is not null then
      with candidatas as materialized (
        select
          c.id,
          c.contato_id,
          row_number() over (
            partition by c.contato_id
            order by
              c.last_message_at desc nulls last,
              c.updated_at desc,
              c.created_at desc,
              c.id desc
          ) as ordem_contato
        from public.conversas c
        where c.empresa_id = v_job.empresa_id
          and c.integracao_whatsapp_id is null
          and c.integracao_whatsapp_phone_number_id_anterior = v_phone_number_id
      ),
      recuperadas as (
        update public.conversas c
        set
          integracao_whatsapp_id = v_nova_integracao_id,
          updated_at = now()
        from candidatas candidata
        where c.id = candidata.id
          and candidata.ordem_contato = 1
          and not exists (
            select 1
            from public.conversas atual
            where atual.empresa_id = v_job.empresa_id
              and atual.contato_id = c.contato_id
              and atual.integracao_whatsapp_id = v_nova_integracao_id
              and atual.id <> c.id
          )
        returning c.id
      )
      select count(*)::integer
        into v_recuperadas
      from recuperadas;

      update public.integracoes_whatsapp_backups b
      set contexto_json =
        coalesce(b.contexto_json, '{}'::jsonb)
        || jsonb_build_object(
          'recuperacao_conversas',
          jsonb_build_object(
            'nova_integracao_id', v_nova_integracao_id,
            'phone_number_id', v_phone_number_id,
            'quantidade', v_recuperadas,
            'recuperado_em', now(),
            'origem', 'finalizacao_desconexao_background'
          )
        )
      where b.id = v_job.backup_id;
    end if;
  end if;

  update public.whatsapp_integracao_desconexao_jobs
  set
    status = 'concluido',
    locked_at = null,
    next_attempt_at = now(),
    erro = null,
    concluido_em = now(),
    updated_at = now()
  where id = v_job.id;

  return v_job.backup_id;
end;
$$;

revoke all on function public.finalizar_whatsapp_integracao_desconexao(uuid)
  from public, anon, authenticated;
grant execute on function public.finalizar_whatsapp_integracao_desconexao(uuid)
  to service_role;

comment on table public.whatsapp_integracao_desconexao_jobs is
  'Fila persistente para liberar a integração imediatamente e executar a limpeza pesada em background.';

notify pgrst, 'reload schema';
