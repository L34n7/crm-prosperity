create or replace function public.recuperar_usuario_auth_faltante()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_auth_email text;
  v_empresa public.empresas%rowtype;
  v_qtd_empresas integer := 0;
  v_usuario public.usuarios%rowtype;
  v_qtd_usuarios_email integer := 0;
  v_perfil_id uuid;
  v_setor_id uuid;
  v_nome text;
  v_telefone text;
begin
  if v_auth_user_id is null then
    return null;
  end if;

  select lower(btrim(email))
    into v_auth_email
  from auth.users
  where id = v_auth_user_id;

  if coalesce(v_auth_email, '') = '' then
    return null;
  end if;

  select *
    into v_usuario
  from public.usuarios
  where auth_user_id = v_auth_user_id
  limit 1;

  if found then
    return v_usuario.id;
  end if;

  select count(*)
    into v_qtd_empresas
  from public.empresas
  where lower(btrim(email)) = v_auth_email;

  if v_qtd_empresas <> 1 then
    return null;
  end if;

  select *
    into v_empresa
  from public.empresas
  where lower(btrim(email)) = v_auth_email
  limit 1;

  select count(*)
    into v_qtd_usuarios_email
  from public.usuarios
  where lower(btrim(email)) = v_auth_email;

  if v_qtd_usuarios_email > 0 then
    if v_qtd_usuarios_email = 1 then
      select *
        into v_usuario
      from public.usuarios
      where lower(btrim(email)) = v_auth_email
      limit 1;

      if v_usuario.empresa_id = v_empresa.id and v_usuario.auth_user_id is null then
        update public.usuarios
        set auth_user_id = v_auth_user_id,
            updated_at = now()
        where id = v_usuario.id
        returning * into v_usuario;

        return v_usuario.id;
      end if;

      if v_usuario.empresa_id = v_empresa.id and v_usuario.auth_user_id = v_auth_user_id then
        return v_usuario.id;
      end if;
    end if;

    return null;
  end if;

  insert into public.perfis_empresa (
    empresa_id,
    nome,
    descricao,
    ativo
  )
  values (
    v_empresa.id,
    'Administrador',
    'Perfil administrador criado automaticamente no cadastro.',
    true
  )
  on conflict (empresa_id, nome) do nothing;

  select id
    into v_perfil_id
  from public.perfis_empresa
  where empresa_id = v_empresa.id
    and nome = 'Administrador'
    and ativo = true
    and archived_at is null
  limit 1;

  if v_perfil_id is null then
    return null;
  end if;

  insert into public.setores (
    empresa_id,
    nome,
    descricao,
    status,
    ativo,
    ordem_exibicao
  )
  values (
    v_empresa.id,
    'Geral',
    'Setor inicial criado automaticamente no cadastro.',
    'ativo',
    true,
    0
  )
  on conflict (empresa_id, nome) do nothing;

  select id
    into v_setor_id
  from public.setores
  where empresa_id = v_empresa.id
    and nome = 'Geral'
    and status = 'ativo'
    and ativo = true
    and archived_at is null
  limit 1;

  if v_setor_id is null then
    return null;
  end if;

  v_nome := coalesce(
    nullif(btrim(v_empresa.nome_responsavel), ''),
    nullif(btrim(v_empresa.nome_fantasia), ''),
    nullif(split_part(v_auth_email, '@', 1), ''),
    'Usuário'
  );

  v_telefone := regexp_replace(coalesce(v_empresa.telefone, ''), '[^0-9]', '', 'g');
  if v_telefone = '' then
    v_telefone := null;
  elsif left(v_telefone, 2) = '55' and length(v_telefone) in (12, 13) then
    v_telefone := substring(v_telefone from 3);
  end if;

  insert into public.usuarios (
    empresa_id,
    auth_user_id,
    nome,
    email,
    telefone,
    status
  )
  values (
    v_empresa.id,
    v_auth_user_id,
    v_nome,
    v_auth_email,
    v_telefone,
    'ativo'
  )
  on conflict do nothing;

  select *
    into v_usuario
  from public.usuarios
  where auth_user_id = v_auth_user_id
  limit 1;

  if not found or v_usuario.empresa_id is distinct from v_empresa.id then
    return null;
  end if;

  insert into public.usuarios_perfis (
    usuario_id,
    perfil_empresa_id
  )
  values (
    v_usuario.id,
    v_perfil_id
  )
  on conflict (usuario_id, perfil_empresa_id) do nothing;

  if not exists (
    select 1
    from public.usuarios_setores
    where usuario_id = v_usuario.id
  ) then
    insert into public.usuarios_setores (
      usuario_id,
      setor_id,
      is_principal
    )
    values (
      v_usuario.id,
      v_setor_id,
      true
    )
    on conflict (usuario_id, setor_id) do nothing;
  end if;

  return v_usuario.id;
end;
$function$;

revoke all on function public.recuperar_usuario_auth_faltante() from public;
grant execute on function public.recuperar_usuario_auth_faltante() to authenticated;

comment on function public.recuperar_usuario_auth_faltante() is
  'Recupera o cadastro interno quando existe sessao Auth valida, mas falta o usuario em public.usuarios. O tenant e resolvido somente pelo e-mail autenticado e por uma unica empresa correspondente.';
