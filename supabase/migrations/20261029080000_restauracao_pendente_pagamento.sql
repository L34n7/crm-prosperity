-- Restaurar o ambiente operacional não equivale a pagamento/renovação.
alter table public.empresas
  add column if not exists restauracao_pendente_pagamento_em timestamptz;

-- Somente uma nova renovação depois da restauração pode liberar este bloqueio.
create or replace function public.liberar_pendencia_restauracao_apos_renovacao()
returns trigger
language plpgsql security invoker set search_path='public'
as $$
begin
  if OLD.restauracao_pendente_pagamento_em is not null
    and NEW.assinatura_renovada_em is distinct from OLD.assinatura_renovada_em
    and NEW.assinatura_renovada_em >= OLD.restauracao_pendente_pagamento_em
  then
    NEW.restauracao_pendente_pagamento_em := null;
  end if;
  return NEW;
end $$;
revoke all on function public.liberar_pendencia_restauracao_apos_renovacao() from public, anon, authenticated;

drop trigger if exists empresas_liberar_pendencia_restauracao on public.empresas;
create trigger empresas_liberar_pendencia_restauracao
before update of assinatura_renovada_em on public.empresas
for each row execute function public.liberar_pendencia_restauracao_apos_renovacao();

-- Mantém bloqueio financeiro durante sincronização automática de assinaturas,
-- sem falsificar nem deslocar as datas originais de faturamento.
CREATE OR REPLACE FUNCTION public.sincronizar_assinatura_empresa(p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when v_empresa.restauracao_pendente_pagamento_em is not null then 'bloqueada'
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
$function$
;

-- Só restaura registros ainda retidos e usuários que estavam ativos.
-- Integrações WhatsApp e automações continuam desligadas até revisão e pagamento.
create or replace function public.restaurar_empresa_admin(p_empresa_id uuid)
returns jsonb language plpgsql security invoker set search_path='public'
as $$
declare v_empresa public.empresas%rowtype; v_agora timestamptz:=now();
begin
  select * into v_empresa from public.empresas where id=p_empresa_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if v_empresa.status <> 'cancelada' then raise exception 'Somente empresas canceladas podem ser restauradas.'; end if;
  if v_empresa.encerramento_backup_estado='processando'
    then raise exception 'Aguarde o término do backup antes de restaurar.'; end if;
  if v_empresa.exclusao_prevista_em is null or v_empresa.exclusao_prevista_em <= v_agora
    then raise exception 'O prazo de restauração terminou.'; end if;

  update public.empresas set
    status='ativa',
    assinatura_status='bloqueada',
    restauracao_pendente_pagamento_em=v_agora,
    assinatura_fluxos_pausados_em=coalesce(assinatura_fluxos_pausados_em,v_agora),
    cancelada_em=null, exclusao_prevista_em=null, encerramento_por=null,
    encerramento_backup_estado=null,encerramento_backup_erro=null,
    updated_at=v_agora
  where id=p_empresa_id;

  update public.usuarios set status='ativo',updated_at=v_agora
    where empresa_id=p_empresa_id and id in (
      select value::uuid from jsonb_array_elements_text(
        coalesce(v_empresa.encerramento_contexto->'usuarios_ativos','[]'::jsonb))
    );
  return jsonb_build_object('ok',true,'empresa_id',p_empresa_id,
    'pendencia_financeira',true,'reconectar_whatsapp',true,
    'reativar_automacoes_manualmente',true);
end $$;
revoke all on function public.restaurar_empresa_admin(uuid) from public,anon,authenticated;
grant execute on function public.restaurar_empresa_admin(uuid) to service_role;
