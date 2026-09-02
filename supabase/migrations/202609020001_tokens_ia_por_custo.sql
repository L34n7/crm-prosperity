-- Franquia de IA baseada em custo equivalente.
-- 1 token Prosperity = US$ 0,000001 (1 microdolar) de custo estimado do provider.

alter table public.ia_token_usos
  add column if not exists tokens_cobrados bigint,
  add column if not exists custo_usd numeric(18, 9);

update public.ia_token_usos
set tokens_cobrados = tokens_total
where tokens_cobrados is null;

alter table public.ia_token_usos
  alter column tokens_cobrados set default 0,
  alter column tokens_cobrados set not null;

comment on column public.ia_token_usos.tokens_total is
  'Tokens fisicos reportados pelo provider; preservados para auditoria.';
comment on column public.ia_token_usos.tokens_cobrados is
  'Tokens equivalentes debitados da franquia. 1 unidade = US$ 0,000001 de custo estimado.';
comment on column public.ia_token_usos.custo_usd is
  'Custo estimado em USD com a tabela de precos vigente no momento do registro.';

-- Calibracao comercial: Basico = US$ 0,10 de capacidade equivalente;
-- Essencial = US$ 0,40. Limites personalizados das empresas nao sao alterados.
update public.planos
set limite_tokens_ia = 100000,
    updated_at = now()
where slug = 'basico'
  and limite_tokens_ia is distinct from 100000;

update public.planos
set limite_tokens_ia = 400000,
    updated_at = now()
where slug = 'essencial'
  and limite_tokens_ia is distinct from 400000;

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

  -- Clientes antigos que ainda nao enviem a ponderacao continuam em 1:1.
  -- O runtime novo envia tokens_equivalentes calculados pela tabela central de precos.
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

  v_consumo_mensal := case
    when v_saldo.saldo_mensal_restante is null then v_total_cobrado
    else least(v_saldo.saldo_mensal_restante, v_total_cobrado)
  end;

  v_consumo_avulso := case
    when v_saldo.saldo_mensal_restante is null then 0
    else least(
      v_saldo.saldo_avulso_restante,
      greatest(v_total_cobrado - v_consumo_mensal, 0)
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
      'tokens_avulsos_consumidos', v_consumo_avulso
    )
  );

  update public.empresa_tokens_ia
  set
    -- A partir desta versao, os contadores de franquia representam tokens
    -- equivalentes, enquanto os tokens fisicos permanecem em ia_token_usos.
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
