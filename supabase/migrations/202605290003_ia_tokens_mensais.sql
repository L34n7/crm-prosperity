create table if not exists public.empresa_tokens_ia (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  limite_mensal bigint,
  tokens_usados bigint not null default 0,
  tokens_restantes bigint,
  periodo_inicio timestamptz not null,
  periodo_fim timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ia_token_usos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  origem text not null,
  modelo text,
  tokens_input bigint,
  tokens_output bigint,
  tokens_total bigint not null default 0,
  periodo_inicio timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ia_token_usos_empresa_created_at_idx
  on public.ia_token_usos (empresa_id, created_at desc);

create index if not exists ia_token_usos_periodo_idx
  on public.ia_token_usos (empresa_id, periodo_inicio);

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

  v_inicio := date_trunc('month', now());
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

  if v_saldo.periodo_fim <= now()
     or v_saldo.periodo_inicio <> v_inicio
     or v_saldo.limite_mensal is distinct from v_limite then
    update public.empresa_tokens_ia
    set
      limite_mensal = v_limite,
      tokens_usados = 0,
      tokens_restantes = v_limite,
      periodo_inicio = v_inicio,
      periodo_fim = v_fim,
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
begin
  v_total := greatest(coalesce(p_tokens_total, 0), 0);

  v_saldo := public.sincronizar_empresa_tokens_ia(p_empresa_id);

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

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
    coalesce(p_metadata_json, '{}'::jsonb)
  );

  update public.empresa_tokens_ia
  set
    tokens_usados = tokens_usados + v_total,
    tokens_restantes = case
      when limite_mensal is null then null
      else greatest(limite_mensal - (tokens_usados + v_total), 0)
    end,
    updated_at = now()
  where empresa_id = p_empresa_id
  returning * into v_saldo;

  return v_saldo;
end;
$$;
