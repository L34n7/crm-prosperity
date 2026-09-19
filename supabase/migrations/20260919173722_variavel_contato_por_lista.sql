alter table public.contatos_lista_membros
  add column if not exists variavel_contato text;

comment on column public.contatos_lista_membros.variavel_contato is
  'Valor da variável individual do contato especificamente nesta lista/importação.';

alter table public.contatos
  add column if not exists variavel_contato_base text;

comment on column public.contatos.variavel_contato_base is
  'Valor manual/base da variável do contato, usado como fallback quando não existe valor ativo em listas.';

update public.contatos contato
set variavel_contato_base = contato.variavel_contato
where contato.variavel_contato is not null
  and contato.variavel_contato_base is null
  and not exists (
    select 1
    from public.contatos_lista_membros membro
    where membro.contato_id = contato.id
  );

with membro_mais_recente as (
  select distinct on (membro.contato_id)
    membro.lista_id,
    membro.contato_id,
    contato.variavel_contato
  from public.contatos_lista_membros membro
  join public.contatos contato
    on contato.id = membro.contato_id
  join public.contatos_listas lista
    on lista.id = membro.lista_id
  where contato.variavel_contato is not null
  order by
    membro.contato_id,
    membro.adicionado_em desc,
    lista.created_at desc,
    lista.id desc
)
update public.contatos_lista_membros membro
set variavel_contato = recente.variavel_contato
from membro_mais_recente recente
where membro.lista_id = recente.lista_id
  and membro.contato_id = recente.contato_id
  and membro.variavel_contato is null;

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
        nullif(btrim(item.variavel_contato), '') as variavel_contato,
        nullif(btrim(item.observacoes), '') as observacoes,
        coalesce(item.telefone_revisar, false) as telefone_revisar
      from jsonb_to_recordset(v_lote) as item(
        nome text,
        telefone text,
        email text,
        origem text,
        campanha text,
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
        variavel_contato,
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
        lote.variavel_contato,
        null,
        null,
        lote.observacoes,
        lote.telefone_revisar
      from lote
      where lote.telefone is not null
        and length(lote.telefone) >= 8
      on conflict (empresa_id, telefone) do nothing
      returning id, telefone
    ),
    atualizados_existentes as (
      update public.contatos contato
      set
        variavel_contato = lote.variavel_contato,
        updated_at = now()
      from lote
      where coalesce(v_importacao.permitir_contatos_existentes, false)
        and lote.telefone is not null
        and lote.variavel_contato is not null
        and contato.empresa_id = v_importacao.empresa_id
        and contato.telefone = lote.telefone
        and contato.variavel_contato is distinct from lote.variavel_contato
      returning contato.id
    ),
    candidatos_lista as (
      select
        inserido.id as contato_id,
        lote.variavel_contato
      from inseridos inserido
      join lote
        on lote.telefone = inserido.telefone
      where v_importacao.lista_id is not null

      union

      select
        contato.id as contato_id,
        lote.variavel_contato
      from lote
      join public.contatos contato
        on contato.empresa_id = v_importacao.empresa_id
       and contato.telefone = lote.telefone
      where v_importacao.lista_id is not null
        and coalesce(v_importacao.permitir_contatos_existentes, false)
    ),
    membros_inseridos as (
      insert into public.contatos_lista_membros (
        lista_id,
        contato_id,
        variavel_contato
      )
      select
        v_importacao.lista_id,
        candidato.contato_id,
        candidato.variavel_contato
      from candidatos_lista candidato
      on conflict (lista_id, contato_id) do update
      set variavel_contato = excluded.variavel_contato
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
$function$
;

CREATE OR REPLACE FUNCTION public.excluir_lista_contatos_com_exclusivos(p_empresa_id uuid, p_lista_id uuid, p_confirmar_exclusao boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome text;
  v_exclusivos uuid[] := '{}'::uuid[];
  v_compartilhados uuid[] := '{}'::uuid[];
  v_conversas uuid[] := '{}'::uuid[];
  v_total integer := 0;
  v_total_exclusivos integer := 0;
  v_total_compartilhados integer := 0;
  v_total_conversas integer := 0;
  v_contatos_com_conversa integer := 0;
  v_agendamentos_bloqueadores integer := 0;
  v_analises_bloqueadoras integer := 0;
  v_contatos_excluidos integer := 0;
  v_conversas_excluidas integer := 0;
begin
  if not coalesce(p_confirmar_exclusao, false) then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Confirmação de exclusão obrigatória.'
    );
  end if;

  select lista.nome
  into v_nome
  from public.contatos_listas lista
  where lista.id = p_lista_id
    and lista.empresa_id = p_empresa_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Lista não encontrada.'
    );
  end if;

  select count(*)::integer
  into v_total
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id;

  select coalesce(array_agg(membro.contato_id), '{}'::uuid[])
  into v_exclusivos
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id
    and not exists (
      select 1
      from public.contatos_lista_membros outro
      where outro.contato_id = membro.contato_id
        and outro.lista_id <> p_lista_id
    );

  select coalesce(array_agg(membro.contato_id), '{}'::uuid[])
  into v_compartilhados
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id
    and exists (
      select 1
      from public.contatos_lista_membros outro
      where outro.contato_id = membro.contato_id
        and outro.lista_id <> p_lista_id
    );

  v_total_exclusivos := coalesce(array_length(v_exclusivos, 1), 0);
  v_total_compartilhados := greatest(v_total - v_total_exclusivos, 0);

  if v_total_exclusivos > 0 then
    select count(*)::integer
    into v_agendamentos_bloqueadores
    from public.agenda_agendamentos agendamento
    where agendamento.empresa_id = p_empresa_id
      and agendamento.contato_id = any(v_exclusivos);

    select count(*)::integer
    into v_analises_bloqueadoras
    from public.automacao_arquivo_analises analise
    where analise.empresa_id = p_empresa_id
      and analise.contato_id = any(v_exclusivos);

    if v_agendamentos_bloqueadores > 0 or v_analises_bloqueadoras > 0 then
      return jsonb_build_object(
        'ok', false,
        'erro',
          'Há contatos exclusivos com vínculos que impedem a exclusão. Remova os agendamentos ou análises de arquivo vinculados antes de excluir a lista.',
        'agendamentos_bloqueadores', v_agendamentos_bloqueadores,
        'analises_arquivo_bloqueadoras', v_analises_bloqueadoras
      );
    end if;

    select
      coalesce(array_agg(conversa.id), '{}'::uuid[]),
      count(distinct conversa.contato_id)::integer
    into
      v_conversas,
      v_contatos_com_conversa
    from public.conversas conversa
    where conversa.empresa_id = p_empresa_id
      and conversa.contato_id = any(v_exclusivos);

    v_total_conversas := coalesce(array_length(v_conversas, 1), 0);

    if v_total_conversas > 0 then
      delete from public.mensagens mensagem
      where mensagem.empresa_id = p_empresa_id
        and mensagem.conversa_id = any(v_conversas);

      delete from public.conversas conversa
      where conversa.empresa_id = p_empresa_id
        and conversa.id = any(v_conversas);

      get diagnostics v_conversas_excluidas = row_count;
    end if;

    delete from public.contatos contato
    where contato.empresa_id = p_empresa_id
      and contato.id = any(v_exclusivos);

    get diagnostics v_contatos_excluidos = row_count;
  end if;

  delete from public.contatos_listas lista
  where lista.id = p_lista_id
    and lista.empresa_id = p_empresa_id;

  if not found then
    raise exception 'Lista não encontrada durante a exclusão.';
  end if;

  if coalesce(array_length(v_compartilhados, 1), 0) > 0 then
    with valores_efetivos as (
      select
        contato.id,
        coalesce(
          (
            select membro.variavel_contato
            from public.contatos_lista_membros membro
            join public.contatos_listas lista
              on lista.id = membro.lista_id
            where membro.contato_id = contato.id
              and membro.variavel_contato is not null
            order by
              membro.adicionado_em desc,
              lista.created_at desc,
              lista.id desc
            limit 1
          ),
          contato.variavel_contato_base
        ) as novo_valor
      from public.contatos contato
      where contato.empresa_id = p_empresa_id
        and contato.id = any(v_compartilhados)
    )
    update public.contatos contato
    set
      variavel_contato = valor.novo_valor,
      updated_at = now()
    from valores_efetivos valor
    where contato.id = valor.id
      and contato.variavel_contato is distinct from valor.novo_valor;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lista_id', p_lista_id,
    'nome', v_nome,
    'total_contatos_lista', v_total,
    'contatos_exclusivos_excluidos', v_contatos_excluidos,
    'contatos_compartilhados_preservados', v_total_compartilhados,
    'contatos_com_conversa', v_contatos_com_conversa,
    'conversas_excluidas', v_conversas_excluidas
  );
end;
$function$
;
