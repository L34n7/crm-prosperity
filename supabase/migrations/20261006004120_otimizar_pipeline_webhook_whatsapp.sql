create or replace function public.registrar_whatsapp_webhook_evento(
  p_body_hash text,
  p_body_json jsonb,
  p_metadata_json jsonb,
  p_received_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_evento public.whatsapp_webhook_eventos%rowtype;
  v_duplicado boolean := false;
  v_hash text := nullif(trim(coalesce(p_body_hash, '')), '');
  v_recebido_em timestamptz := coalesce(p_received_at, now());
begin
  if v_hash is null then
    raise exception 'body_hash obrigatorio';
  end if;

  insert into public.whatsapp_webhook_eventos (
    body_hash,
    body_json,
    metadata_json,
    status,
    updated_at
  )
  values (
    v_hash,
    coalesce(p_body_json, '{}'::jsonb),
    coalesce(p_metadata_json, '{}'::jsonb),
    'pendente',
    v_recebido_em
  )
  on conflict (body_hash) do nothing
  returning * into v_evento;

  if not found then
    v_duplicado := true;

    select *
      into v_evento
    from public.whatsapp_webhook_eventos
    where body_hash = v_hash
    limit 1;
  end if;

  if v_evento.id is null then
    raise exception 'evento webhook nao encontrado apos dedupe';
  end if;

  return jsonb_build_object(
    'evento', to_jsonb(v_evento),
    'duplicado', v_duplicado
  );
end;
$$;

revoke execute on function public.registrar_whatsapp_webhook_evento(text, jsonb, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.registrar_whatsapp_webhook_evento(text, jsonb, jsonb, timestamptz)
to service_role;


create or replace function public.claim_whatsapp_webhook_evento(
  p_evento_id uuid,
  p_max_tentativas integer default 5
)
returns setof public.whatsapp_webhook_eventos
language sql
security invoker
set search_path = public
as $$
  update public.whatsapp_webhook_eventos
  set
    status = 'processando',
    tentativas = tentativas + 1,
    locked_at = now(),
    erro = null,
    updated_at = now()
  where id = p_evento_id
    and status in ('pendente', 'erro')
    and tentativas < greatest(1, least(coalesce(p_max_tentativas, 5), 20))
  returning *;
$$;

revoke execute on function public.claim_whatsapp_webhook_evento(uuid, integer)
from public, anon, authenticated;
grant execute on function public.claim_whatsapp_webhook_evento(uuid, integer)
to service_role;


create or replace function public.avaliar_whatsapp_service_status_evento(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_phone_number_id text,
  p_status_meta text,
  p_pricing_category text,
  p_pricing_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status_meta, '')));
  v_categoria text := lower(trim(coalesce(p_pricing_category, '')));
  v_tipo text := lower(trim(coalesce(p_pricing_type, '')));
  v_phone_number_id text := nullif(trim(coalesce(p_phone_number_id, '')), '');
  v_timezone text := 'UTC';
  v_mes date;
  v_service_gratis bigint := 0;
  v_service_cobrado bigint := 0;
  v_service_total bigint := 0;
  v_pausar_automacoes boolean := false;
  v_limite_extra integer := 0;
  v_limite_total integer := 1000;
  v_bloqueado boolean := false;
  v_bloqueio_aplicado_agora boolean := false;
  v_alerta_percentual smallint;
  v_alerta_id uuid;
