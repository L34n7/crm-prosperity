alter table if exists public.empresas
  add column if not exists assinatura_status text not null default 'ativa',
  add column if not exists assinatura_inicio_em timestamptz,
  add column if not exists assinatura_vencimento_em timestamptz,
  add column if not exists assinatura_bloqueio_em timestamptz,
  add column if not exists assinatura_renovada_em timestamptz,
  add column if not exists assinatura_gateway text,
  add column if not exists assinatura_referencia text,
  add column if not exists assinatura_metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists assinatura_fluxos_pausados_em timestamptz;

alter table if exists public.empresas
  drop constraint if exists empresas_assinatura_status_check;

alter table if exists public.empresas
  add constraint empresas_assinatura_status_check
  check (assinatura_status in ('ativa', 'vencida', 'bloqueada'));

update public.empresas
set
  assinatura_status = coalesce(nullif(assinatura_status, ''), 'ativa'),
  assinatura_inicio_em = coalesce(assinatura_inicio_em, now()),
  assinatura_vencimento_em = coalesce(assinatura_vencimento_em, now() + interval '30 days'),
  assinatura_bloqueio_em = coalesce(assinatura_bloqueio_em, now() + interval '37 days'),
  assinatura_metadata_json = coalesce(assinatura_metadata_json, '{}'::jsonb)
where assinatura_inicio_em is null
   or assinatura_vencimento_em is null
   or assinatura_bloqueio_em is null
   or assinatura_metadata_json is null;

create or replace function public.sincronizar_assinatura_empresa(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa public.empresas;
  v_status_calculado text;
  v_agora timestamptz := now();
begin
  select *
    into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Empresa nao encontrada para controle de assinatura.';
  end if;

  v_status_calculado := case
    when v_empresa.assinatura_bloqueio_em is not null
      and v_agora >= v_empresa.assinatura_bloqueio_em
      then 'bloqueada'
    when v_empresa.assinatura_vencimento_em is not null
      and v_agora >= v_empresa.assinatura_vencimento_em
      then 'vencida'
    else 'ativa'
  end;

  if v_empresa.assinatura_status is distinct from v_status_calculado then
    update public.empresas
    set
      assinatura_status = v_status_calculado,
      updated_at = v_agora
    where id = p_empresa_id;
  end if;

  if v_status_calculado in ('vencida', 'bloqueada') then
    update public.empresa_tokens_ia
    set
      saldo_mensal_restante = 0,
      saldo_avulso_restante = 0,
      tokens_restantes = 0,
      updated_at = v_agora
    where empresa_id = p_empresa_id;
  end if;

  if v_status_calculado = 'bloqueada' then
    update public.automacao_fluxos
    set
      status = 'pausado',
      updated_at = v_agora
    where empresa_id = p_empresa_id
      and status = 'ativo';

    update public.empresas
    set assinatura_fluxos_pausados_em = coalesce(assinatura_fluxos_pausados_em, v_agora)
    where id = p_empresa_id;
  end if;

  return v_status_calculado;
end;
$$;

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
      saldo_avulso_restante = 0,
      tokens_restantes = 0,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;

    return v_saldo;
  end if;

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

create or replace function public.renovar_tokens_assinatura_plano(
  p_empresa_id uuid,
  p_referencia text,
  p_pago_em timestamptz default now(),
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite bigint;
  v_saldo public.empresa_tokens_ia;
  v_referencia text;
  v_pago_em timestamptz;
begin
  v_referencia := nullif(trim(coalesce(p_referencia, '')), '');

  if v_referencia is null then
    raise exception 'Referencia de pagamento obrigatoria para renovar tokens do plano.';
  end if;

  select p.limite_tokens_ia
    into v_limite
  from public.empresas e
  left join public.planos p on p.id = e.plano_id
  where e.id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada para renovar tokens do plano.';
  end if;

  v_pago_em := coalesce(p_pago_em, now());

  insert into public.empresa_tokens_ia (
    empresa_id,
    limite_mensal,
    tokens_usados,
    tokens_restantes,
    saldo_mensal_restante,
    saldo_avulso_restante,
    periodo_inicio,
    periodo_fim,
    ultima_renovacao_em,
    ultima_renovacao_referencia
  )
  values (
    p_empresa_id,
    v_limite,
    0,
    v_limite,
    v_limite,
    0,
    v_pago_em,
    v_pago_em + interval '1 month',
    v_pago_em,
    v_referencia
  )
  on conflict (empresa_id) do nothing;

  update public.empresa_tokens_ia
  set
    limite_mensal = v_limite,
    limite_mensal_personalizado = null,
    tokens_usados = 0,
    tokens_mensais_usados = 0,
    tokens_avulsos_usados = 0,
    saldo_mensal_restante = v_limite,
    tokens_restantes = case
      when v_limite is null then null
      else v_limite + saldo_avulso_restante
    end,
    periodo_inicio = v_pago_em,
    periodo_fim = v_pago_em + interval '1 month',
    ultima_renovacao_em = v_pago_em,
    ultima_renovacao_referencia = v_referencia,
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
    v_referencia,
    v_pago_em,
    v_limite,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (empresa_id, referencia) do nothing;

  return v_saldo;
end;
$$;
