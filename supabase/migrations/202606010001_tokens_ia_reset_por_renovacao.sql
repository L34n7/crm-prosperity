alter table if exists public.empresa_tokens_ia
  add column if not exists ultima_renovacao_em timestamptz,
  add column if not exists ultima_renovacao_referencia text;

create table if not exists public.ia_token_renovacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  referencia text not null,
  renovado_em timestamptz not null,
  limite_mensal bigint,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (empresa_id, referencia)
);

create index if not exists ia_token_renovacoes_empresa_created_at_idx
  on public.ia_token_renovacoes (empresa_id, created_at desc);

create or replace function public.sincronizar_empresa_tokens_ia(p_empresa_id uuid)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite bigint;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_saldo public.empresa_tokens_ia;
begin
  select p.limite_tokens_ia
    into v_limite
  from public.empresas e
  left join public.planos p on p.id = e.plano_id
  where e.id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada para controle de tokens de IA.';
  end if;

  v_inicio := now();
  v_fim := v_inicio + interval '1 month';

  insert into public.empresa_tokens_ia (
    empresa_id,
    limite_mensal,
    tokens_usados,
    tokens_restantes,
    periodo_inicio,
    periodo_fim
  )
  values (
    p_empresa_id,
    v_limite,
    0,
    v_limite,
    v_inicio,
    v_fim
  )
  on conflict (empresa_id) do nothing;

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

  if v_saldo.limite_mensal is distinct from v_limite then
    update public.empresa_tokens_ia
    set
      limite_mensal = v_limite,
      tokens_restantes = case
        when v_limite is null then null
        else greatest(v_limite - tokens_usados, 0)
      end,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;
  end if;

  return v_saldo;
end;
$$;

create or replace function public.renovar_saldo_tokens_ia(
  p_empresa_id uuid,
  p_referencia text,
  p_renovado_em timestamptz default now(),
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.empresa_tokens_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo public.empresa_tokens_ia;
  v_referencia text;
  v_renovado_em timestamptz;
begin
  v_referencia := nullif(trim(coalesce(p_referencia, '')), '');

  if v_referencia is null then
    raise exception 'Referencia de pagamento obrigatoria para renovar tokens de IA.';
  end if;

  v_renovado_em := coalesce(p_renovado_em, now());
  v_saldo := public.sincronizar_empresa_tokens_ia(p_empresa_id);

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

  if v_saldo.ultima_renovacao_referencia is not distinct from v_referencia then
    return v_saldo;
  end if;

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
    v_renovado_em,
    v_saldo.limite_mensal,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (empresa_id, referencia) do nothing;

  if not found then
    return v_saldo;
  end if;

  update public.empresa_tokens_ia
  set
    tokens_usados = 0,
    tokens_restantes = limite_mensal,
    periodo_inicio = v_renovado_em,
    periodo_fim = v_renovado_em + interval '1 month',
    ultima_renovacao_em = v_renovado_em,
    ultima_renovacao_referencia = v_referencia,
    updated_at = now()
  where empresa_id = p_empresa_id
  returning * into v_saldo;

  return v_saldo;
end;
$$;
