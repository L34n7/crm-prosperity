create or replace function public.listar_contatos_revisao_telefone(
  p_empresa_id uuid,
  p_lista_id uuid default null,
  p_limite integer default 20000
)
returns table(
  id uuid,
  nome text,
  telefone text,
  telefone_revisar boolean,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    contato.id,
    contato.nome,
    contato.telefone,
    contato.telefone_revisar,
    contato.created_at
  from public.contatos contato
  where contato.empresa_id = p_empresa_id
    and (
      p_lista_id is null
      or exists (
        select 1
        from public.contatos_lista_membros membro
        join public.contatos_listas lista
          on lista.id = membro.lista_id
        where membro.lista_id = p_lista_id
          and membro.contato_id = contato.id
          and lista.empresa_id = p_empresa_id
      )
    )
    and (
      contato.telefone_revisar = true
      or length(regexp_replace(coalesce(contato.telefone, ''), '\D', '', 'g')) in (8, 9, 10, 11)
      or regexp_replace(coalesce(contato.telefone, ''), '\D', '', 'g') like '0055%'
      or (
        regexp_replace(coalesce(contato.telefone, ''), '\D', '', 'g') like '0%'
        and length(regexp_replace(coalesce(contato.telefone, ''), '\D', '', 'g')) in (13, 14)
      )
      or (
        regexp_replace(coalesce(contato.telefone, ''), '\D', '', 'g') like '55%'
        and length(regexp_replace(coalesce(contato.telefone, ''), '\D', '', 'g')) not in (12, 13)
      )
    )
  order by contato.created_at desc, contato.id
  limit least(greatest(coalesce(p_limite, 20000), 1), 50000);
$$;

revoke all on function public.listar_contatos_revisao_telefone(uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.listar_contatos_revisao_telefone(uuid, uuid, integer)
  to service_role;

create or replace function public.aplicar_correcoes_telefones_contatos(
  p_empresa_id uuid,
  p_correcoes jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_atualizados integer := 0;
begin
  if p_empresa_id is null then
    return 0;
  end if;

  if jsonb_typeof(coalesce(p_correcoes, '[]'::jsonb)) <> 'array' then
    raise exception 'Correções devem ser enviadas como array JSON.';
  end if;

  with correcoes as (
    select
      item.id,
      regexp_replace(coalesce(item.telefone, ''), '\D', '', 'g') as telefone,
      coalesce(item.telefone_revisar, false) as telefone_revisar
    from jsonb_to_recordset(p_correcoes) as item(
      id uuid,
      telefone text,
      telefone_revisar boolean
    )
  ),
  atualizados as (
    update public.contatos contato
    set
      telefone = correcao.telefone,
      telefone_revisar = correcao.telefone_revisar,
      updated_at = now()
    from correcoes correcao
    where contato.id = correcao.id
      and contato.empresa_id = p_empresa_id
      and correcao.telefone <> ''
      and (
        contato.telefone is distinct from correcao.telefone
        or contato.telefone_revisar is distinct from correcao.telefone_revisar
      )
    returning contato.id
  )
  select count(*)::integer
  into v_atualizados
  from atualizados;

  return coalesce(v_atualizados, 0);
end;
$$;

revoke all on function public.aplicar_correcoes_telefones_contatos(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.aplicar_correcoes_telefones_contatos(uuid, jsonb)
  to service_role;
