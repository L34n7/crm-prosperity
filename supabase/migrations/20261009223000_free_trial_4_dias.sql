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
  v_free_trial_4d boolean := false;
begin
  select * into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Empresa nao encontrada para controle de assinatura.';
  end if;

  v_free_trial_4d :=
    v_empresa.assinatura_gateway = 'free_trial_4d'
    or lower(coalesce(v_empresa.assinatura_metadata_json->>'free_trial_4d', 'false'))
      in ('true', '1', 'yes');

  v_bloqueio_em := case
    when v_free_trial_4d and v_empresa.assinatura_vencimento_em is not null
      then v_empresa.assinatura_vencimento_em
    when v_empresa.assinatura_vencimento_em is not null
      then v_empresa.assinatura_vencimento_em + interval '7 days'
    else v_empresa.assinatura_bloqueio_em
  end;

  v_status_calculado := case
    when v_bloqueio_em is not null and v_agora >= v_bloqueio_em then 'bloqueada'
    when v_empresa.assinatura_vencimento_em is not null
      and v_agora >= v_empresa.assinatura_vencimento_em then 'vencida'
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
      saldo_avulso_restante = case
        when v_free_trial_4d then 0
        else saldo_avulso_restante
      end,
      tokens_restantes = 0,
      updated_at = v_agora
    where empresa_id = p_empresa_id;
  end if;

  if v_status_calculado = 'bloqueada' then
    update public.automacao_fluxos
    set status = 'pausado', updated_at = v_agora
    where empresa_id = p_empresa_id
      and status = 'ativo';

    update public.empresas
    set assinatura_fluxos_pausados_em =
      coalesce(assinatura_fluxos_pausados_em, v_agora)
    where id = p_empresa_id;

    if v_free_trial_4d then
      update public.agente_ia_pendencias
      set
        status = 'cancelado',
        erro = 'free_trial_4d_expirado',
        updated_at = v_agora
      where empresa_id = p_empresa_id
        and status = 'pendente';

      update public.automacao_agendamentos
      set status = 'cancelado'
      where empresa_id = p_empresa_id
        and status = 'pendente'
        and (
          fluxo_id is not null
          or tipo_agendamento = 'followup_agente_ia'
        );
    end if;

    if v_bloqueio_em is not null
       and v_agora >= v_bloqueio_em + interval '60 days' then
      update public.integracoes_whatsapp
      set
        status = 'suspensa_inadimplencia',
        suspensa_por_inadimplencia_em =
          coalesce(suspensa_por_inadimplencia_em, v_agora),
        updated_at = v_agora
      where empresa_id = p_empresa_id
        and status = 'ativa';
    end if;
  elsif v_status_calculado = 'ativa' then
    update public.integracoes_whatsapp
    set
      status = 'ativa',
      suspensa_por_inadimplencia_em = null,
      updated_at = v_agora
    where empresa_id = p_empresa_id
      and status = 'suspensa_inadimplencia';
  end if;

  return v_status_calculado;
end;
$function$;
