create extension if not exists pg_net with schema extensions;

create or replace function public.processar_conversa_expirada_id(
  p_conversa_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversa public.conversas%rowtype;
  v_agora timestamptz := clock_timestamp();
begin
  select *
    into v_conversa
    from public.conversas
   where id = p_conversa_id
   for update;

  if not found then
    return false;
  end if;

  if v_conversa.status not in (
    'aberta',
    'bot',
    'fila',
    'em_atendimento',
    'aguardando_cliente'
  ) then
    return false;
  end if;

  if v_conversa.window_expires_at is null
     or v_conversa.window_expires_at > v_agora
     or (
       v_conversa.atendimento_humano_ate is not null
       and v_conversa.atendimento_humano_ate > v_agora
     )
  then
    return false;
  end if;

  update public.conversas
     set status = 'encerrado_24h',
         bot_ativo = false,
         responsavel_id = null,
         aguardando_atendente = false,
         agente_ia_id = null,
         agente_ia_protocolo_id = null,
         agente_ia_fallback_ativo = false,
         atendimento_humano_ate = null,
         closed_at = v_agora,
         updated_at = v_agora
   where id = v_conversa.id
     and empresa_id = v_conversa.empresa_id;

  update public.conversa_protocolos
     set ativo = false,
         closed_at = v_agora,
         updated_at = v_agora
   where empresa_id = v_conversa.empresa_id
     and conversa_id = v_conversa.id
     and ativo = true;

  update public.automacao_execucoes
     set status = 'cancelado',
         finished_at = v_agora,
         updated_at = v_agora,
         metadata_json =
           coalesce(metadata_json, '{}'::jsonb)
           || jsonb_build_object('motivo_cancelamento', 'janela_24h_expirada')
   where empresa_id = v_conversa.empresa_id
     and conversa_id = v_conversa.id
     and status in ('rodando', 'aguardando', 'pausado');

  insert into public.mensagens (
    empresa_id,
    conversa_id,
    remetente_tipo,
    conteudo,
    tipo_mensagem,
    origem,
    status_envio,
    created_at,
    updated_at
  )
  values (
    v_conversa.empresa_id,
    v_conversa.id,
    'sistema',
    'Conversa encerrada automaticamente porque a janela de 24 horas do WhatsApp expirou sem nova resposta do cliente.',
    'texto',
    'automatica',
    'lida',
    v_agora,
    v_agora
  );

  return true;
end;
$$;

revoke all on function public.processar_conversa_expirada_id(uuid)
  from public, anon, authenticated;
grant execute on function public.processar_conversa_expirada_id(uuid)
  to service_role;

create or replace function public.crm_disparar_evento_backend()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
declare
  v_payload jsonb;
  v_request_id bigint;
begin
  v_payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );

  select net.http_post(
    url := 'https://crmprosperity.com/api/internal/eventos-db',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crm-db-event', 'postgres-v1'
    ),
    body := v_payload,
    timeout_milliseconds := 2000
  )
  into v_request_id;

  return case when tg_op = 'DELETE' then old else new end;
exception when others then
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.crm_disparar_evento_backend()
  from public, anon, authenticated;

drop trigger if exists crm_evento_conversa_expiracao on public.conversas;
create trigger crm_evento_conversa_expiracao
after insert or update of window_expires_at, atendimento_humano_ate, status
on public.conversas
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_agenda_execucao on public.agenda_automacao_execucoes;
create trigger crm_evento_agenda_execucao
after insert or update of status, executar_em, proxima_tentativa_em
on public.agenda_automacao_execucoes
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_agenda_resposta on public.agenda_automacao_respostas;
create trigger crm_evento_agenda_resposta
after insert or update of status, proxima_tentativa_em
on public.agenda_automacao_respostas
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_google_fila on public.agenda_google_sync_fila;
create trigger crm_evento_google_fila
after insert or update of status, proxima_tentativa_em
on public.agenda_google_sync_fila
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_google_integracao on public.agenda_google_integracoes;
create trigger crm_evento_google_integracao
after update of sync_status
on public.agenda_google_integracoes
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_integracao_outbox on public.integracao_eventos_outbox;
create trigger crm_evento_integracao_outbox
after insert or update of status, processar_em
on public.integracao_eventos_outbox
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_rotina_job on public.rotina_automacao_jobs;
create trigger crm_evento_rotina_job
after insert or update of status, executar_em, proxima_tentativa_em
on public.rotina_automacao_jobs
for each row execute function public.crm_disparar_evento_backend();

drop trigger if exists crm_evento_checkout_transacao on public.pagamento_gateway_transacoes;
create trigger crm_evento_checkout_transacao
after insert or update of status, expira_em, recuperacao_enviada_em
on public.pagamento_gateway_transacoes
for each row execute function public.crm_disparar_evento_backend();
