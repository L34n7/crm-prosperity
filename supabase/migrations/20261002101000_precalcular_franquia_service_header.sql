-- Mantém o contador de franquia Meta Service fora da view pesada de custos.
-- O resumo é incremental por phone_number_id, preservando o consumo quando
-- o mesmo número é reconectado com um novo id de integração.

create table if not exists public.whatsapp_service_franquia_resumo_mensal (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  phone_number_id text not null,
  mes date not null,
  service_gratis bigint not null default 0 check (service_gratis >= 0),
  service_cobrado bigint not null default 0 check (service_cobrado >= 0),
  free_entry_point bigint not null default 0 check (free_entry_point >= 0),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, phone_number_id, mes)
);

create index if not exists whatsapp_service_franquia_resumo_mes_idx
  on public.whatsapp_service_franquia_resumo_mensal (mes, empresa_id);

alter table public.whatsapp_service_franquia_resumo_mensal enable row level security;
revoke all on table public.whatsapp_service_franquia_resumo_mensal
  from anon, authenticated;
grant all on table public.whatsapp_service_franquia_resumo_mensal
  to service_role;

create or replace function public.atualizar_whatsapp_service_franquia_resumo_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id uuid;
  v_phone_number_id text;
  v_mes date;
  v_service_gratis bigint;
  v_service_cobrado bigint;
  v_free_entry_point bigint;
begin
  -- Remove a contribuição anterior em updates/deletes.
  if tg_op in ('UPDATE', 'DELETE')
    and old.pricing_category is not null
    and old.origem <> 'recebida'
    and coalesce(old.status_envio, '') in ('entregue', 'lida')
  then
    select
      c.empresa_id,
      coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior)
    into v_empresa_id, v_phone_number_id
    from public.conversas c
    left join public.integracoes_whatsapp i
      on i.id = c.integracao_whatsapp_id
    where c.id = old.conversa_id;

    if v_empresa_id is not null and nullif(v_phone_number_id, '') is not null then
      v_mes := date_trunc(
        'month',
        coalesce(old.pricing_apurado_em, old.created_at)
      )::date;
      v_service_gratis := case
        when old.pricing_category = 'service'
          and old.pricing_type = 'free_customer_service'
        then 1 else 0 end;
      v_service_cobrado := case
        when old.pricing_category = 'service'
          and old.pricing_billable is true
        then 1 else 0 end;
      v_free_entry_point := case
        when old.pricing_type = 'free_entry_point'
        then 1 else 0 end;

      update public.whatsapp_service_franquia_resumo_mensal
      set
        service_gratis = greatest(service_gratis - v_service_gratis, 0),
        service_cobrado = greatest(service_cobrado - v_service_cobrado, 0),
        free_entry_point = greatest(free_entry_point - v_free_entry_point, 0),
        updated_at = now()
      where empresa_id = v_empresa_id
        and phone_number_id = v_phone_number_id
        and mes = v_mes;
    end if;
  end if;

  -- Adiciona a nova contribuição em inserts/updates.
  if tg_op in ('INSERT', 'UPDATE')
    and new.pricing_category is not null
    and new.origem <> 'recebida'
    and coalesce(new.status_envio, '') in ('entregue', 'lida')
  then
    v_empresa_id := null;
    v_phone_number_id := null;

    select
      c.empresa_id,
      coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior)
    into v_empresa_id, v_phone_number_id
    from public.conversas c
    left join public.integracoes_whatsapp i
      on i.id = c.integracao_whatsapp_id
    where c.id = new.conversa_id;

    if v_empresa_id is not null and nullif(v_phone_number_id, '') is not null then
      v_mes := date_trunc(
        'month',
        coalesce(new.pricing_apurado_em, new.created_at)
      )::date;
      v_service_gratis := case
        when new.pricing_category = 'service'
          and new.pricing_type = 'free_customer_service'
        then 1 else 0 end;
      v_service_cobrado := case
        when new.pricing_category = 'service'
          and new.pricing_billable is true
        then 1 else 0 end;
      v_free_entry_point := case
        when new.pricing_type = 'free_entry_point'
        then 1 else 0 end;

      insert into public.whatsapp_service_franquia_resumo_mensal (
        empresa_id,
        phone_number_id,
        mes,
        service_gratis,
        service_cobrado,
        free_entry_point,
        updated_at
      )
      values (
        v_empresa_id,
        v_phone_number_id,
        v_mes,
        v_service_gratis,
        v_service_cobrado,
        v_free_entry_point,
        now()
      )
      on conflict (empresa_id, phone_number_id, mes) do update
      set
        service_gratis =
          public.whatsapp_service_franquia_resumo_mensal.service_gratis
          + excluded.service_gratis,
        service_cobrado =
          public.whatsapp_service_franquia_resumo_mensal.service_cobrado
          + excluded.service_cobrado,
        free_entry_point =
          public.whatsapp_service_franquia_resumo_mensal.free_entry_point
          + excluded.free_entry_point,
        updated_at = excluded.updated_at;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_whatsapp_service_franquia_resumo_mensagem
  on public.mensagens;

create trigger trg_whatsapp_service_franquia_resumo_mensagem
after insert or delete or update of
  conversa_id,
  origem,
  status_envio,
  pricing_category,
  pricing_type,
  pricing_billable,
  pricing_apurado_em,
  created_at
on public.mensagens
for each row
execute function public.atualizar_whatsapp_service_franquia_resumo_mensagem();

-- O header usa apenas o mês atual. O backfill inicial é deliberadamente
-- limitado ao ciclo atual para evitar uma varredura histórica pesada durante
-- a migration. Meses anteriores continuam disponíveis na view analítica antiga.
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
  c.empresa_id,
  coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior)
    as phone_number_id,
  date_trunc('month', coalesce(m.pricing_apurado_em, m.created_at))::date as mes,
  count(*) filter (
    where m.pricing_category = 'service'
      and m.pricing_type = 'free_customer_service'
  )::bigint as service_gratis,
  count(*) filter (
    where m.pricing_category = 'service'
      and m.pricing_billable is true
  )::bigint as service_cobrado,
  count(*) filter (
    where m.pricing_type = 'free_entry_point'
  )::bigint as free_entry_point,
  now()
from public.mensagens m
join public.conversas c
  on c.id = m.conversa_id
left join public.integracoes_whatsapp i
  on i.id = c.integracao_whatsapp_id
where m.pricing_category is not null
  and m.origem <> 'recebida'
  and coalesce(m.status_envio, '') in ('entregue', 'lida')
  and coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior) is not null
  and coalesce(m.pricing_apurado_em, m.created_at)
      >= date_trunc('month', now())
  and coalesce(m.pricing_apurado_em, m.created_at)
      < date_trunc('month', now()) + interval '1 month'
group by
  c.empresa_id,
  coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior),
  date_trunc('month', coalesce(m.pricing_apurado_em, m.created_at))::date
on conflict (empresa_id, phone_number_id, mes) do update
set
  service_gratis = excluded.service_gratis,
  service_cobrado = excluded.service_cobrado,
  free_entry_point = excluded.free_entry_point,
  updated_at = excluded.updated_at;

comment on table public.whatsapp_service_franquia_resumo_mensal is
  'Resumo incremental da franquia Meta Service por phone_number_id, usado pelo header sem varrer mensagens.';
