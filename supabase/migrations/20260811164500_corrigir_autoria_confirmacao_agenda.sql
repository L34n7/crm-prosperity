-- Registra como ação do contato a confirmação feita pelos botões da automação.
create or replace function public.agenda_etapa1_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_acao text;
  v_descricao text;
  v_usuario_id uuid;
  v_confirmacao_contato boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.agenda_historico (
      empresa_id,
      agendamento_id,
      usuario_id,
      acao,
      descricao,
      status_anterior,
      status_novo,
      dados_anteriores,
      dados_novos
    ) values (
      new.empresa_id,
      new.id,
      new.created_by,
      'criado',
      'Agendamento criado.',
      null,
      new.status,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  v_confirmacao_contato :=
    new.status = 'confirmado'
    and new.status is distinct from old.status
    and nullif(
      new.metadata_json #>> '{confirmacao_whatsapp,respondido_em}',
      ''
    ) is not null
    and (
      new.metadata_json #>> '{confirmacao_whatsapp,respondido_em}'
    ) is distinct from (
      old.metadata_json #>> '{confirmacao_whatsapp,respondido_em}'
    );

  v_usuario_id := case
    when v_confirmacao_contato then null
    else coalesce(new.updated_by, old.updated_by, new.created_by)
  end;

  if new.status is distinct from old.status then
    v_acao := 'status_alterado';
    v_descricao := 'Status alterado de '
      || coalesce(old.status, '-')
      || ' para '
      || coalesce(new.status, '-')
      || '.';
  elsif new.inicio_at is distinct from old.inicio_at
    or new.fim_at is distinct from old.fim_at then
    v_acao := 'reagendado';
    v_descricao := 'Data ou horário do agendamento alterado.';
  else
    v_acao := 'atualizado';
    v_descricao := 'Informações do agendamento atualizadas.';
  end if;

  insert into public.agenda_historico (
    empresa_id,
    agendamento_id,
    usuario_id,
    acao,
    descricao,
    status_anterior,
    status_novo,
    dados_anteriores,
    dados_novos
  ) values (
    new.empresa_id,
    new.id,
    v_usuario_id,
    v_acao,
    v_descricao,
    old.status,
    new.status,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$function$;

-- Corrige também os registros já existentes, como a confirmação exibida no histórico.
update public.agenda_historico
set usuario_id = null
where acao = 'status_alterado'
  and status_novo = 'confirmado'
  and nullif(
    dados_novos #>> '{metadata_json,confirmacao_whatsapp,respondido_em}',
    ''
  ) is not null
  and abs(
    extract(
      epoch from (
        created_at
        - (dados_novos #>> '{metadata_json,confirmacao_whatsapp,respondido_em}')::timestamptz
      )
    )
  ) <= 300;
