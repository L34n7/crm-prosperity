create or replace function public.ajustar_tokens_empresa_admin(
  p_empresa_id uuid,
  p_acao text,
  p_quantidade bigint default null,
  p_operador_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_saldo public.empresa_tokens_ia;
  v_status text;
  v_limite bigint;
  v_quantidade_aplicada bigint;
  v_saldo_mensal_antes bigint;
  v_saldo_avulso_antes bigint;
  v_total_antes bigint;
  v_referencia text;
  v_metadata jsonb;
begin
  if p_acao not in ('restaurar_mensal', 'adicionar_avulso') then
    raise exception 'Acao de ajuste de tokens invalida.';
  end if;

  v_saldo := public.sincronizar_empresa_tokens_ia(p_empresa_id);

  select assinatura_status
    into v_status
  from public.empresas
  where id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada.';
  end if;

  select *
    into v_saldo
  from public.empresa_tokens_ia
  where empresa_id = p_empresa_id
  for update;

  v_saldo_mensal_antes := coalesce(v_saldo.saldo_mensal_restante, 0);
  v_saldo_avulso_antes := greatest(coalesce(v_saldo.saldo_avulso_restante, 0), 0);
  v_total_antes := case
    when v_saldo.limite_mensal is null then null
    else v_saldo_mensal_antes + v_saldo_avulso_antes
  end;

  if p_acao = 'restaurar_mensal' then
    if v_status <> 'ativa' then
      raise exception 'A franquia mensal so pode ser restaurada com a assinatura ativa.';
    end if;

    v_limite := v_saldo.limite_mensal;

    if v_limite is null then
      raise exception 'Esta empresa possui franquia mensal ilimitada.';
    end if;

    v_quantidade_aplicada := greatest(v_limite - v_saldo_mensal_antes, 0);

    if v_quantidade_aplicada <= 0 then
      return jsonb_build_object(
        'aplicado', false,
        'motivo', 'saldo_mensal_ja_completo',
        'saldo', to_jsonb(v_saldo)
      );
    end if;

    update public.empresa_tokens_ia
    set
      tokens_mensais_usados = 0,
      saldo_mensal_restante = v_limite,
      tokens_restantes = v_limite + v_saldo_avulso_antes,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;
  else
    if p_quantidade is null or p_quantidade <= 0 then
      raise exception 'Informe uma quantidade positiva de tokens extras.';
    end if;

    if p_quantidade > 1000000000 then
      raise exception 'A quantidade maxima por ajuste e 1 bilhao de tokens.';
    end if;

    v_quantidade_aplicada := p_quantidade;

    update public.empresa_tokens_ia
    set
      saldo_avulso_restante = v_saldo_avulso_antes + v_quantidade_aplicada,
      tokens_restantes = case
        when limite_mensal is null then null
        when v_status = 'ativa'
          then coalesce(saldo_mensal_restante, 0)
            + v_saldo_avulso_antes
            + v_quantidade_aplicada
        else 0
      end,
      updated_at = now()
    where empresa_id = p_empresa_id
    returning * into v_saldo;
  end if;

  v_referencia :=
    'admin:' || p_acao || ':' ||
    replace(gen_random_uuid()::text, '-', '');

  v_metadata := jsonb_build_object(
    'origem', 'modulo_empresas',
    'acao', p_acao,
    'operador_id', p_operador_id,
    'motivo', nullif(trim(coalesce(p_motivo, '')), ''),
    'saldo_mensal_antes', v_saldo_mensal_antes,
    'saldo_avulso_antes', v_saldo_avulso_antes,
    'tokens_disponiveis_antes', v_total_antes,
    'assinatura_status', v_status
  );

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
    null,
    'ajuste',
    v_referencia,
    v_quantidade_aplicada,
    v_saldo.saldo_mensal_restante,
    v_saldo.saldo_avulso_restante,
    v_metadata
  );

  return jsonb_build_object(
    'aplicado', true,
    'acao', p_acao,
    'quantidade_aplicada', v_quantidade_aplicada,
    'referencia', v_referencia,
    'saldo', to_jsonb(v_saldo)
  );
end;
$function$;

revoke all on function public.ajustar_tokens_empresa_admin(uuid, text, bigint, uuid, text)
from public, anon, authenticated;

grant execute on function public.ajustar_tokens_empresa_admin(uuid, text, bigint, uuid, text)
to service_role;
