create table if not exists public.whatsapp_disparo_campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  template_id uuid not null references public.whatsapp_templates(id) on delete restrict,
  usuario_id uuid references public.usuarios(id) on delete set null,
  origem text not null default 'manual',
  status text not null default 'pendente',
  template_nome text,
  template_idioma text,
  template_categoria text,
  total_itens integer not null default 0,
  total_pendentes integer not null default 0,
  total_processando integer not null default 0,
  total_enviados integer not null default 0,
  total_falhas integer not null default 0,
  total_cancelados integer not null default 0,
  limite_meta integer,
  limite_meta_usados integer,
  limite_meta_restantes integer,
  limite_meta_reserva_ids uuid[] not null default array[]::uuid[],
  processamento_modo text not null default 'qstash',
  qstash_flow_control_key text,
  qstash_publicados integer not null default 0,
  qstash_erro text,
  pausa_motivo text,
  erro text,
  metadata_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  paused_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_disparo_campanhas_status_check
    check (
      status in (
        'pendente',
        'enviando',
        'pausada_por_falhas',
        'pausada_por_lista_invalida',
        'pausada_por_erro_meta',
        'pausada_por_conta_bloqueada',
        'concluida',
        'cancelada',
        'erro'
      )
    )
);

create table if not exists public.whatsapp_disparo_itens (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.whatsapp_disparo_campanhas(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  template_id uuid not null references public.whatsapp_templates(id) on delete restrict,
  usuario_id uuid references public.usuarios(id) on delete set null,
  contato_id uuid references public.contatos(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  conversa_protocolo_id uuid references public.conversa_protocolos(id) on delete set null,
  numero text not null,
  telefone_normalizado text not null,
  nome_contato text,
  variaveis jsonb not null default '[]'::jsonb,
  status text not null default 'pendente',
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 3 check (max_tentativas > 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  message_id text,
  status_http integer,
  erro text,
  erro_codigo_meta integer,
  meta_response jsonb,
  consome_limite_meta boolean not null default false,
  qstash_message_id text,
  qstash_publicado_at timestamptz,
  qstash_flow_control_key text,
  qstash_deduplication_id text,
  qstash_erro text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_disparo_itens_status_check
    check (status in ('pendente', 'processando', 'enviado', 'falha', 'cancelado'))
);

create index if not exists whatsapp_disparo_campanhas_empresa_status_idx
  on public.whatsapp_disparo_campanhas (empresa_id, status, created_at desc);

create index if not exists whatsapp_disparo_campanhas_integracao_status_idx
  on public.whatsapp_disparo_campanhas (integracao_whatsapp_id, status, created_at desc);

create index if not exists whatsapp_disparo_campanhas_usuario_status_idx
  on public.whatsapp_disparo_campanhas (usuario_id, status, created_at desc)
  where usuario_id is not null;

create index if not exists whatsapp_disparo_itens_pendentes_idx
  on public.whatsapp_disparo_itens (next_attempt_at asc, created_at asc)
  where status = 'pendente';

create index if not exists whatsapp_disparo_itens_campanha_status_idx
  on public.whatsapp_disparo_itens (campanha_id, status, created_at);

create index if not exists whatsapp_disparo_itens_message_id_idx
  on public.whatsapp_disparo_itens (message_id)
  where message_id is not null;

create index if not exists whatsapp_disparo_itens_qstash_pendente_idx
  on public.whatsapp_disparo_itens (qstash_publicado_at, created_at)
  where status = 'pendente' and qstash_message_id is null;

alter table public.whatsapp_disparos_logs
  add column if not exists campanha_disparo_id uuid references public.whatsapp_disparo_campanhas(id) on delete set null,
  add column if not exists item_disparo_id uuid references public.whatsapp_disparo_itens(id) on delete set null;

create index if not exists whatsapp_disparos_logs_campanha_disparo_idx
  on public.whatsapp_disparos_logs (campanha_disparo_id, created_at desc)
  where campanha_disparo_id is not null;

alter table public.whatsapp_disparo_campanhas enable row level security;

drop policy if exists whatsapp_disparo_campanhas_usuario_select
  on public.whatsapp_disparo_campanhas;

create policy whatsapp_disparo_campanhas_usuario_select
  on public.whatsapp_disparo_campanhas
  for select
  to authenticated
  using (
    empresa_id = public.usuario_empresa_id_atual()
    and usuario_id = public.usuario_sistema_id_atual()
  );

grant select on public.whatsapp_disparo_campanhas to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_disparo_campanhas'
  ) then
    alter publication supabase_realtime
      add table public.whatsapp_disparo_campanhas;
  end if;
end $$;

create or replace function public.recalcular_whatsapp_disparo_campanha(
  p_campanha_id uuid
)
returns table (
  campanha_id uuid,
  status text,
  total_itens integer,
  total_pendentes integer,
  total_processando integer,
  total_enviados integer,
  total_falhas integer,
  total_cancelados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_total integer;
  v_pendentes integer;
  v_processando integer;
  v_enviados integer;
  v_falhas integer;
  v_cancelados integer;
  v_novo_status text;
  v_finished_at timestamptz;
begin
  select c.status
    into v_status
  from public.whatsapp_disparo_campanhas c
  where c.id = p_campanha_id
  for update;

  if v_status is null then
    return;
  end if;

  select
    count(*)::integer,
    (count(*) filter (where i.status = 'pendente'))::integer,
    (count(*) filter (where i.status = 'processando'))::integer,
    (count(*) filter (where i.status = 'enviado'))::integer,
    (count(*) filter (where i.status = 'falha'))::integer,
    (count(*) filter (where i.status = 'cancelado'))::integer
  into
    v_total,
    v_pendentes,
    v_processando,
    v_enviados,
    v_falhas,
    v_cancelados
  from public.whatsapp_disparo_itens i
  where i.campanha_id = p_campanha_id;

  v_novo_status := v_status;
  v_finished_at := null;

  if v_status in ('pendente', 'enviando')
     and v_pendentes = 0
     and v_processando = 0 then
    v_novo_status := 'concluida';
    v_finished_at := now();
  end if;

  update public.whatsapp_disparo_campanhas c
  set
    status = v_novo_status,
    total_itens = v_total,
    total_pendentes = v_pendentes,
    total_processando = v_processando,
    total_enviados = v_enviados,
    total_falhas = v_falhas,
    total_cancelados = v_cancelados,
    finished_at = coalesce(c.finished_at, v_finished_at),
    updated_at = now()
  where c.id = p_campanha_id;

  return query
    select
      p_campanha_id,
      v_novo_status,
      v_total,
      v_pendentes,
      v_processando,
      v_enviados,
      v_falhas,
      v_cancelados;
end;
$$;

create or replace function public.reivindicar_whatsapp_disparo_itens(
  p_limite integer default 10,
  p_lock_timeout_minutos integer default 5,
  p_apenas_sem_qstash boolean default false
)
returns setof public.whatsapp_disparo_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 100);
  v_timeout integer := least(greatest(coalesce(p_lock_timeout_minutos, 5), 1), 60);
  v_lock_expirado timestamptz := now() - make_interval(mins => v_timeout);
begin
  update public.whatsapp_disparo_itens i
  set
    status = 'pendente',
    locked_at = null,
    next_attempt_at = now() + interval '30 seconds',
    erro = coalesce(i.erro, 'Lock de processamento expirado. Item liberado para nova tentativa.'),
    updated_at = now()
  from public.whatsapp_disparo_campanhas c
  where i.campanha_id = c.id
    and i.status = 'processando'
    and i.locked_at < v_lock_expirado
    and c.status in ('pendente', 'enviando')
    and i.tentativas < i.max_tentativas;

  return query
    with candidatos as (
      select i.id
      from public.whatsapp_disparo_itens i
      join public.whatsapp_disparo_campanhas c on c.id = i.campanha_id
      where i.status = 'pendente'
        and coalesce(i.next_attempt_at, i.created_at) <= now()
        and i.tentativas < i.max_tentativas
        and c.status in ('pendente', 'enviando')
        and (
          not p_apenas_sem_qstash
          or i.qstash_message_id is null
        )
      order by i.next_attempt_at asc, i.created_at asc
      limit v_limite
      for update of i skip locked
    ),
    atualizados as (
      update public.whatsapp_disparo_itens i
      set
        status = 'processando',
        tentativas = i.tentativas + 1,
        locked_at = now(),
        updated_at = now()
      from candidatos c
      where i.id = c.id
      returning i.*
    ),
    campanhas_atualizadas as (
      update public.whatsapp_disparo_campanhas c
      set
        status = 'enviando',
        started_at = coalesce(c.started_at, now()),
        updated_at = now()
      from (select distinct campanha_id from atualizados) a
      where c.id = a.campanha_id
        and c.status = 'pendente'
      returning c.id
    )
    select a.*
    from atualizados a
    left join campanhas_atualizadas c on c.id = a.campanha_id;
end;
$$;

create or replace function public.reivindicar_whatsapp_disparo_item(
  p_item_id uuid
)
returns setof public.whatsapp_disparo_itens
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with candidato as (
      select i.id
      from public.whatsapp_disparo_itens i
      join public.whatsapp_disparo_campanhas c on c.id = i.campanha_id
      where i.id = p_item_id
        and i.status = 'pendente'
        and coalesce(i.next_attempt_at, i.created_at) <= now()
        and i.tentativas < i.max_tentativas
        and c.status in ('pendente', 'enviando')
      limit 1
      for update of i skip locked
    ),
    atualizado as (
      update public.whatsapp_disparo_itens i
      set
        status = 'processando',
        tentativas = i.tentativas + 1,
        locked_at = now(),
        updated_at = now()
      from candidato c
      where i.id = c.id
      returning i.*
    ),
    campanha_atualizada as (
      update public.whatsapp_disparo_campanhas c
      set
        status = 'enviando',
        started_at = coalesce(c.started_at, now()),
        updated_at = now()
      from (select distinct campanha_id from atualizado) a
      where c.id = a.campanha_id
        and c.status = 'pendente'
      returning c.id
    )
    select a.*
    from atualizado a
    left join campanha_atualizada c on c.id = a.campanha_id;
end;
$$;

grant execute on function public.recalcular_whatsapp_disparo_campanha(uuid)
  to authenticated, service_role;

grant execute on function public.reivindicar_whatsapp_disparo_itens(integer, integer, boolean)
  to authenticated, service_role;

grant execute on function public.reivindicar_whatsapp_disparo_item(uuid)
  to authenticated, service_role;
