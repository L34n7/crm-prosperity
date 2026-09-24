-- Corrige a desconexao de integracoes com historico grande.
--
-- Ao limpar integracao_whatsapp_id de milhares de conversas, o trigger de opt-in
-- refazia consultas/upserts para cada conversa mesmo sem nova mensagem recebida.
-- Na desconexao esse trabalho e desnecessario: o opt-in historico ja existe e
-- deve ser preservado. A guarda abaixo evita esse custo.
create or replace function public.registrar_whatsapp_opt_in_por_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_number_id text;
  v_telefone_normalizado text;
begin
  if new.last_inbound_message_at is null
    or new.empresa_id is null
    or new.contato_id is null
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.last_inbound_message_at is not distinct from new.last_inbound_message_at
    and old.integracao_whatsapp_id is not null
    and new.integracao_whatsapp_id is null
  then
    return new;
  end if;

  select nullif(btrim(integracao.phone_number_id), '')
    into v_phone_number_id
  from public.integracoes_whatsapp integracao
  where integracao.id = new.integracao_whatsapp_id
    and integracao.empresa_id = new.empresa_id;

  v_phone_number_id := coalesce(
    v_phone_number_id,
    nullif(btrim(new.integracao_whatsapp_phone_number_id_anterior), '')
  );

  select public.normalizar_telefone_whatsapp(contato.telefone)
    into v_telefone_normalizado
  from public.contatos contato
  where contato.id = new.contato_id
    and contato.empresa_id = new.empresa_id;

  if v_phone_number_id is null
    or coalesce(v_telefone_normalizado, '') = ''
  then
    return new;
  end if;

  insert into public.whatsapp_contatos_opt_in_numeros (
    empresa_id,
    contato_id,
    phone_number_id,
    telefone_normalizado,
    integracao_whatsapp_id,
    primeira_interacao_em,
    ultima_interacao_em,
    ativo,
    origem,
    metadata_json,
    updated_at
  )
  values (
    new.empresa_id,
    new.contato_id,
    v_phone_number_id,
    v_telefone_normalizado,
    new.integracao_whatsapp_id,
    new.last_inbound_message_at,
    new.last_inbound_message_at,
    true,
    'mensagem_recebida',
    jsonb_build_object('conversa_id', new.id),
    now()
  )
  on conflict (
    empresa_id,
    contato_id,
    phone_number_id,
    telefone_normalizado
  )
  do update set
    integracao_whatsapp_id = excluded.integracao_whatsapp_id,
    primeira_interacao_em = least(
      public.whatsapp_contatos_opt_in_numeros.primeira_interacao_em,
      excluded.primeira_interacao_em
    ),
    ultima_interacao_em = greatest(
      public.whatsapp_contatos_opt_in_numeros.ultima_interacao_em,
      excluded.ultima_interacao_em
    ),
    ativo = true,
    metadata_json =
      public.whatsapp_contatos_opt_in_numeros.metadata_json
      || excluded.metadata_json,
    updated_at = now();

  return new;
end;
$$;

-- A limpeza continua atomica, mas ganha margem para empresas com milhares de
-- conversas/logs. A API nao repete imediatamente uma transacao que atingir
-- este limite, evitando chegar ao timeout de 300s da Vercel.
alter function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid)
  set statement_timeout to '120s';

comment on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid) is
  'Cria backup e exclui uma integracao Meta atomicamente. Usa lock_timeout curto e statement_timeout de 120s; a limpeza de conversas ignora trabalho de opt-in sem nova entrada.';
