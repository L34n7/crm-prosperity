-- Etapas 2 e 3 da agenda: sincronização confiável e bidirecional com Google Calendar.

alter table public.agenda_google_integracoes
  add column if not exists sync_token text,
  add column if not exists channel_id text,
  add column if not exists channel_resource_id text,
  add column if not exists channel_token_hash text,
  add column if not exists channel_expiration_at timestamptz,
  add column if not exists channel_created_at timestamptz,
  add column if not exists ultimo_webhook_em timestamptz,
  add column if not exists ultima_sincronizacao_incremental_em timestamptz,
  add column if not exists ultimo_message_number bigint,
  add column if not exists sync_status text not null default 'pendente',
  add column if not exists ultimo_erro text;

alter table public.agenda_google_eventos
  add column if not exists google_html_link text,
  add column if not exists google_etag text,
  add column if not exists google_updated_at timestamptz,
  add column if not exists crm_updated_at_snapshot timestamptz,
  add column if not exists google_updated_at_snapshot timestamptz,
  add column if not exists ultima_origem text,
  add column if not exists conflito_status text not null default 'sem_conflito',
  add column if not exists conflito_detalhes jsonb,
  add column if not exists last_synced_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agenda_google_integracoes_sync_status_check'
  ) then
    alter table public.agenda_google_integracoes
      add constraint agenda_google_integracoes_sync_status_check
      check (sync_status in ('pendente','sincronizando','ativo','pendente_google','erro','inativo'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agenda_google_eventos_conflito_status_check'
  ) then
    alter table public.agenda_google_eventos
      add constraint agenda_google_eventos_conflito_status_check
      check (conflito_status in ('sem_conflito','resolvido_crm','resolvido_google'));
  end if;
end;
$$;

create unique index if not exists agenda_google_eventos_integracao_evento_uidx
  on public.agenda_google_eventos (integracao_id, google_event_id);

create index if not exists agenda_google_integracoes_canal_idx
  on public.agenda_google_integracoes (channel_id)
  where channel_id is not null;

create index if not exists agenda_google_integracoes_expiracao_idx
  on public.agenda_google_integracoes (channel_expiration_at)
  where sync_ativo = true;

create index if not exists agenda_google_eventos_conflito_idx
  on public.agenda_google_eventos (agenda_id, conflito_status, updated_at desc);

create table if not exists public.agenda_google_sync_fila (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agenda_id uuid not null references public.agenda_calendarios(id) on delete cascade,
  agendamento_id uuid not null,
  operacao text not null default 'upsert',
  status text not null default 'pendente',
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  bloqueado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_google_sync_fila_agendamento_unique unique (agendamento_id),
  constraint agenda_google_sync_fila_status_check
    check (status in ('pendente', 'processando')),
  constraint agenda_google_sync_fila_operacao_check
    check (operacao in ('upsert', 'delete'))
);

create index if not exists agenda_google_sync_fila_processamento_idx
  on public.agenda_google_sync_fila (status, proxima_tentativa_em, created_at);

alter table public.agenda_google_sync_fila enable row level security;

revoke all on table public.agenda_google_sync_fila from anon, authenticated;
grant all on table public.agenda_google_sync_fila to service_role;

create or replace function public.agenda_google_sync_enfileirar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and not (
    old.titulo is distinct from new.titulo or
    old.nome_cliente is distinct from new.nome_cliente or
    old.telefone_cliente is distinct from new.telefone_cliente or
    old.email_cliente is distinct from new.email_cliente or
    old.inicio_at is distinct from new.inicio_at or
    old.fim_at is distinct from new.fim_at or
    old.status is distinct from new.status or
    old.observacoes is distinct from new.observacoes or
    old.local is distinct from new.local or
    old.link_reuniao is distinct from new.link_reuniao
  ) then
    return new;
  end if;

  if exists (
    select 1
      from public.agenda_google_integracoes integracao
     where integracao.empresa_id = new.empresa_id
       and integracao.agenda_id = new.agenda_id
       and integracao.sync_ativo = true
  ) then
    insert into public.agenda_google_sync_fila (
      empresa_id,
      agenda_id,
      agendamento_id,
      operacao,
      status,
      tentativas,
      proxima_tentativa_em,
      bloqueado_em,
      erro,
      updated_at
    )
    values (
      new.empresa_id,
      new.agenda_id,
      new.id,
      'upsert',
      'pendente',
      0,
      now(),
      null,
      null,
      now()
    )
    on conflict (agendamento_id) do update
      set empresa_id = excluded.empresa_id,
          agenda_id = excluded.agenda_id,
          operacao = excluded.operacao,
          status = 'pendente',
          tentativas = 0,
          proxima_tentativa_em = now(),
          bloqueado_em = null,
          erro = null,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agenda_google_sync_enfileirar
  on public.agenda_agendamentos;

create trigger trg_agenda_google_sync_enfileirar
after insert or update
on public.agenda_agendamentos
for each row
execute function public.agenda_google_sync_enfileirar();

create or replace function public.agenda_google_sync_reservar(
  p_limite integer default 30
)
returns table (
  id uuid,
  empresa_id uuid,
  agenda_id uuid,
  agendamento_id uuid,
  operacao text,
  tentativas integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agenda_google_sync_fila fila
     set status = 'pendente',
         bloqueado_em = null,
         updated_at = now()
   where fila.status = 'processando'
     and fila.bloqueado_em < now() - interval '15 minutes';

  return query
  with selecionados as (
    select fila.id
      from public.agenda_google_sync_fila fila
     where fila.status = 'pendente'
       and fila.proxima_tentativa_em <= now()
     order by fila.created_at asc
     for update skip locked
     limit least(greatest(coalesce(p_limite, 30), 1), 100)
  )
  update public.agenda_google_sync_fila fila
     set status = 'processando',
         tentativas = fila.tentativas + 1,
         bloqueado_em = now(),
         updated_at = now()
    from selecionados
   where fila.id = selecionados.id
  returning
    fila.id,
    fila.empresa_id,
    fila.agenda_id,
    fila.agendamento_id,
    fila.operacao,
    fila.tentativas;
end;
$$;

revoke all on function public.agenda_google_sync_reservar(integer) from public;
grant execute on function public.agenda_google_sync_reservar(integer) to service_role;

insert into public.agenda_google_sync_fila (
  empresa_id,
  agenda_id,
  agendamento_id,
  operacao,
  status,
  tentativas,
  proxima_tentativa_em,
  updated_at
)
select
  agendamento.empresa_id,
  agendamento.agenda_id,
  agendamento.id,
  'upsert',
  'pendente',
  0,
  now(),
  now()
from public.agenda_agendamentos agendamento
join public.agenda_google_integracoes integracao
  on integracao.empresa_id = agendamento.empresa_id
 and integracao.agenda_id = agendamento.agenda_id
 and integracao.sync_ativo = true
on conflict (agendamento_id) do update
  set status = 'pendente',
      tentativas = 0,
      proxima_tentativa_em = now(),
      bloqueado_em = null,
      erro = null,
      updated_at = now();

update public.agenda_google_integracoes
   set sync_status = case
     when sync_ativo then 'pendente_google'
     else 'inativo'
   end,
       updated_at = now()
 where sync_status is null
    or sync_status = ''
    or (sync_ativo = true and sync_token is null)
    or (sync_ativo = false and sync_status <> 'inativo');

comment on table public.agenda_google_sync_fila is
  'Fila de alterações do CRM que precisam ser refletidas no Google Calendar.';

comment on column public.agenda_google_integracoes.sync_token is
  'Token da sincronização incremental retornado pelo Google Calendar.';

comment on column public.agenda_google_integracoes.channel_expiration_at is
  'Expiração do canal de push notifications do Google Calendar.';

comment on column public.agenda_google_eventos.conflito_status is
  'Resultado da última resolução de concorrência entre CRM e Google.';
