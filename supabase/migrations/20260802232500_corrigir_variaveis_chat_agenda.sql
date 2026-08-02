-- Garante que os fluxos iniciados por ações do calendário recebam as
-- variáveis do agendamento antes da execução do primeiro bloco.
create or replace function public.crm_sincronizar_variaveis_contexto_agenda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variaveis jsonb;
begin
  if coalesce(new.metadata_json ->> 'tipo_inicio', '') not in (
    'agenda_resposta_whatsapp',
    'agenda_pos_atendimento'
  ) then
    return new;
  end if;

  v_variaveis := coalesce(new.metadata_json -> 'variaveis', '{}'::jsonb);

  if jsonb_typeof(v_variaveis) <> 'object' then
    return new;
  end if;

  insert into public.automacao_variaveis (
    empresa_id,
    execucao_id,
    contato_id,
    chave,
    valor,
    metadata_json,
    updated_at
  )
  select
    new.empresa_id,
    new.id,
    new.contato_id,
    item.chave,
    case jsonb_typeof(item.valor)
      when 'string' then item.valor #>> '{}'
      when 'null' then ''
      else item.valor::text
    end,
    jsonb_build_object(
      'origem', 'contexto_agendamento',
      'tipo_inicio', new.metadata_json ->> 'tipo_inicio',
      'agenda_agendamento_id', new.metadata_json ->> 'agenda_agendamento_id'
    ),
    now()
  from jsonb_each(v_variaveis) as item(chave, valor)
  where length(trim(item.chave)) > 0
    and jsonb_typeof(item.valor) in ('string', 'number', 'boolean', 'null')
  on conflict (execucao_id, chave)
  do update set
    contato_id = excluded.contato_id,
    valor = excluded.valor,
    metadata_json = coalesce(public.automacao_variaveis.metadata_json, '{}'::jsonb)
      || excluded.metadata_json,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists crm_sincronizar_variaveis_contexto_agenda_trigger
  on public.automacao_execucoes;

create trigger crm_sincronizar_variaveis_contexto_agenda_trigger
after insert on public.automacao_execucoes
for each row
execute function public.crm_sincronizar_variaveis_contexto_agenda();

-- Converte o registro técnico dos templates de confirmação e lembrete em uma
-- mensagem real do bot no chat do CRM, usando a mesma copy enviada ao WhatsApp.
create or replace function public.crm_renderizar_template_agenda_no_chat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_variaveis jsonb := '{}'::jsonb;
  v_componente jsonb;
  v_botao jsonb;
  v_tipo text;
  v_parte text;
  v_conteudo text := '';
  v_chave text;
  v_valor text;
  v_titulo_botao text;
  v_botoes jsonb := '[]'::jsonb;
begin
  if new.origem <> 'automatica'
     or coalesce(new.metadata_json ->> 'agenda_automacao', 'false') <> 'true'
  then
    return new;
  end if;

  -- Mensagens automáticas enviadas ao contato devem aparecer como mensagens
  -- do bot, e não como eventos centrais do sistema.
  new.remetente_tipo := 'bot';
  new.remetente_id := null;
  new.tipo_original_meta := coalesce(new.tipo_original_meta, 'template');

  v_variaveis := coalesce(new.metadata_json -> 'variaveis_enviadas', '{}'::jsonb);

  select template.payload
    into v_payload
    from public.whatsapp_templates template
   where template.empresa_id = new.empresa_id
     and template.id::text = coalesce(new.metadata_json ->> 'template_id', '')
   limit 1;

  if v_payload is not null
     and jsonb_typeof(v_payload -> 'components') = 'array'
  then
    for v_componente in
      select value
        from jsonb_array_elements(v_payload -> 'components')
    loop
      v_tipo := upper(coalesce(v_componente ->> 'type', ''));

      if v_tipo in ('HEADER', 'BODY', 'FOOTER')
         and nullif(trim(coalesce(v_componente ->> 'text', '')), '') is not null
      then
        v_parte := v_componente ->> 'text';

        if jsonb_typeof(v_variaveis) = 'object' then
          for v_chave, v_valor in
            select key, value
              from jsonb_each_text(v_variaveis)
          loop
            v_parte := replace(v_parte, '{{' || v_chave || '}}', v_valor);
            v_parte := replace(v_parte, '{{ ' || v_chave || ' }}', v_valor);
          end loop;
        end if;

        v_conteudo := concat_ws(
          E'\n\n',
          nullif(trim(v_conteudo), ''),
          nullif(trim(v_parte), '')
        );
      elsif v_tipo = 'BUTTONS'
            and jsonb_typeof(v_componente -> 'buttons') = 'array'
      then
        for v_botao in
          select value
            from jsonb_array_elements(v_componente -> 'buttons')
        loop
          v_titulo_botao := trim(coalesce(v_botao ->> 'text', ''));

          if v_titulo_botao <> '' then
            v_botoes := v_botoes || jsonb_build_array(
              jsonb_build_object(
                'id', v_titulo_botao,
                'titulo', v_titulo_botao,
                'tipo', lower(coalesce(v_botao ->> 'type', 'quick_reply')),
                'url', nullif(v_botao ->> 'url', '')
              )
            );
          end if;
        end loop;
      end if;
    end loop;
  end if;

  if nullif(trim(v_conteudo), '') is not null then
    new.conteudo := v_conteudo;
  end if;

  new.tipo_mensagem := case
    when jsonb_array_length(v_botoes) > 0 then 'botao'
    else 'texto'
  end;

  new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb)
    || jsonb_build_object(
      'tipo_original_whatsapp', 'template',
      'botoes', v_botoes,
      'conteudo_template_renderizado', new.conteudo
    );

  return new;
end;
$$;

drop trigger if exists crm_renderizar_template_agenda_no_chat_trigger
  on public.mensagens;

create trigger crm_renderizar_template_agenda_no_chat_trigger
before insert on public.mensagens
for each row
execute function public.crm_renderizar_template_agenda_no_chat();
