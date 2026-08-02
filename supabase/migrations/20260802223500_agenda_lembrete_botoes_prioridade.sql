create or replace function public.agenda_automacoes_processar_resposta_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload text;
  v_match text[];
  v_acao text;
  v_agendamento_id uuid;
  v_context_message_id text;
  v_regra_id uuid;
  v_conversa record;
  v_agendamento public.agenda_agendamentos%rowtype;
  v_fluxo_id uuid;
  v_resposta_id uuid;
  v_resumo text;
begin
  if new.origem <> 'recebida' or new.remetente_tipo <> 'contato' then return new; end if;

  v_payload := coalesce(
    new.metadata_json #>> '{interactive,button_reply,id}',
    new.metadata_json #>> '{interactive,list_reply,id}',
    new.metadata_json #>> '{button,payload}',
    new.metadata_json #>> '{button_reply,id}',
    ''
  );
  v_match := regexp_match(v_payload, '^agenda_(confirmar|cancelar|reagendar):([0-9a-fA-F-]{36})$');
  if v_match is null then return new; end if;

  v_acao := v_match[1];
  begin v_agendamento_id := v_match[2]::uuid;
  exception when others then return new; end;

  select id, contato_id, integracao_whatsapp_id
    into v_conversa
    from public.conversas
   where id = new.conversa_id and empresa_id = new.empresa_id;

  select * into v_agendamento
    from public.agenda_agendamentos
   where id = v_agendamento_id and empresa_id = new.empresa_id;

  if v_conversa.id is null
     or v_agendamento.id is null
     or (v_agendamento.contato_id is not null
       and v_conversa.contato_id is distinct from v_agendamento.contato_id) then
    return new;
  end if;

  if v_agendamento.status not in ('agendado', 'confirmado') then return new; end if;

  v_context_message_id := coalesce(new.metadata_json #>> '{context,id}', '');
  if v_context_message_id <> '' then
    select execucao.regra_id
      into v_regra_id
      from public.agenda_automacao_execucoes execucao
     where execucao.empresa_id = new.empresa_id
       and execucao.agendamento_id = v_agendamento.id
       and execucao.mensagem_externa_id = v_context_message_id
       and execucao.tipo in ('confirmacao', 'lembrete')
       and execucao.canal = 'whatsapp'
     order by execucao.created_at desc
     limit 1;
  end if;

  if v_regra_id is not null then
    select fluxo.id
      into v_fluxo_id
      from public.agenda_automacao_regras regra
      cross join lateral jsonb_array_elements(
        coalesce(regra.configuracao_json -> 'template_botoes', '[]'::jsonb)
      ) item
      join public.automacao_fluxos fluxo
        on fluxo.id::text = item ->> 'fluxo_id'
       and fluxo.empresa_id = new.empresa_id
       and fluxo.status = 'ativo'
     where regra.id = v_regra_id
       and regra.empresa_id = new.empresa_id
       and regra.agenda_id = v_agendamento.agenda_id
       and regra.tipo in ('confirmacao', 'lembrete')
       and regra.canal = 'whatsapp'
       and regra.ativo = true
       and item ->> 'acao' = v_acao
     limit 1;
  end if;

  if v_fluxo_id is null then
    select fluxo.id, regra.id
      into v_fluxo_id, v_regra_id
      from public.agenda_automacao_regras regra
      cross join lateral jsonb_array_elements(
        coalesce(regra.configuracao_json -> 'template_botoes', '[]'::jsonb)
      ) item
      join public.automacao_fluxos fluxo
        on fluxo.id::text = item ->> 'fluxo_id'
       and fluxo.empresa_id = new.empresa_id
       and fluxo.status = 'ativo'
     where regra.empresa_id = new.empresa_id
       and regra.agenda_id = v_agendamento.agenda_id
       and regra.tipo in ('confirmacao', 'lembrete')
       and regra.canal = 'whatsapp'
       and regra.ativo = true
       and item ->> 'acao' = v_acao
     order by case when regra.tipo = 'confirmacao' then 0 else 1 end, regra.ordem
     limit 1;
  end if;

  if v_acao = 'confirmar' then
    update public.agenda_agendamentos
       set status = 'confirmado',
           confirmacao_status = 'confirmado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'confirmacao_whatsapp', jsonb_build_object(
               'acao', v_acao, 'mensagem_id', new.id, 'regra_id', v_regra_id,
               'respondido_em', now()
             )
           )
     where id = v_agendamento.id and empresa_id = new.empresa_id;
    v_resumo := 'O cliente confirmou o agendamento pelo WhatsApp.';
  elsif v_acao = 'cancelar' then
    update public.agenda_agendamentos
       set confirmacao_status = 'cancelamento_solicitado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'cancelamento_whatsapp', jsonb_build_object(
               'acao', v_acao, 'mensagem_id', new.id, 'regra_id', v_regra_id,
               'solicitado_em', now()
             )
           )
     where id = v_agendamento.id and empresa_id = new.empresa_id;
    v_resumo := 'O cliente iniciou a solicitação de cancelamento pelo WhatsApp.';
  else
    update public.agenda_agendamentos
       set confirmacao_status = 'reagendamento_solicitado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'reagendamento_whatsapp', jsonb_build_object(
               'acao', v_acao, 'mensagem_id', new.id, 'regra_id', v_regra_id,
               'solicitado_em', now()
             )
           )
     where id = v_agendamento.id and empresa_id = new.empresa_id;
    v_resumo := 'O cliente iniciou a solicitação de reagendamento pelo WhatsApp.';
  end if;

  update public.agenda_automacao_execucoes
     set status = case when status = 'concluido' then status else 'cancelado' end,
         bloqueado_em = null,
         erro = case when status = 'concluido' then erro else 'Execução cancelada após resposta do cliente.' end,
         resultado_json = coalesce(resultado_json, '{}'::jsonb) || jsonb_build_object(
           'acao_resposta', v_acao, 'mensagem_resposta_id', new.id,
           'regra_origem_id', v_regra_id, 'respondido_em', now()
         ),
         updated_at = now()
   where empresa_id = new.empresa_id
     and agendamento_id = v_agendamento.id
     and tipo in ('confirmacao', 'lembrete')
     and status in ('pendente', 'processando', 'concluido', 'erro');

  insert into public.agenda_automacao_respostas (
    empresa_id, agenda_id, agendamento_id, conversa_id, mensagem_id,
    fluxo_id, acao, status, proxima_tentativa_em, erro, payload_json
  ) values (
    new.empresa_id, v_agendamento.agenda_id, v_agendamento.id, new.conversa_id, new.id,
    v_fluxo_id, v_acao,
    case when v_fluxo_id is null then 'cancelado' else 'pendente' end,
    case when v_fluxo_id is null then null else now() end,
    case when v_fluxo_id is null then 'Nenhum fluxo ativo foi mapeado para esta ação.' else null end,
    jsonb_build_object(
      'payload', v_payload,
      'context_message_id', nullif(v_context_message_id, ''),
      'regra_origem_id', v_regra_id,
      'contato_id', v_agendamento.contato_id,
      'agenda_inicio_at', v_agendamento.inicio_at,
      'agenda_fim_at', v_agendamento.fim_at
    )
  )
  on conflict (mensagem_id) do update
     set updated_at = excluded.updated_at
  returning id into v_resposta_id;

  if v_agendamento.responsavel_id is not null then
    insert into public.notificacoes (
      empresa_id, usuario_id, conversa_id, contato_id, tipo, titulo, mensagem, lida, metadata_json
    ) values (
      new.empresa_id, v_agendamento.responsavel_id, new.conversa_id,
      v_agendamento.contato_id, 'automacao',
      case
        when v_acao = 'reagendar' then 'Reagendamento solicitado'
        when v_acao = 'cancelar' then 'Cancelamento solicitado'
        else 'Agendamento confirmado'
      end,
      v_resumo, false,
      jsonb_build_object(
        'tipo_notificacao', 'agenda_resposta_whatsapp',
        'agenda_agendamento_id', v_agendamento.id,
        'agenda_id', v_agendamento.agenda_id,
        'agenda_automacao_resposta_id', v_resposta_id,
        'agenda_automacao_regra_id', v_regra_id,
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
       'agenda_automacao_resposta_id', v_resposta_id,
       'agenda_automacao_regra_id', v_regra_id,
       'agenda_acao_processada_em', now(),
       'automacao_processada', true,
       'automacao_processada_em', now(),
       'automacao_resultado', jsonb_build_object(
         'ok', true,
         'status', case when v_fluxo_id is null then 'agenda_acao_sem_fluxo' else 'agenda_fluxo_agendado' end,
         'acao', v_acao,
         'agendamento_id', v_agendamento.id,
         'fluxo_id', v_fluxo_id,
         'regra_id', v_regra_id
       )
     )
   where id = new.id;

  return new;
end;
$function$;
