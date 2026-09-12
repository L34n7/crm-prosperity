create or replace function public.agenda_sincronizar_nota_descricao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descricao_nova text;
  v_descricao_antiga text;
  v_conversa_id uuid;
  v_nota_id uuid;
  v_autor_id uuid;
  v_deve_criar boolean := false;
begin
  v_descricao_nova := nullif(trim(coalesce(new.observacoes, '')), '');
  if tg_op = 'UPDATE' then
    v_descricao_antiga := nullif(trim(coalesce(old.observacoes, '')), '');
  end if;

  select m.nota_id into v_nota_id
  from public.agenda_agendamento_notas m
  where m.agendamento_id = new.id
    and m.empresa_id = new.empresa_id
  limit 1;

  if v_descricao_nova is null then
    if v_nota_id is not null then
      delete from public.conversas_notas
      where id = v_nota_id
        and empresa_id = new.empresa_id;
    end if;
    return new;
  end if;

  v_conversa_id := public.agenda_resolver_conversa_contato(
    new.empresa_id,
    new.contato_id,
    new.conversa_id
  );

  if v_nota_id is not null then
    if v_conversa_id is null then
      delete from public.conversas_notas
      where id = v_nota_id
        and empresa_id = new.empresa_id;
    else
      update public.conversas_notas
      set conversa_id = v_conversa_id,
          conteudo = left('Descrição da reunião: ' || v_descricao_nova, 600),
          updated_at = now()
      where id = v_nota_id
        and empresa_id = new.empresa_id;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_deve_criar := true;
  else
    v_deve_criar := v_descricao_antiga is null
      or old.contato_id is distinct from new.contato_id
      or old.conversa_id is distinct from new.conversa_id;
  end if;

  if not v_deve_criar or v_conversa_id is null then
    return new;
  end if;

  select u.id into v_autor_id
  from public.usuarios u
  where u.empresa_id = new.empresa_id
    and u.auth_user_id = auth.uid()
  limit 1;

  if v_autor_id is null then
    select u.id into v_autor_id
    from public.usuarios u
    where u.empresa_id = new.empresa_id
      and u.id in (new.updated_by, new.created_by, new.responsavel_id)
    order by case
      when u.id = new.updated_by then 1
      when u.id = new.created_by then 2
      else 3
    end
    limit 1;
  end if;

  if v_autor_id is null then
    select u.id into v_autor_id
    from public.usuarios u
    where u.empresa_id = new.empresa_id
      and u.status = 'ativo'
    order by u.created_at
    limit 1;
  end if;

  if v_autor_id is null then
    return new;
  end if;

  insert into public.conversas_notas (
    empresa_id,
    conversa_id,
    autor_id,
    conteudo
  ) values (
    new.empresa_id,
    v_conversa_id,
    v_autor_id,
    left('Descrição da reunião: ' || v_descricao_nova, 600)
  ) returning id into v_nota_id;

  insert into public.agenda_agendamento_notas (
    agendamento_id,
    empresa_id,
    nota_id
  ) values (
    new.id,
    new.empresa_id,
    v_nota_id
  )
  on conflict (agendamento_id) do nothing;

  return new;
end;
$$;

revoke all on function public.agenda_sincronizar_nota_descricao() from public, anon, authenticated;
