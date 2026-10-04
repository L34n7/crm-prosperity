create table if not exists public.whatsapp_pricing_status_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_whatsapp_id uuid null references public.integracoes_whatsapp(id) on delete set null,
  phone_number_id text not null,
  mensagem_externa_id text not null,
  recipient_id text null,
  status_meta text not null default 'enviada',
  status_rank smallint not null default 1,
  pricing_category text null,
  pricing_type text null,
  pricing_model text null,
  pricing_billable boolean null,
  delivered_at timestamptz null,
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number_id, mensagem_externa_id)
);

create index if not exists idx_whatsapp_pricing_status_eventos_empresa_mes
  on public.whatsapp_pricing_status_eventos (empresa_id, delivered_at, phone_number_id)
  where delivered_at is not null;

create index if not exists idx_whatsapp_pricing_status_eventos_integracao
  on public.whatsapp_pricing_status_eventos (integracao_whatsapp_id, delivered_at)
  where integracao_whatsapp_id is not null;

alter table public.whatsapp_pricing_status_eventos enable row level security;

revoke all on table public.whatsapp_pricing_status_eventos
  from public, anon, authenticated;

grant select, insert, update, delete on table public.whatsapp_pricing_status_eventos
  to service_role;

create or replace function public.registrar_whatsapp_pricing_status_evento(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_phone_number_id text,
  p_mensagem_externa_id text,
  p_recipient_id text,
  p_status_meta text,
  p_event_at timestamptz,
  p_pricing_category text,
  p_pricing_type text,
  p_pricing_model text,
  p_pricing_billable boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text := lower(coalesce(p_status_meta, ''));
  v_rank smallint;
  v_delivery_at timestamptz;
begin
  if nullif(trim(p_phone_number_id), '') is null
     or nullif(trim(p_mensagem_externa_id), '') is null
     or p_empresa_id is null then
    return;
  end if;

  v_rank := case v_status
    when 'sent' then 1
    when 'enviada' then 1
    when 'delivered' then 2
    when 'entregue' then 2
    when 'read' then 3
    when 'lida' then 3
    when 'failed' then 4
    when 'falha' then 4
    else 1
  end;

  v_delivery_at := case
    when v_status in ('delivered','entregue','read','lida')
      then coalesce(p_event_at, now())
    else null
  end;

  insert into public.whatsapp_pricing_status_eventos (
    empresa_id,
    integracao_whatsapp_id,
    phone_number_id,
    mensagem_externa_id,
    recipient_id,
    status_meta,
    status_rank,
    pricing_category,
    pricing_type,
    pricing_model,
    pricing_billable,
    delivered_at,
    last_event_at,
    updated_at
  ) values (
    p_empresa_id,
    p_integracao_id,
    trim(p_phone_number_id),
    trim(p_mensagem_externa_id),
    nullif(trim(coalesce(p_recipient_id, '')), ''),
    coalesce(nullif(v_status, ''), 'enviada'),
    v_rank,
    p_pricing_category,
    p_pricing_type,
    p_pricing_model,
    p_pricing_billable,
    v_delivery_at,
    coalesce(p_event_at, now()),
    now()
  )
  on conflict (phone_number_id, mensagem_externa_id) do update
  set empresa_id = excluded.empresa_id,
      integracao_whatsapp_id = coalesce(excluded.integracao_whatsapp_id, public.whatsapp_pricing_status_eventos.integracao_whatsapp_id),
      recipient_id = coalesce(excluded.recipient_id, public.whatsapp_pricing_status_eventos.recipient_id),
      status_meta = case
        when excluded.status_rank >= public.whatsapp_pricing_status_eventos.status_rank
          then excluded.status_meta
        else public.whatsapp_pricing_status_eventos.status_meta
      end,
      status_rank = greatest(public.whatsapp_pricing_status_eventos.status_rank, excluded.status_rank),
      pricing_category = coalesce(excluded.pricing_category, public.whatsapp_pricing_status_eventos.pricing_category),
      pricing_type = coalesce(excluded.pricing_type, public.whatsapp_pricing_status_eventos.pricing_type),
      pricing_model = coalesce(excluded.pricing_model, public.whatsapp_pricing_status_eventos.pricing_model),
      pricing_billable = coalesce(excluded.pricing_billable, public.whatsapp_pricing_status_eventos.pricing_billable),
      delivered_at = case
        when public.whatsapp_pricing_status_eventos.delivered_at is null then excluded.delivered_at
        when excluded.delivered_at is null then public.whatsapp_pricing_status_eventos.delivered_at
        else least(public.whatsapp_pricing_status_eventos.delivered_at, excluded.delivered_at)
      end,
      last_event_at = greatest(public.whatsapp_pricing_status_eventos.last_event_at, excluded.last_event_at),
      updated_at = now();
end;
$$;

revoke all on function public.registrar_whatsapp_pricing_status_evento(
  uuid, uuid, text, text, text, text, timestamptz, text, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.registrar_whatsapp_pricing_status_evento(
  uuid, uuid, text, text, text, text, timestamptz, text, text, text, boolean
) to service_role;

create or replace function public.atualizar_whatsapp_service_franquia_resumo_pricing_evento()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_mes date;
  v_service_gratis bigint;
  v_service_cobrado bigint;
  v_free_entry_point bigint;
begin
  if tg_op in ('UPDATE','DELETE') and old.delivered_at is not null then
    select coalesce(nullif(timezone, ''), 'UTC')
      into v_timezone
    from public.empresas
    where id = old.empresa_id;

    v_mes := date_trunc('month', old.delivered_at at time zone coalesce(v_timezone,'UTC'))::date;
    v_service_gratis := case
      when old.pricing_category='service'
       and old.pricing_type='free_customer_service'
       and old.pricing_billable is false then 1 else 0 end;
    v_service_cobrado := case
      when old.pricing_category='service'
       and old.pricing_billable is true then 1 else 0 end;
    v_free_entry_point := case
      when old.pricing_type='free_entry_point' then 1 else 0 end;

    update public.whatsapp_service_franquia_resumo_mensal
    set service_gratis = greatest(service_gratis - v_service_gratis, 0),
        service_cobrado = greatest(service_cobrado - v_service_cobrado, 0),
        free_entry_point = greatest(free_entry_point - v_free_entry_point, 0),
        updated_at = now()
    where empresa_id = old.empresa_id
      and phone_number_id = old.phone_number_id
      and mes = v_mes;
  end if;

  if tg_op in ('INSERT','UPDATE') and new.delivered_at is not null then
    select coalesce(nullif(timezone, ''), 'UTC')
      into v_timezone
    from public.empresas
    where id = new.empresa_id;

    v_mes := date_trunc('month', new.delivered_at at time zone coalesce(v_timezone,'UTC'))::date;
    v_service_gratis := case
      when new.pricing_category='service'
       and new.pricing_type='free_customer_service'
       and new.pricing_billable is false then 1 else 0 end;
    v_service_cobrado := case
      when new.pricing_category='service'
       and new.pricing_billable is true then 1 else 0 end;
    v_free_entry_point := case
      when new.pricing_type='free_entry_point' then 1 else 0 end;

    insert into public.whatsapp_service_franquia_resumo_mensal (
      empresa_id,
      phone_number_id,
      mes,
      service_gratis,
      service_cobrado,
      free_entry_point,
      updated_at
    ) values (
      new.empresa_id,
      new.phone_number_id,
      v_mes,
      v_service_gratis,
      v_service_cobrado,
      v_free_entry_point,
      now()
    )
    on conflict (empresa_id, phone_number_id, mes) do update
    set service_gratis = public.whatsapp_service_franquia_resumo_mensal.service_gratis + excluded.service_gratis,
        service_cobrado = public.whatsapp_service_franquia_resumo_mensal.service_cobrado + excluded.service_cobrado,
        free_entry_point = public.whatsapp_service_franquia_resumo_mensal.free_entry_point + excluded.free_entry_point,
        updated_at = excluded.updated_at;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_service_franquia_resumo_mensagem
  on public.mensagens;

drop trigger if exists trg_whatsapp_service_franquia_resumo_pricing_evento
  on public.whatsapp_pricing_status_eventos;

create trigger trg_whatsapp_service_franquia_resumo_pricing_evento
after insert or delete or update of
  empresa_id,
  phone_number_id,
  pricing_category,
  pricing_type,
  pricing_billable,
  delivered_at
on public.whatsapp_pricing_status_eventos
for each row
execute function public.atualizar_whatsapp_service_franquia_resumo_pricing_evento();

with raw_status as (
  select
    v->'metadata'->>'phone_number_id' as phone_number_id,
    s->>'id' as mensagem_externa_id,
    nullif(s->>'recipient_id','') as recipient_id,
    lower(coalesce(s->>'status','sent')) as status_meta,
    case lower(coalesce(s->>'status','sent'))
      when 'sent' then 1
      when 'delivered' then 2
      when 'read' then 3
      when 'failed' then 4
      else 1
    end::smallint as status_rank,
    nullif(s->'pricing'->>'category','') as pricing_category,
    nullif(s->'pricing'->>'type','') as pricing_type,
    nullif(s->'pricing'->>'pricing_model','') as pricing_model,
    case
      when s->'pricing' ? 'billable'
        then (s->'pricing'->>'billable')::boolean
      else null
    end as pricing_billable,
    to_timestamp((s->>'timestamp')::double precision) as event_at
  from public.whatsapp_webhook_eventos w
  cross join lateral jsonb_array_elements(coalesce(w.body_json->'entry','[]'::jsonb)) e
  cross join lateral jsonb_array_elements(coalesce(e->'changes','[]'::jsonb)) ch
  cross join lateral (select ch->'value' as v) value_row
  cross join lateral jsonb_array_elements(coalesce(v->'statuses','[]'::jsonb)) s
  where w.created_at >= timestamptz '2026-10-01 00:00:00+00'
    and s->>'id' is not null
    and v->'metadata'->>'phone_number_id' is not null
    and s->'pricing' is not null
),
normalizado as (
  select
    r.phone_number_id,
    r.mensagem_externa_id,
    (array_agg(r.recipient_id order by r.event_at desc) filter (where r.recipient_id is not null))[1] as recipient_id,
    (array_agg(r.status_meta order by r.status_rank desc, r.event_at desc))[1] as status_meta,
    max(r.status_rank) as status_rank,
    (array_agg(r.pricing_category order by r.event_at desc) filter (where r.pricing_category is not null))[1] as pricing_category,
    (array_agg(r.pricing_type order by r.event_at desc) filter (where r.pricing_type is not null))[1] as pricing_type,
    (array_agg(r.pricing_model order by r.event_at desc) filter (where r.pricing_model is not null))[1] as pricing_model,
    (array_agg(r.pricing_billable order by r.event_at desc) filter (where r.pricing_billable is not null))[1] as pricing_billable,
    min(r.event_at) filter (where r.status_meta in ('delivered','read')) as delivered_at,
    max(r.event_at) as last_event_at
  from raw_status r
  group by r.phone_number_id, r.mensagem_externa_id
),
com_integracao as (
  select
    n.*,
    i.empresa_id,
    i.id as integracao_whatsapp_id
  from normalizado n
  join lateral (
    select iw.id, iw.empresa_id
    from public.integracoes_whatsapp iw
    where iw.phone_number_id = n.phone_number_id
    order by (iw.status='ativa') desc, iw.updated_at desc nulls last, iw.created_at desc
    limit 1
  ) i on true
)
insert into public.whatsapp_pricing_status_eventos (
  empresa_id,
  integracao_whatsapp_id,
  phone_number_id,
  mensagem_externa_id,
  recipient_id,
  status_meta,
  status_rank,
  pricing_category,
  pricing_type,
  pricing_model,
  pricing_billable,
  delivered_at,
  last_event_at,
  created_at,
  updated_at
)
select
  empresa_id,
  integracao_whatsapp_id,
  phone_number_id,
  mensagem_externa_id,
  recipient_id,
  status_meta,
  status_rank,
  pricing_category,
  pricing_type,
  pricing_model,
  pricing_billable,
  delivered_at,
  last_event_at,
  now(),
  now()
from com_integracao
on conflict (phone_number_id, mensagem_externa_id) do update
set empresa_id = excluded.empresa_id,
    integracao_whatsapp_id = excluded.integracao_whatsapp_id,
    recipient_id = coalesce(excluded.recipient_id, public.whatsapp_pricing_status_eventos.recipient_id),
    status_meta = excluded.status_meta,
    status_rank = greatest(public.whatsapp_pricing_status_eventos.status_rank, excluded.status_rank),
    pricing_category = coalesce(excluded.pricing_category, public.whatsapp_pricing_status_eventos.pricing_category),
    pricing_type = coalesce(excluded.pricing_type, public.whatsapp_pricing_status_eventos.pricing_type),
    pricing_model = coalesce(excluded.pricing_model, public.whatsapp_pricing_status_eventos.pricing_model),
    pricing_billable = coalesce(excluded.pricing_billable, public.whatsapp_pricing_status_eventos.pricing_billable),
    delivered_at = case
      when public.whatsapp_pricing_status_eventos.delivered_at is null then excluded.delivered_at
      when excluded.delivered_at is null then public.whatsapp_pricing_status_eventos.delivered_at
      else least(public.whatsapp_pricing_status_eventos.delivered_at, excluded.delivered_at)
    end,
    last_event_at = greatest(public.whatsapp_pricing_status_eventos.last_event_at, excluded.last_event_at),
    updated_at = now();

delete from public.whatsapp_service_franquia_resumo_mensal
where mes >= date '2026-10-01';

insert into public.whatsapp_service_franquia_resumo_mensal (
  empresa_id,
  phone_number_id,
  mes,
  service_gratis,
  service_cobrado,
  free_entry_point,
  updated_at
)
select
  p.empresa_id,
  p.phone_number_id,
  date_trunc(
    'month',
    p.delivered_at at time zone coalesce(nullif(e.timezone,''),'UTC')
  )::date as mes,
  count(*) filter (
    where p.pricing_category='service'
      and p.pricing_type='free_customer_service'
      and p.pricing_billable is false
  ) as service_gratis,
  count(*) filter (
    where p.pricing_category='service'
      and p.pricing_billable is true
  ) as service_cobrado,
  count(*) filter (
    where p.pricing_type='free_entry_point'
  ) as free_entry_point,
  now()
from public.whatsapp_pricing_status_eventos p
join public.empresas e on e.id=p.empresa_id
where p.delivered_at is not null
  and p.delivered_at >= timestamptz '2026-10-01 00:00:00+00'
group by
  p.empresa_id,
  p.phone_number_id,
  date_trunc(
    'month',
    p.delivered_at at time zone coalesce(nullif(e.timezone,''),'UTC')
  )::date;

with raw_status as (
  select
    s->>'id' as mensagem_externa_id,
    max(case lower(coalesce(s->>'status',''))
      when 'read' then 3
      when 'delivered' then 2
      when 'sent' then 1
      else 0
    end) as max_rank
  from public.whatsapp_webhook_eventos w
  cross join lateral jsonb_array_elements(coalesce(w.body_json->'entry','[]'::jsonb)) e
  cross join lateral jsonb_array_elements(coalesce(e->'changes','[]'::jsonb)) ch
  cross join lateral (select ch->'value' as v) value_row
  cross join lateral jsonb_array_elements(coalesce(v->'statuses','[]'::jsonb)) s
  where w.created_at >= timestamptz '2026-10-01 00:00:00+00'
    and s->>'id' is not null
  group by s->>'id'
)
update public.mensagens m
set status_envio = case
      when r.max_rank >= 3 then 'lida'
      when r.max_rank = 2 then 'entregue'
      else m.status_envio
    end,
    updated_at = now()
from raw_status r
where m.mensagem_externa_id = r.mensagem_externa_id
  and m.status_envio in ('pendente','enviada','entregue')
  and (
    (r.max_rank >= 3 and m.status_envio <> 'lida')
    or
    (r.max_rank = 2 and m.status_envio in ('pendente','enviada'))
  );