begin
  if p_empresa_id is null
     or p_integracao_id is null
     or v_phone_number_id is null
     or v_categoria <> 'service'
     or v_status not in ('delivered', 'entregue', 'read', 'lida') then
    return jsonb_build_object(
      'processado', false,
      'limite_ativo', false,
      'bloqueado', false,
      'bloqueio_aplicado_agora', false,
      'alerta_id', null,
      'alerta_percentual', null
    );
  end if;

  select coalesce(nullif(trim(e.timezone), ''), 'UTC')
    into v_timezone
  from public.empresas e
  where e.id = p_empresa_id;

  v_timezone := coalesce(nullif(v_timezone, ''), 'UTC');

  begin
    v_mes := date_trunc('month', now() at time zone v_timezone)::date;
  exception
    when others then
      v_timezone := 'UTC';
      v_mes := date_trunc('month', now() at time zone 'UTC')::date;
  end;

  select
    least(1000::bigint, greatest(coalesce(r.service_gratis, 0), 0)),
    greatest(coalesce(r.service_cobrado, 0), 0)
  into
    v_service_gratis,
    v_service_cobrado
  from public.whatsapp_service_franquia_resumo_mensal r
  where r.empresa_id = p_empresa_id
    and r.phone_number_id = v_phone_number_id
    and r.mes = v_mes;

  v_service_gratis := coalesce(v_service_gratis, 0);
  v_service_cobrado := coalesce(v_service_cobrado, 0);
  v_service_total := v_service_gratis + v_service_cobrado;

  select
    coalesce(l.pausar_automacoes, false),
    greatest(coalesce(l.limite_extra, 0), 0)
  into
    v_pausar_automacoes,
    v_limite_extra
  from public.whatsapp_service_automacao_limites l
  where l.empresa_id = p_empresa_id
    and l.integracao_whatsapp_id = p_integracao_id
  limit 1;

  v_pausar_automacoes := coalesce(v_pausar_automacoes, false);
  v_limite_extra := greatest(coalesce(v_limite_extra, 0), 0);
  v_limite_total := 1000 + v_limite_extra;
  v_bloqueado :=
    v_pausar_automacoes
    and v_service_total >= v_limite_total;

  if v_bloqueado then
    v_bloqueio_aplicado_agora :=
      public.claim_whatsapp_service_automation_limit(
        p_empresa_id,
        p_integracao_id,
        v_mes,
        least(v_service_total, 2147483647)::integer,
        jsonb_build_object(
          'origem', 'meta_service_quota',
          'service_gratis', v_service_gratis,
          'service_cobrado', v_service_cobrado,
          'service_total', v_service_total,
          'limite_gratis', 1000,
          'limite_extra', v_limite_extra,
          'limite_total', v_limite_total,
          'mes', v_mes
        )
      );
  end if;

  if v_tipo = 'free_customer_service' then
    select marco
      into v_alerta_percentual
    from (
      values
        (80::smallint, 800::bigint),
        (95::smallint, 950::bigint),
        (100::smallint, 1000::bigint)
    ) as limites(marco, minimo)
    where v_service_gratis >= minimo
      and not exists (
        select 1
        from public.whatsapp_service_franquia_alertas a
        where a.integracao_whatsapp_id = p_integracao_id
          and a.mes = v_mes
          and a.percentual = marco
      )
    order by marco
    limit 1;

    if v_alerta_percentual is not null then
      insert into public.whatsapp_service_franquia_alertas (
        empresa_id,
        integracao_whatsapp_id,
        mes,
        percentual,
        service_usado,
        service_limite
      )
      values (
        p_empresa_id,
        p_integracao_id,
        v_mes,
        v_alerta_percentual,
        v_service_gratis,
        1000
      )
      on conflict (integracao_whatsapp_id, mes, percentual) do nothing
      returning id into v_alerta_id;
    end if;
  end if;

  return jsonb_build_object(
    'processado', true,
    'mes', v_mes,
    'timezone', v_timezone,
    'service_gratis', v_service_gratis,
    'service_cobrado', v_service_cobrado,
    'service_total', v_service_total,
    'limite_ativo', v_pausar_automacoes,
    'limite_extra', v_limite_extra,
    'limite_total', v_limite_total,
    'bloqueado', v_bloqueado,
    'bloqueio_aplicado_agora', v_bloqueio_aplicado_agora,
    'restante', greatest(v_limite_total::bigint - v_service_total, 0),
    'alerta_id', v_alerta_id,
    'alerta_percentual', v_alerta_percentual
  );
end;
$$;

revoke execute on function public.avaliar_whatsapp_service_status_evento(uuid, uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.avaliar_whatsapp_service_status_evento(uuid, uuid, text, text, text, text)
to service_role;


create or replace function public.registrar_whatsapp_pricing_status_evento_otimizado(
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
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.registrar_whatsapp_pricing_status_evento(
    p_empresa_id,
    p_integracao_id,
    p_phone_number_id,
    p_mensagem_externa_id,
    p_recipient_id,
    p_status_meta,
    p_event_at,
    p_pricing_category,
    p_pricing_type,
    p_pricing_model,
    p_pricing_billable
  );

  return public.avaliar_whatsapp_service_status_evento(
    p_empresa_id,
    p_integracao_id,
    p_phone_number_id,
    p_status_meta,
    p_pricing_category,
    p_pricing_type
  );
end;
$$;

revoke execute on function public.registrar_whatsapp_pricing_status_evento_otimizado(uuid, uuid, text, text, text, text, timestamptz, text, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.registrar_whatsapp_pricing_status_evento_otimizado(uuid, uuid, text, text, text, text, timestamptz, text, text, text, boolean)
to service_role;
