alter table if exists public.empresa_tokens_ia
  add column if not exists saldo_mensal_restante bigint,
  add column if not exists saldo_avulso_restante bigint not null default 0,
  add column if not exists tokens_mensais_usados bigint not null default 0,
  add column if not exists tokens_avulsos_usados bigint not null default 0,
  add column if not exists limite_mensal_personalizado bigint,
  add column if not exists ultima_renovacao_em timestamptz,
  add column if not exists ultima_renovacao_referencia text;

update public.empresa_tokens_ia
set
  saldo_mensal_restante = coalesce(saldo_mensal_restante, tokens_restantes),
  tokens_restantes = case
    when limite_mensal is null then null
    else coalesce(saldo_mensal_restante, tokens_restantes, 0)
      + saldo_avulso_restante
  end;

create table if not exists public.ia_token_ofertas (
  id uuid primary key default gen_random_uuid(),
  gateway text not null default 'atomo',
  referencia text not null,
  tipo text not null check (tipo in ('mensalidade', 'recarga')),
  nome text not null,
  plano_id uuid references public.planos(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete cascade,
  quantidade_tokens bigint,
  ativa boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantidade_tokens is null or quantidade_tokens > 0),
  check (tipo <> 'recarga' or quantidade_tokens is not null)
);

create unique index if not exists ia_token_ofertas_gateway_referencia_global_idx
  on public.ia_token_ofertas (gateway, referencia)
  where empresa_id is null;

create unique index if not exists ia_token_ofertas_gateway_referencia_empresa_idx
  on public.ia_token_ofertas (gateway, referencia, empresa_id)
  where empresa_id is not null;

create table if not exists public.ia_token_renovacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  referencia text not null,
  renovado_em timestamptz not null,
  limite_mensal bigint,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists ia_token_renovacoes_empresa_referencia_idx
  on public.ia_token_renovacoes (empresa_id, referencia);

create index if not exists ia_token_renovacoes_empresa_created_at_idx
  on public.ia_token_renovacoes (empresa_id, created_at desc);

create table if not exists public.ia_token_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  oferta_id uuid references public.ia_token_ofertas(id) on delete set null,
  tipo text not null check (tipo in ('renovacao', 'recarga', 'ajuste')),
  referencia text not null,
  quantidade_tokens bigint not null,
  saldo_mensal_apos bigint,
  saldo_avulso_apos bigint not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (empresa_id, tipo, referencia)
);

create index if not exists ia_token_movimentacoes_empresa_created_at_idx
  on public.ia_token_movimentacoes (empresa_id, created_at desc);

drop function if exists public.renovar_saldo_tokens_ia(
  uuid,
  text,
  timestamptz,
  jsonb
);

create or replace function public.sincronizar_empresa_tokens_ia(p_empresa_id uuid)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite_plano bigint;
  v_limite_efetivo bigint;
  v_inicio timestamptz;
  v_saldo public.empresa_tokens_ia;
begin
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
    v_limite_plano,
    v_limite_plano,
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

  if v_saldo.limite_mensal is distinct from v_limite_efetivo then
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
          + saldo_avulso_restante
      end,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;
  end if;

  return v_saldo;
end;
$$;

create or replace function public.registrar_uso_tokens_ia(
  p_empresa_id uuid,
  p_origem text,
  p_modelo text,
  p_tokens_total bigint,
  p_tokens_input bigint default null,
  p_tokens_output bigint default null,
  p_usuario_id uuid default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo public.empresa_tokens_ia;
  v_total bigint;
  v_consumo_mensal bigint;
  v_consumo_avulso bigint;
begin
  v_total := greatest(coalesce(p_tokens_total, 0), 0);
  v_saldo := public.sincronizar_empresa_tokens_ia(p_empresa_id);

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

  v_consumo_mensal := case
    when v_saldo.saldo_mensal_restante is null then v_total
    else least(v_saldo.saldo_mensal_restante, v_total)
  end;

  v_consumo_avulso := case
    when v_saldo.saldo_mensal_restante is null then 0
    else least(
      v_saldo.saldo_avulso_restante,
      greatest(v_total - v_consumo_mensal, 0)
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
    v_total,
    v_saldo.periodo_inicio,
    coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object(
      'tokens_mensais_consumidos', v_consumo_mensal,
      'tokens_avulsos_consumidos', v_consumo_avulso
    )
  );

  update public.empresa_tokens_ia
  set
    tokens_usados = tokens_usados + v_total,
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
$$;

create or replace function public.aplicar_pagamento_tokens_ia(
  p_empresa_id uuid,
  p_referencia text,
  p_oferta_referencias text[],
  p_pago_em timestamptz default now(),
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo public.empresa_tokens_ia;
  v_oferta public.ia_token_ofertas;
  v_movimentacao_id uuid;
  v_limite bigint;
  v_tipo_movimentacao text;
  v_quantidade bigint;
  v_pago_em timestamptz;
begin
  if nullif(trim(coalesce(p_referencia, '')), '') is null then
    raise exception 'Referencia de pagamento obrigatoria para aplicar tokens de IA.';
  end if;

  select *
    into v_oferta
  from public.ia_token_ofertas
  where gateway = 'atomo'
    and ativa = true
    and referencia = any(coalesce(p_oferta_referencias, array[]::text[]))
    and (empresa_id is null or empresa_id = p_empresa_id)
  order by (empresa_id is not null) desc
  limit 1;

  if not found then
    return jsonb_build_object('aplicado', false, 'motivo', 'oferta_nao_configurada');
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
      saldo_mensal_restante = v_limite,
      tokens_restantes = v_limite + saldo_avulso_restante,
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
      saldo_avulso_restante = saldo_avulso_restante + v_quantidade,
      tokens_restantes = case
        when limite_mensal is null then null
        else coalesce(saldo_mensal_restante, 0)
          + saldo_avulso_restante
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
    'quantidade_tokens', v_quantidade
  );
end;
$$;
