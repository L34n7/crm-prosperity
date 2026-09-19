create or replace function public.analisar_exclusao_lista_contatos(
  p_empresa_id uuid,
  p_lista_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_nome text;
  v_total integer := 0;
  v_exclusivos integer := 0;
  v_compartilhados integer := 0;
  v_contatos_com_conversa integer := 0;
  v_conversas integer := 0;
  v_agendamentos_bloqueadores integer := 0;
  v_analises_bloqueadoras integer := 0;
begin
  select lista.nome
  into v_nome
  from public.contatos_listas lista
  where lista.id = p_lista_id
    and lista.empresa_id = p_empresa_id;

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

  select count(*)::integer
  into v_exclusivos
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id
    and not exists (
      select 1
      from public.contatos_lista_membros outro
      where outro.contato_id = membro.contato_id
        and outro.lista_id <> p_lista_id
    );

  v_compartilhados := greatest(v_total - v_exclusivos, 0);

  select
    count(distinct conversa.contato_id)::integer,
    count(*)::integer
  into
    v_contatos_com_conversa,
    v_conversas
  from public.conversas conversa
  where conversa.empresa_id = p_empresa_id
    and exists (
      select 1
      from public.contatos_lista_membros membro
      where membro.lista_id = p_lista_id
        and membro.contato_id = conversa.contato_id
        and not exists (
          select 1
          from public.contatos_lista_membros outro
          where outro.contato_id = membro.contato_id
            and outro.lista_id <> p_lista_id
        )
    );

  select count(*)::integer
  into v_agendamentos_bloqueadores
  from public.agenda_agendamentos agendamento
  where agendamento.empresa_id = p_empresa_id
    and exists (
      select 1
      from public.contatos_lista_membros membro
      where membro.lista_id = p_lista_id
        and membro.contato_id = agendamento.contato_id
        and not exists (
          select 1
          from public.contatos_lista_membros outro
          where outro.contato_id = membro.contato_id
            and outro.lista_id <> p_lista_id
        )
    );

  select count(*)::integer
  into v_analises_bloqueadoras
  from public.automacao_arquivo_analises analise
  where analise.empresa_id = p_empresa_id
    and exists (
      select 1
      from public.contatos_lista_membros membro
      where membro.lista_id = p_lista_id
        and membro.contato_id = analise.contato_id
        and not exists (
          select 1
          from public.contatos_lista_membros outro
          where outro.contato_id = membro.contato_id
            and outro.lista_id <> p_lista_id
        )
    );

  return jsonb_build_object(
    'ok', true,
    'lista_id', p_lista_id,
    'nome', v_nome,
    'total_contatos', v_total,
    'contatos_exclusivos', v_exclusivos,
    'contatos_compartilhados', v_compartilhados,
    'contatos_com_conversa', v_contatos_com_conversa,
    'conversas', v_conversas,
    'agendamentos_bloqueadores', v_agendamentos_bloqueadores,
    'analises_arquivo_bloqueadoras', v_analises_bloqueadoras,
    'exclusao_bloqueada',
      (v_agendamentos_bloqueadores > 0 or v_analises_bloqueadoras > 0)
  );
end;
$function$;

create or replace function public.excluir_lista_contatos_com_exclusivos(
  p_empresa_id uuid,
  p_lista_id uuid,
  p_confirmar_exclusao boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome text;
  v_exclusivos uuid[] := '{}'::uuid[];
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
$function$;

revoke all on function public.analisar_exclusao_lista_contatos(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.analisar_exclusao_lista_contatos(uuid, uuid)
  to service_role;

revoke all on function public.excluir_lista_contatos_com_exclusivos(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.excluir_lista_contatos_com_exclusivos(uuid, uuid, boolean)
  to service_role;
