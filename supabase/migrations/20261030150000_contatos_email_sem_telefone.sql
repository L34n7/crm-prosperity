-- Contatos por telefone OU e-mail. Preserva a função ativa de campo_contato por lista.
alter table public.contatos alter column telefone drop not null;

alter table public.contatos
  add constraint contatos_telefone_ou_email_chk
  check (
    nullif(btrim(telefone), '') is not null
    or nullif(btrim(email), '') is not null
  );

create unique index if not exists contatos_email_sem_telefone_uidx
  on public.contatos (empresa_id, lower(btrim(email)))
  where telefone is null and nullif(btrim(email), '') is not null;

create or replace function public.buscar_emails_contatos_existentes(
  p_empresa_id uuid, p_emails text[]
)
returns table(email_normalizado text)
language sql stable security definer
set search_path = public
as $$
  select distinct lower(btrim(c.email)) from public.contatos c
  where c.empresa_id = p_empresa_id and c.email is not null
    and lower(btrim(c.email)) = any(coalesce(p_emails, '{}'::text[]));
$$;

revoke all on function public.buscar_emails_contatos_existentes(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.buscar_emails_contatos_existentes(uuid, text[])
  to service_role;

CREATE OR REPLACE FUNCTION public.processar_lote_importacao_contatos(p_importacao_id uuid, p_tamanho_lote integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_importacao public.contatos_importacoes%rowtype;
  v_lote jsonb;
  v_processados integer := 0;
  v_importados integer := 0;
  v_vinculados integer := 0;
  v_aceitos integer := 0;
  v_novo_cursor integer := 0;
  v_concluida boolean := false;
  v_erro text;
begin
  p_tamanho_lote := least(greatest(coalesce(p_tamanho_lote, 100), 1), 200);

  select *
  into v_importacao
  from public.contatos_importacoes
  where id = p_importacao_id
  for update skip locked;

  if not found then
    if exists (
      select 1
      from public.contatos_importacoes
      where id = p_importacao_id
        and status = 'concluida'
    ) then
      return jsonb_build_object(
        'ok', true,
        'concluida', true,
        'ignorada', true,
        'motivo', 'Importação já concluída.'
      );
    end if;

    if exists (
      select 1
      from public.contatos_importacoes
      where id = p_importacao_id
    ) then
      return jsonb_build_object(
        'ok', true,
        'concluida', false,
        'ocupada', true,
        'motivo', 'Outro worker está processando esta importação.'
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'concluida', false,
      'erro', 'Importação não encontrada.'
    );
  end if;

  if v_importacao.status = 'concluida' then
    return jsonb_build_object(
      'ok', true,
      'concluida', true,
      'ignorada', true,
      'motivo', 'Importação já concluída.'
    );
  end if;

  update public.contatos_importacoes
  set
    status = 'processando',
    tentativas = tentativas + 1,
    started_at = coalesce(started_at, now()),
    erro = null,
    updated_at = now()
  where id = p_importacao_id;

  select coalesce(jsonb_agg(item order by ordem), '[]'::jsonb)
  into v_lote
  from jsonb_array_elements(v_importacao.payload_json)
    with ordinality as itens(item, ordem)
  where ordem > v_importacao.cursor_atual
    and ordem <= v_importacao.cursor_atual + p_tamanho_lote;

  v_processados := jsonb_array_length(v_lote);

  if v_processados = 0 then
    update public.contatos_importacoes
    set
      status = 'concluida',
      cursor_atual = total,
      processados = total,
      payload_json = '[]'::jsonb,
      completed_at = coalesce(completed_at, now()),
      erro = null,
      updated_at = now()
    where id = p_importacao_id;

    return jsonb_build_object(
      'ok', true,
      'concluida', true,
      'processados_lote', 0,
      'importados_lote', 0,
      'vinculados_lista_lote', 0,
      'ignorados_lote', 0,
      'cursor_atual', v_importacao.total,
      'total', v_importacao.total
    );
  end if;

  begin
    with lote as (
      select
        nullif(btrim(item.nome), '') as nome,
        nullif(regexp_replace(coalesce(item.telefone, ''), '\D', '', 'g'), '') as telefone,
        nullif(lower(btrim(item.email)), '') as email,
        nullif(btrim(item.origem), '') as origem,
        nullif(btrim(item.campanha), '') as campanha,
        coalesce(
          nullif(btrim(item.campo_contato), ''),
          nullif(btrim(item.variavel_contato), '')
        ) as campo_contato,
        nullif(btrim(item.observacoes), '') as observacoes,
        coalesce(item.telefone_revisar, false) as telefone_revisar
      from jsonb_to_recordset(v_lote) as item(
        nome text,
        telefone text,
        email text,
        origem text,
        campanha text,
        campo_contato text,
        variavel_contato text,
        observacoes text,
        telefone_revisar boolean
      )
    ),
    inseridos as (
      insert into public.contatos (
        empresa_id,
        nome,
        telefone,
        email,
        origem,
        campanha,
        campo_contato,
        classificacao,
        classificacao_atualizada_em,
        observacoes,
        telefone_revisar
      )
      select
        v_importacao.empresa_id,
        lote.nome,
        lote.telefone,
        lote.email,
        lote.origem,
        lote.campanha,
        lote.campo_contato,
        null,
        null,
        lote.observacoes,
        lote.telefone_revisar
      from lote
      where (
        (lote.telefone is not null and length(lote.telefone) >= 8)
        or (lote.telefone is null and lote.email is not null)
      )
      and not (
        lote.telefone is null and lote.email is not null and exists (
          select 1 from public.contatos existente
          where existente.empresa_id = v_importacao.empresa_id
            and lower(btrim(existente.email)) = lote.email
        )
      )
      on conflict do nothing
      returning id, telefone, email
    ),
    atualizados_existentes as (
      update public.contatos contato
      set
        campo_contato = lote.campo_contato,
        updated_at = now()
      from lote
      where coalesce(v_importacao.permitir_contatos_existentes, false)
        and lote.campo_contato is not null
        and contato.empresa_id = v_importacao.empresa_id
        and (
          (lote.telefone is not null and contato.telefone = lote.telefone)
          or (lote.telefone is null and lote.email is not null
              and lower(btrim(contato.email)) = lote.email)
        )
        and contato.campo_contato is distinct from lote.campo_contato
      returning contato.id
    ),
    candidatos_lista as (
      select
        inserido.id as contato_id,
        lote.campo_contato
      from inseridos inserido
      join lote
        on (
          (lote.telefone is not null and lote.telefone = inserido.telefone)
          or (lote.telefone is null and lote.email is not null
              and lote.email = inserido.email)
        )
      where v_importacao.lista_id is not null

      union

      select
        contato.id as contato_id,
        lote.campo_contato
      from lote
      join public.contatos contato
        on contato.empresa_id = v_importacao.empresa_id
       and (
         (lote.telefone is not null and contato.telefone = lote.telefone)
         or (lote.telefone is null and lote.email is not null
             and lower(btrim(contato.email)) = lote.email)
       )
      where v_importacao.lista_id is not null
        and coalesce(v_importacao.permitir_contatos_existentes, false)
    ),
    membros_inseridos as (
      insert into public.contatos_lista_membros (
        lista_id,
        contato_id,
        campo_contato
      )
      select
        v_importacao.lista_id,
        candidato.contato_id,
        candidato.campo_contato
      from candidatos_lista candidato
      on conflict (lista_id, contato_id) do update
      set campo_contato = excluded.campo_contato
      returning contato_id
    )
    select
      (select count(*)::integer from inseridos),
      (select count(*)::integer from membros_inseridos)
    into v_importados, v_vinculados;
  exception
    when others then
      get stacked diagnostics v_erro = message_text;

      update public.contatos_importacoes
      set
        status = 'erro',
        erro = v_erro,
        updated_at = now()
      where id = p_importacao_id;

      return jsonb_build_object(
        'ok', false,
        'concluida', false,
        'erro', v_erro,
        'repetir', true
      );
  end;

  v_aceitos := greatest(v_importados, v_vinculados);
  v_novo_cursor := least(
    v_importacao.total,
    v_importacao.cursor_atual + v_processados
  );
  v_concluida := v_novo_cursor >= v_importacao.total;

  update public.contatos_importacoes
  set
    status = case when v_concluida then 'concluida' else 'pendente' end,
    cursor_atual = v_novo_cursor,
    processados = processados + v_processados,
    importados = importados + v_importados,
    membros_vinculados = membros_vinculados + v_vinculados,
    ignorados = ignorados + greatest(v_processados - v_aceitos, 0),
    payload_json = case when v_concluida then '[]'::jsonb else payload_json end,
    completed_at = case when v_concluida then now() else completed_at end,
    erro = null,
    updated_at = now()
  where id = p_importacao_id;

  return jsonb_build_object(
    'ok', true,
    'concluida', v_concluida,
    'processados_lote', v_processados,
    'importados_lote', v_importados,
    'vinculados_lista_lote', v_vinculados,
    'ignorados_lote', greatest(v_processados - v_aceitos, 0),
    'cursor_atual', v_novo_cursor,
    'total', v_importacao.total
  );
end;
$function$;

revoke all on function public.processar_lote_importacao_contatos(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.processar_lote_importacao_contatos(uuid, integer)
  to service_role;
