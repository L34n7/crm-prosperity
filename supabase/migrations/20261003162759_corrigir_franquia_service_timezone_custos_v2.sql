-- Corrige o ciclo mensal da franquia Meta Service pelo fuso da empresa
-- e usa a data original de envio como referencia do mes.

create or replace function public.atualizar_whatsapp_service_franquia_resumo_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id uuid;
  v_phone_number_id text;
  v_timezone text;
  v_mes date;
  v_service_gratis bigint;
  v_service_cobrado bigint;
  v_free_entry_point bigint;
begin
  if tg_op in ('UPDATE', 'DELETE')
    and old.pricing_category is not null
    and old.origem <> 'recebida'
    and coalesce(old.status_envio, '') in ('entregue', 'lida')
  then
    select c.empresa_id,
      coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior),
      coalesce(nullif(e.timezone, ''), 'UTC')
    into v_empresa_id, v_phone_number_id, v_timezone
    from public.conversas c
    join public.empresas e on e.id = c.empresa_id
    left join public.integracoes_whatsapp i on i.id = c.integracao_whatsapp_id
    where c.id = old.conversa_id;

    if v_empresa_id is not null and nullif(v_phone_number_id, '') is not null then
      v_mes := date_trunc('month', old.created_at at time zone v_timezone)::date;
      v_service_gratis := case when old.pricing_category = 'service' and old.pricing_type = 'free_customer_service' then 1 else 0 end;
      v_service_cobrado := case when old.pricing_category = 'service' and old.pricing_billable is true then 1 else 0 end;
      v_free_entry_point := case when old.pricing_type = 'free_entry_point' then 1 else 0 end;

      update public.whatsapp_service_franquia_resumo_mensal
      set service_gratis = greatest(service_gratis - v_service_gratis, 0),
          service_cobrado = greatest(service_cobrado - v_service_cobrado, 0),
          free_entry_point = greatest(free_entry_point - v_free_entry_point, 0),
          updated_at = now()
      where empresa_id = v_empresa_id and phone_number_id = v_phone_number_id and mes = v_mes;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.pricing_category is not null
    and new.origem <> 'recebida'
    and coalesce(new.status_envio, '') in ('entregue', 'lida')
  then
    v_empresa_id := null;
    v_phone_number_id := null;
    v_timezone := null;

    select c.empresa_id,
      coalesce(i.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior),
      coalesce(nullif(e.timezone, ''), 'UTC')
    into v_empresa_id, v_phone_number_id, v_timezone
    from public.conversas c
    join public.empresas e on e.id = c.empresa_id
    left join public.integracoes_whatsapp i on i.id = c.integracao_whatsapp_id
    where c.id = new.conversa_id;

    if v_empresa_id is not null and nullif(v_phone_number_id, '') is not null then
      v_mes := date_trunc('month', new.created_at at time zone v_timezone)::date;
      v_service_gratis := case when new.pricing_category = 'service' and new.pricing_type = 'free_customer_service' then 1 else 0 end;
      v_service_cobrado := case when new.pricing_category = 'service' and new.pricing_billable is true then 1 else 0 end;
      v_free_entry_point := case when new.pricing_type = 'free_entry_point' then 1 else 0 end;

      insert into public.whatsapp_service_franquia_resumo_mensal (
        empresa_id, phone_number_id, mes, service_gratis, service_cobrado, free_entry_point, updated_at
      ) values (
        v_empresa_id, v_phone_number_id, v_mes, v_service_gratis, v_service_cobrado, v_free_entry_point, now()
      )
      on conflict (empresa_id, phone_number_id, mes) do update
      set service_gratis = public.whatsapp_service_franquia_resumo_mensal.service_gratis + excluded.service_gratis,
          service_cobrado = public.whatsapp_service_franquia_resumo_mensal.service_cobrado + excluded.service_cobrado,
          free_entry_point = public.whatsapp_service_franquia_resumo_mensal.free_entry_point + excluded.free_entry_point,
          updated_at = excluded.updated_at;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.atualizar_whatsapp_service_franquia_resumo_mensagem()
  from public, anon, authenticated;
grant execute on function public.atualizar_whatsapp_service_franquia_resumo_mensagem()
  to service_role;

create or replace view public.whatsapp_custos_mensais_integracao
with (security_invoker = true)
as
select c.empresa_id,
  c.integracao_whatsapp_id,
  date_trunc('month', m.created_at at time zone coalesce(nullif(e.timezone, ''), 'UTC'))::date as mes,
  count(*) filter (where m.pricing_category = 'service' and m.pricing_type = 'free_customer_service') as service_gratis,
  count(*) filter (where m.pricing_category = 'service' and m.pricing_billable is true) as service_cobrado,
  count(*) filter (where m.pricing_category = 'utility' and m.pricing_billable is true) as utility,
  count(*) filter (where m.pricing_category = 'marketing' and m.pricing_billable is true) as marketing,
  count(*) filter (where m.pricing_category = 'authentication' and m.pricing_billable is true) as authentication,
  count(*) filter (where m.pricing_type = 'free_entry_point') as free_entry_point,
  case when count(*) filter (where m.pricing_billable is true and m.pricing_custo_usd is null) > 0
    then null::numeric else coalesce(sum(m.pricing_custo_usd), 0)::numeric(14,6) end as custo_realizado_usd,
  case when count(*) filter (where m.pricing_billable is true and m.pricing_custo_brl is null) > 0
    then null::numeric else coalesce(sum(m.pricing_custo_brl), 0)::numeric(14,4) end as custo_realizado_brl,
  count(*) filter (where m.pricing_billable is true and m.pricing_custo_brl is null) as tarifas_pendentes
from public.mensagens m
join public.conversas c on c.id = m.conversa_id
join public.empresas e on e.id = c.empresa_id
where m.pricing_category is not null
  and m.origem <> 'recebida'
  and coalesce(m.status_envio, '') in ('entregue', 'lida')
group by c.empresa_id, c.integracao_whatsapp_id,
  date_trunc('month', m.created_at at time zone coalesce(nullif(e.timezone, ''), 'UTC'))::date;

create or replace function public.trg_recalcular_custos_campanha_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.skip_whatsapp_cost_recalc', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.campanha_disparo_id is not null then
      perform public.recalcular_custos_campanha_whatsapp(old.campanha_disparo_id);
    end if;
    return old;
  end if;

  if new.campanha_disparo_id is not null then
    perform public.recalcular_custos_campanha_whatsapp(new.campanha_disparo_id);
  end if;
  if tg_op = 'UPDATE'
    and old.campanha_disparo_id is distinct from new.campanha_disparo_id
    and old.campanha_disparo_id is not null
  then
    perform public.recalcular_custos_campanha_whatsapp(old.campanha_disparo_id);
  end if;
  return new;
end;
$$;
