-- Ajusta a resposta de confirmação para preservar lembretes futuros.

create or replace function public.agenda_automacoes_processar_resposta_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload text;
  v_match text[];
  v_acao text;
  v_agendamento_id uuid;
  v_conversa record;
  v_agendamento public.agenda_agendamentos%rowtype;
  v_resumo text;
begin
  if new.origem <> 'recebida' or new.remetente_tipo <> 'contato' then
    return new;
  end if;

  v_payload := coalesce(
    new.metadata_json #>> '{interactive,button_reply,id}',
    new.metadata_json #>> '{interactive,list_reply,id}',
    new.metadata_json #>> '{button,payload}',
    new.metadata_json #>> '{button_reply,id}',
    ''
  );
  v_match := regexp_match(
    v_payload,
    '^agenda_(confirmar|cancelar|reagendar):([0-9a-fA-F-]{36})$'
  );
  if v_match is null then
    return new;
  end if;

  v_acao := v_match[1];
  begin
    v_agendamento_id := v_match[2]::uuid;
  exception when others then
    return new;
  end;

  select id, contato_id, integracao_whatsapp_id
    into v_conversa
    from public.conversas
   where id = new.conversa_id
     and empresa_id = new.empresa_id;

  select *
    into v_agendamento
    from public.agenda_agendamentos
   where id = v_agendamento_id
     and empresa_id = new.empresa_id;

  if v_conversa.id is null
     or v_agendamento.id is null
     or (v_agendamento.contato_id is not null
       and v_conversa.contato_id is distinct from v_agendamento.contato_id) then
    return new;
  end if;

  if v_acao = 'confirmar'
     and v_agendamento.status in ('agendado', 'confirmado') then
    update public.agenda_agendamentos
       set status = 'confirmado',
           confirmacao_status = 'confirmado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'confirmacao_whatsapp', jsonb_build_object(
               'acao', v_acao,
               'mensagem_id', new.id,
               'respondido_em', now()
             )
           )
     where id = v_agendamento.id
       and empresa_id = new.empresa_id;
    v_resumo := 'O cliente confirmou o agendamento pelo WhatsApp.';
  elsif v_acao = 'cancelar'
     and v_agendamento.status in ('agendado', 'confirmado') then
    update public.agenda_agendamentos
       set status = 'cancelado',
           confirmacao_status = 'recusado',
           cancelado_em = coalesce(cancelado_em, now()),
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'cancelamento_whatsapp', jsonb_build_object(
               'acao', v_acao,
               'mensagem_id', new.id,
               'cancelado_em', now()
             )
           )
     where id = v_agendamento.id
       and empresa_id = new.empresa_id;
    v_resumo := 'O cliente cancelou o agendamento pelo WhatsApp.';
  elsif v_acao = 'reagendar'
     and v_agendamento.status in ('agendado', 'confirmado') then
    update public.agenda_agendamentos
       set status = 'agendado',
           confirmacao_status = 'reagendamento_solicitado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'reagendamento_whatsapp', jsonb_build_object(
               'acao', v_acao,
               'mensagem_id', new.id,
               'solicitado_em', now()
             )
           )
     where id = v_agendamento.id
       and empresa_id = new.empresa_id;

    update public.conversas
       set status = 'fila',
           aguardando_atendente = true,
           bot_ativo = false,
           updated_at = now()
     where id = v_conversa.id
       and empresa_id = new.empresa_id;
    v_resumo := 'O cliente solicitou o reagendamento pelo WhatsApp.';
  else
    return new;
  end if;

  update public.agenda_automacao_execucoes
     set status = case when status = 'concluido' then status else 'cancelado' end,
         bloqueado_em = null,
         erro = case
           when status = 'concluido' then erro
           else 'Execução cancelada após resposta do cliente.'
         end,
         resultado_json = coalesce(resultado_json, '{}'::jsonb) || jsonb_build_object(
           'acao_resposta', v_acao,
           'mensagem_resposta_id', new.id,
           'respondido_em', now()
         ),
         updated_at = now()
   where empresa_id = new.empresa_id
     and agendamento_id = v_agendamento.id
     and (
       (v_acao = 'confirmar' and tipo = 'confirmacao')
       or (v_acao in ('cancelar', 'reagendar') and tipo in ('confirmacao', 'lembrete'))
     )
     and status in ('pendente', 'processando', 'concluido', 'erro');

  if v_agendamento.responsavel_id is not null then
    insert into public.notificacoes (
      empresa_id,
      usuario_id,
      conversa_id,
      contato_id,
      tipo,
      titulo,
      mensagem,
      lida,
      metadata_json
    ) values (
      new.empresa_id,
      v_agendamento.responsavel_id,
      new.conversa_id,
      v_agendamento.contato_id,
      'automacao',
      case
        when v_acao = 'reagendar' then 'Reagendamento solicitado'
        when v_acao = 'cancelar' then 'Agendamento cancelado'
        else 'Agendamento confirmado'
      end,
      v_resumo,
      false,
      jsonb_build_object(
        'tipo_notificacao', 'agenda_resposta_whatsapp',
        'agenda_agendamento_id', v_agendamento.id,
        'agenda_id', v_agendamento.agenda_id,
        'acao', v_acao,
        'mensagem_id', new.id,
        'href', '/agendas?agenda=' || v_agendamento.agenda_id::text ||
          '&agendamento=' || v_agendamento.id::text
      )
    );
  end if;

  update public.mensagens
     set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
       'agenda_acao_processada', true,
       'agenda_acao', v_acao,
       'agenda_agendamento_id', v_agendamento.id,
       'agenda_acao_processada_em', now(),
       'automacao_processada', true,
       'automacao_processada_em', now(),
       'automacao_resultado', jsonb_build_object(
         'ok', true,
         'status', 'agenda_acao_processada',
         'acao', v_acao,
         'agendamento_id', v_agendamento.id
       )
     )
   where id = new.id;

  return new;
end;
$function$;

drop trigger if exists agenda_automacoes_processar_resposta_trigger on public.mensagens;
create trigger agenda_automacoes_processar_resposta_trigger
after insert on public.mensagens
for each row execute function public.agenda_automacoes_processar_resposta_whatsapp();
