begin;

-- Tokens avulsos pertencem ao cliente e nao expiram quando a assinatura vence.
create or replace function public.sincronizar_assinatura_empresa(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa public.empresas;
  v_status_calculado text;
  v_agora timestamptz := now();
  v_bloqueio_em timestamptz;
begin
  select * into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Empresa nao encontrada para controle de assinatura.';
  end if;

  v_bloqueio_em := case
    when v_empresa.assinatura_vencimento_em is not null
      then v_empresa.assinatura_vencimento_em + interval '7 days'
    else v_empresa.assinatura_bloqueio_em
  end;

  v_status_calculado := case
    when v_bloqueio_em is not null and v_agora >= v_bloqueio_em then 'bloqueada'
    when v_empresa.assinatura_vencimento_em is not null and v_agora >= v_empresa.assinatura_vencimento_em then 'vencida'
    else 'ativa'
  end;

  update public.empresas
  set
    assinatura_status = v_status_calculado,
    assinatura_bloqueio_em = v_bloqueio_em,
    updated_at = v_agora
  where id = p_empresa_id
    and (
      assinatura_status is distinct from v_status_calculado
      or assinatura_bloqueio_em is distinct from v_bloqueio_em
    );

  if v_status_calculado in ('vencida', 'bloqueada') then
    update public.empresa_tokens_ia
    set
      saldo_mensal_restante = 0,
      tokens_restantes = 0,
      updated_at = v_agora
    where empresa_id = p_empresa_id;
  end if;

  if v_status_calculado = 'bloqueada' then
    update public.automacao_fluxos
    set status = 'pausado', updated_at = v_agora
    where empresa_id = p_empresa_id and status = 'ativo';

    update public.empresas
    set assinatura_fluxos_pausados_em = coalesce(assinatura_fluxos_pausados_em, v_agora)
    where id = p_empresa_id;
  end if;

  return v_status_calculado;
end;
$function$;

-- Recalcula sempre o saldo derivado mensal + avulso.
create or replace function public.sincronizar_empresa_tokens_ia(p_empresa_id uuid)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limite_plano bigint;
  v_limite_efetivo bigint;
  v_inicio timestamptz;
  v_saldo public.empresa_tokens_ia;
  v_assinatura_status text;
begin
  v_assinatura_status := public.sincronizar_assinatura_empresa(p_empresa_id);

  select p.limite_tokens_ia
    into v_limite_plano
  from public.empresas e
  left join public.planos p on p.id = e.plano_id
  where e.id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada para controle de tokens de IA.';
  end if;

  v_inicio := now();

  insert into public.empresa_tokens_ia (
    empresa_id,
    limite_mensal,
    tokens_usados,
    tokens_restantes,
    saldo_mensal_restante,
    saldo_avulso_restante,
    periodo_inicio,
    periodo_fim
  )
  values (
    p_empresa_id,
    v_limite_plano,
    0,
    case when v_assinatura_status = 'ativa' then v_limite_plano else 0 end,
    case when v_assinatura_status = 'ativa' then v_limite_plano else 0 end,
    0,
    v_inicio,
    v_inicio + interval '1 month'
  )
  on conflict (empresa_id) do nothing;

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

  v_limite_efetivo := coalesce(
    v_saldo.limite_mensal_personalizado,
    v_limite_plano
  );

  if v_assinatura_status <> 'ativa' then
    update public.empresa_tokens_ia
    set
      limite_mensal = v_limite_efetivo,
      saldo_mensal_restante = 0,
      tokens_restantes = 0,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;

    return v_saldo;
  end if;

  update public.empresa_tokens_ia
  set
    limite_mensal = v_limite_efetivo,
    saldo_mensal_restante = case
      when v_limite_efetivo is null then null
      else greatest(v_limite_efetivo - tokens_mensais_usados, 0)
    end,
    tokens_restantes = case
      when v_limite_efetivo is null then null
      else greatest(v_limite_efetivo - tokens_mensais_usados, 0)
        + greatest(saldo_avulso_restante, 0)
    end,
    updated_at = now()
  where empresa_id = p_empresa_id
  returning * into v_saldo;

  return v_saldo;
end;
$function$;

-- Reserva avulsa e consumida antes da franquia mensal.
create or replace function public.registrar_uso_tokens_ia(
  p_empresa_id uuid,
  p_origem text,
  p_modelo text,
  p_tokens_total bigint,
  p_tokens_input bigint default null::bigint,
  p_tokens_output bigint default null::bigint,
  p_usuario_id uuid default null::uuid,
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_saldo public.empresa_tokens_ia;
  v_total_fisico bigint;
  v_total_cobrado bigint;
  v_consumo_mensal bigint;
  v_consumo_avulso bigint;
  v_custo_usd numeric(18, 9);
begin
  v_total_fisico := greatest(coalesce(p_tokens_total, 0), 0);

  v_total_cobrado := case
    when coalesce(p_metadata_json ->> 'tokens_equivalentes', '') ~ '^\d+$'
      then greatest((p_metadata_json ->> 'tokens_equivalentes')::bigint, 0)
    else v_total_fisico
  end;

  v_custo_usd := case
    when coalesce(p_metadata_json ->> 'custo_estimado_usd', '') ~ '^\d+(\.\d+)?([eE][+-]?\d+)?$'
      then (p_metadata_json ->> 'custo_estimado_usd')::numeric(18, 9)
    else null
  end;

  v_saldo := public.sincronizar_empresa_tokens_ia(p_empresa_id);

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

  v_consumo_avulso := least(
    greatest(v_saldo.saldo_avulso_restante, 0),
    v_total_cobrado
  );

  v_consumo_mensal := case
    when v_saldo.saldo_mensal_restante is null
      then greatest(v_total_cobrado - v_consumo_avulso, 0)
    else least(
      v_saldo.saldo_mensal_restante,
      greatest(v_total_cobrado - v_consumo_avulso, 0)
    )
  end;

  insert into public.ia_token_usos (
    empresa_id,
    usuario_id,
    origem,
    modelo,
    tokens_input,
    tokens_output,
    tokens_total,
    tokens_cobrados,
    custo_usd,
    periodo_inicio,
    metadata_json
  )
  values (
    p_empresa_id,
    p_usuario_id,
    coalesce(nullif(trim(p_origem), ''), 'ia'),
    nullif(trim(coalesce(p_modelo, '')), ''),
    p_tokens_input,
    p_tokens_output,
    v_total_fisico,
    v_total_cobrado,
    v_custo_usd,
    v_saldo.periodo_inicio,
    coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object(
      'tokens_fisicos', v_total_fisico,
      'tokens_equivalentes', v_total_cobrado,
      'tokens_mensais_consumidos', v_consumo_mensal,
      'tokens_avulsos_consumidos', v_consumo_avulso,
      'ordem_consumo', 'avulso_primeiro'
    )
  );

  update public.empresa_tokens_ia
  set
    tokens_usados = tokens_usados + v_total_cobrado,
    tokens_mensais_usados = tokens_mensais_usados + v_consumo_mensal,
    tokens_avulsos_usados = tokens_avulsos_usados + v_consumo_avulso,
    saldo_mensal_restante = case
      when saldo_mensal_restante is null then null
      else greatest(saldo_mensal_restante - v_consumo_mensal, 0)
    end,
    saldo_avulso_restante = greatest(
      saldo_avulso_restante - v_consumo_avulso,
      0
    ),
    tokens_restantes = case
      when limite_mensal is null then null
      else greatest(saldo_mensal_restante - v_consumo_mensal, 0)
        + greatest(saldo_avulso_restante - v_consumo_avulso, 0)
    end,
    updated_at = now()
  where empresa_id = p_empresa_id
  returning * into v_saldo;

  return v_saldo;
end;
$function$;

-- Renovacoes preservam a reserva avulsa e zeram apenas os contadores do novo ciclo.
create or replace function public.aplicar_pagamento_tokens_ia(
  p_empresa_id uuid,
  p_referencia text,
  p_oferta_referencias text[],
  p_pago_em timestamp with time zone default now(),
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_saldo public.empresa_tokens_ia;
  v_oferta public.ia_token_ofertas;
  v_movimentacao_id uuid;
  v_limite bigint;
  v_tipo_movimentacao text;
  v_quantidade bigint;
  v_pago_em timestamptz;
  v_gateway text;
begin
  if nullif(trim(coalesce(p_referencia, '')), '') is null then
    raise exception 'Referencia de pagamento obrigatoria para aplicar tokens de IA.';
  end if;

  v_gateway := coalesce(
    nullif(trim(coalesce(p_metadata_json->>'gateway', '')), ''),
    'atomo'
  );

  if v_gateway not in ('atomo', 'prosperity_pay') then
    raise exception 'Gateway de tokens de IA nao suportado: %', v_gateway;
  end if;

  select *
    into v_oferta
  from public.ia_token_ofertas
  where gateway = v_gateway
    and ativa = true
    and referencia = any(coalesce(p_oferta_referencias, array[]::text[]))
    and (empresa_id is null or empresa_id = p_empresa_id)
  order by (empresa_id is not null) desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'oferta_nao_configurada',
      'gateway', v_gateway
    );
  end if;

  v_pago_em := coalesce(p_pago_em, now());
  v_saldo := public.sincronizar_empresa_tokens_ia(p_empresa_id);
  v_tipo_movimentacao := case
    when v_oferta.tipo = 'mensalidade' then 'renovacao'
    else 'recarga'
  end;
  v_quantidade := coalesce(v_oferta.quantidade_tokens, v_saldo.limite_mensal);

  if v_quantidade is null then
    raise exception 'Oferta sem quantidade de tokens e empresa sem limite mensal.';
  end if;

  insert into public.ia_token_movimentacoes (
    empresa_id,
    oferta_id,
    tipo,
    referencia,
    quantidade_tokens,
    saldo_mensal_apos,
    saldo_avulso_apos,
    metadata_json
  )
  values (
    p_empresa_id,
    v_oferta.id,
    v_tipo_movimentacao,
    p_referencia,
    v_quantidade,
    v_saldo.saldo_mensal_restante,
    v_saldo.saldo_avulso_restante,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (empresa_id, tipo, referencia) do nothing
  returning id into v_movimentacao_id;

  if v_movimentacao_id is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'pagamento_ja_processado');
  end if;

  if v_oferta.tipo = 'mensalidade' then
    v_limite := v_quantidade;

    update public.empresa_tokens_ia
    set
      limite_mensal = v_limite,
      limite_mensal_personalizado = case
        when v_oferta.quantidade_tokens is null then null
        else v_limite
      end,
      tokens_usados = 0,
      tokens_mensais_usados = 0,
      tokens_avulsos_usados = 0,
      saldo_mensal_restante = v_limite,
      tokens_restantes = v_limite + greatest(saldo_avulso_restante, 0),
      periodo_inicio = v_pago_em,
      periodo_fim = v_pago_em + interval '1 month',
      ultima_renovacao_em = v_pago_em,
      ultima_renovacao_referencia = p_referencia,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;

    insert into public.ia_token_renovacoes (
      empresa_id,
      referencia,
      renovado_em,
      limite_mensal,
      metadata_json
    )
    values (
      p_empresa_id,
      p_referencia,
      v_pago_em,
      v_limite,
      coalesce(p_metadata_json, '{}'::jsonb)
    )
    on conflict (empresa_id, referencia) do nothing;
  else
    update public.empresa_tokens_ia
    set
      saldo_avulso_restante = greatest(saldo_avulso_restante, 0) + v_quantidade,
      tokens_restantes = case
        when limite_mensal is null then null
        else coalesce(saldo_mensal_restante, 0)
          + greatest(saldo_avulso_restante, 0)
          + v_quantidade
      end,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;
  end if;

  update public.ia_token_movimentacoes
  set
    saldo_mensal_apos = v_saldo.saldo_mensal_restante,
    saldo_avulso_apos = v_saldo.saldo_avulso_restante
  where id = v_movimentacao_id;

  return jsonb_build_object(
    'aplicado', true,
    'tipo', v_oferta.tipo,
    'gateway', v_gateway,
    'quantidade_tokens', v_quantidade
  );
end;
$function$;

commit;
