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
  if tg_op <> 'DELETE' then
    if tg_table_name = 'conversas' then
      if new.status not in (
        'aberta',
        'bot',
        'fila',
        'em_atendimento',
        'aguardando_cliente'
      ) then
        return new;
      end if;

      if new.window_expires_at is null
         and new.atendimento_humano_ate is null
      then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status in (
           'aberta',
           'bot',
           'fila',
           'em_atendimento',
           'aguardando_cliente'
         )
         and new.window_expires_at is not distinct from old.window_expires_at
         and new.atendimento_humano_ate is not distinct from old.atendimento_humano_ate
      then
        return new;
      end if;

    elsif tg_table_name = 'agenda_automacao_execucoes' then
      if new.status <> 'pendente' then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status = 'pendente'
         and new.executar_em is not distinct from old.executar_em
         and new.proxima_tentativa_em is not distinct from old.proxima_tentativa_em
      then
        return new;
      end if;

    elsif tg_table_name = 'agenda_automacao_respostas' then
      if new.status <> 'pendente' then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status = 'pendente'
         and new.proxima_tentativa_em is not distinct from old.proxima_tentativa_em
      then
        return new;
      end if;

    elsif tg_table_name = 'agenda_google_sync_fila' then
      if new.status <> 'pendente' then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status = 'pendente'
         and new.proxima_tentativa_em is not distinct from old.proxima_tentativa_em
      then
        return new;
      end if;

    elsif tg_table_name = 'agenda_google_integracoes' then
      if new.sync_ativo is not true
         or new.sync_status <> 'pendente_google'
      then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.sync_status = 'pendente_google'
      then
        return new;
      end if;

    elsif tg_table_name = 'integracao_eventos_outbox' then
      if new.status <> 'pendente' then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status = 'pendente'
         and new.processar_em is not distinct from old.processar_em
      then
        return new;
      end if;

    elsif tg_table_name = 'rotina_automacao_jobs' then
      if new.status <> 'pendente'
         or coalesce(new.contexto_json ->> 'origem', '') <> 'integracao_mapeada'
      then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status = 'pendente'
         and new.executar_em is not distinct from old.executar_em
         and new.proxima_tentativa_em is not distinct from old.proxima_tentativa_em
      then
        return new;
      end if;

    elsif tg_table_name = 'pagamento_gateway_transacoes' then
      if new.status <> 'aguardando_pagamento' then
        return new;
      end if;

      if tg_op = 'UPDATE'
         and old.status = 'aguardando_pagamento'
         and new.expira_em is not distinct from old.expira_em
         and not (
           old.recuperacao_enviada_em is not null
           and new.recuperacao_enviada_em is null
         )
      then
        return new;
      end if;

    else
      return new;
    end if;
  end if;

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
