-- Corrige o retorno da reserva nula do agente de IA e o bloqueio White Label.
CREATE OR REPLACE FUNCTION public.agente_ia_reservar_pendencia(p_pendencia_id uuid, p_lock_token uuid, p_forcar boolean DEFAULT false)
 RETURNS agente_ia_pendencias
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pendencia public.agente_ia_pendencias;
begin
  update public.agente_ia_pendencias
  set
    status = 'processando',
    lock_token = p_lock_token,
    locked_at = now(),
    tentativas = tentativas + 1,
    updated_at = now()
  where id = p_pendencia_id
    and (
      (status = 'pendente' and (p_forcar or processar_em <= now()))
      or (status = 'processando' and (locked_at is null or locked_at < now() - interval '2 minutes'))
    )
  returning * into v_pendencia;

  -- Sem reserva, devolve NULL verdadeiro e não uma linha composta nula.
  if not found then
    return null;
  end if;

  return v_pendencia;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.encerrar_empresa_admin(p_empresa_id uuid, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_empresa public.empresas%rowtype;
  v_contexto jsonb;
  v_agora timestamptz := now();
begin
  select * into v_empresa from public.empresas where id = p_empresa_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if v_empresa.status = 'cancelada' then
    return jsonb_build_object('ok',true,'ja_cancelada',true,'empresa_id',p_empresa_id);
  end if;
  if v_empresa.white_label_tipo = 'gestora' and exists (
    select 1 from public.empresas
    where white_label_id = v_empresa.white_label_id
      and white_label_tipo = 'cliente' and status <> 'cancelada'
  ) then
    raise exception 'Encerre os clientes vinculados ao White Label antes de encerrar a gestora.';
  end if;
  select jsonb_build_object(
    'usuarios_ativos', coalesce((select jsonb_agg(id) from public.usuarios where empresa_id=p_empresa_id and status='ativo'),'[]'::jsonb),
    'fluxos_ativos', coalesce((select jsonb_agg(id) from public.automacao_fluxos where empresa_id=p_empresa_id and status='ativo'),'[]'::jsonb),
    'agenda_regras_ativas', coalesce((select jsonb_agg(id) from public.agenda_automacao_regras where empresa_id=p_empresa_id and ativo),'[]'::jsonb),
    'rotinas_gatilhos_ativos', coalesce((select jsonb_agg(id) from public.rotina_automacao_gatilhos where empresa_id=p_empresa_id and ativo),'[]'::jsonb)
  ) into v_contexto;

  update public.empresas set
    status = 'cancelada', cancelada_em = v_agora,
    assinatura_status = case when v_empresa.white_label_tipo = 'cliente'
                       then 'bloqueada' else v_empresa.assinatura_status end,
    assinatura_fluxos_pausados_em = case when v_empresa.white_label_tipo = 'cliente'
                       then coalesce(v_empresa.assinatura_fluxos_pausados_em, v_agora)
                       else v_empresa.assinatura_fluxos_pausados_em end,
    exclusao_prevista_em = v_agora + interval '60 days',
    encerramento_por = p_usuario_id, encerramento_contexto = v_contexto,
    encerramento_backup_estado = 'pendente',
    encerramento_backup_path = null, encerramento_backup_gerado_em = null,
    encerramento_backup_erro = null,
    encerramento_backup_tentado_em = null,
    encerramento_email_estado = 'pendente',
    encerramento_email_enviado_em = null,
    encerramento_email_tentado_em = null,
    encerramento_email_erro = null,
    updated_at = v_agora
  where id = p_empresa_id;

  update public.usuarios set status='inativo',updated_at=v_agora where empresa_id=p_empresa_id;
  delete from public.usuario_sessoes where empresa_id=p_empresa_id;
  -- Bloqueio local imediato. Nunca revoga o token global da aplicação Meta.
  update public.integracoes_whatsapp set
    status='desconectada', token_ref=null, config_json='{}'::jsonb,
    webhook_verificado=false, updated_at=v_agora,
    coex_status=case when modo_integracao='coexistence' then 'desconectado' else coex_status end
  where empresa_id=p_empresa_id;
  -- A integração com Resend deve ser desligada sem apagar o histórico de e-mails.
  update public.email_marketing_integracoes set habilitado=false,updated_at=v_agora
  where empresa_id=p_empresa_id;
  update public.automacao_fluxos set status='pausado',updated_at=v_agora where empresa_id=p_empresa_id and status='ativo';
  update public.agenda_automacao_regras set ativo=false,updated_at=v_agora where empresa_id=p_empresa_id and ativo;
  update public.rotina_automacao_gatilhos set ativo=false,updated_at=v_agora where empresa_id=p_empresa_id and ativo;
  update public.rotina_automacao_jobs set status='cancelado',cancelado_em=v_agora,origem_cancelamento='encerramento_empresa',updated_at=v_agora
   where empresa_id=p_empresa_id and status in ('pendente','processando');
  update public.agenda_automacao_execucoes set status='cancelado',updated_at=v_agora
   where empresa_id=p_empresa_id and status in ('pendente','processando');
  update public.whatsapp_disparo_campanhas set status='cancelada',updated_at=v_agora
   where empresa_id=p_empresa_id and status not in ('concluida','cancelada');
  return jsonb_build_object('ok',true,'empresa_id',p_empresa_id,
    'cancelada_em',v_agora,'exclusao_prevista_em',v_agora+interval '60 days');
end $function$
;

-- Repara clientes legados cancelados sem iniciar exclusão automática.
-- Não inventar cancelada_em / exclusao_prevista_em sem histórico confiável.
UPDATE public.empresas
SET assinatura_status = 'bloqueada',
    assinatura_fluxos_pausados_em = coalesce(assinatura_fluxos_pausados_em, now()),
    updated_at = now()
WHERE white_label_tipo = 'cliente'
  AND status = 'cancelada'
  AND assinatura_status <> 'bloqueada';
