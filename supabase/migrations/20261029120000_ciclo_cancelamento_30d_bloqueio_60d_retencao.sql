-- Novos cancelamentos: 30 dias após bloqueio financeiro + 60 dias de retenção.
-- Empresas já canceladas preservam a data de exclusão previamente registrada.
-- Empresas já bloqueadas ganham 30 dias de transição antes do cancelamento automático.
alter table public.empresas
  add column if not exists cancelamento_auto_nao_antes_em timestamptz,
  add column if not exists encerramento_email_estado text not null default 'pendente',
  add column if not exists encerramento_email_tentado_em timestamptz,
  add column if not exists encerramento_email_enviado_em timestamptz,
  add column if not exists encerramento_email_erro text,
  add column if not exists encerramento_origem text;

alter table public.empresas
  drop constraint if exists empresas_encerramento_email_estado_check;
alter table public.empresas
  add constraint empresas_encerramento_email_estado_check
    check (encerramento_email_estado in ('pendente','processando','enviado','legado'));

-- Sem disparo retroativo para empresas que já estavam canceladas antes da regra.
update public.empresas set encerramento_email_estado='legado'
where status='cancelada' and encerramento_email_estado='pendente'
  and encerramento_email_enviado_em is null;

-- Não encerrar silenciosamente empresas com inadimplência anterior à implantação.
update public.empresas
  set cancelamento_auto_nao_antes_em=now()+interval '30 days'
where status='ativa' and assinatura_status='bloqueada'
  and cancelamento_auto_nao_antes_em is null;

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
revoke all on function public.encerrar_empresa_admin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.encerrar_empresa_admin(uuid,uuid) to service_role;

-- Histórico antigo de aviso de 50 dias permanece apenas para auditoria.
-- Modelo novo de e-mail de cancelamento não usa o tipo dos avisos recorrentes.
create index if not exists empresas_cancelamento_auto_agenda_idx
 on public.empresas(assinatura_bloqueio_em)
 where status='ativa' and assinatura_status='bloqueada';
