do $$
declare
  v_basico_id uuid;
  v_essencial_id uuid;
begin
  select id into v_basico_id
  from public.planos
  where slug = 'basico'
  limit 1;

  select id into v_essencial_id
  from public.planos
  where slug = 'essencial'
  limit 1;

  if v_basico_id is not null then
    insert into public.ia_token_ofertas (
      gateway,
      referencia,
      tipo,
      nome,
      plano_id,
      empresa_id,
      quantidade_tokens,
      ativa,
      metadata_json
    )
    select
      'atomo',
      '836dr',
      'mensalidade',
      'Plano Basico Direto',
      v_basico_id,
      null,
      1000000,
      true,
      '{"origem":"atomopay_direto","tipo_oferta":"normal","plano_slug":"basico"}'::jsonb
    where not exists (
      select 1
      from public.ia_token_ofertas
      where gateway = 'atomo'
        and referencia = '836dr'
        and empresa_id is null
    );

    update public.ia_token_ofertas
    set
      tipo = 'mensalidade',
      nome = 'Plano Basico Direto',
      plano_id = v_basico_id,
      quantidade_tokens = 1000000,
      ativa = true,
      metadata_json = '{"origem":"atomopay_direto","tipo_oferta":"normal","plano_slug":"basico"}'::jsonb,
      updated_at = now()
    where gateway = 'atomo'
      and referencia = '836dr'
      and empresa_id is null;

    insert into public.ia_token_ofertas (
      gateway,
      referencia,
      tipo,
      nome,
      plano_id,
      empresa_id,
      quantidade_tokens,
      ativa,
      metadata_json
    )
    select
      'atomo',
      'ubtga',
      'mensalidade',
      'Plano Basico Afiliado',
      v_basico_id,
      null,
      1000000,
      true,
      '{"origem":"atomopay_afiliado","tipo_oferta":"af","plano_slug":"basico"}'::jsonb
    where not exists (
      select 1
      from public.ia_token_ofertas
      where gateway = 'atomo'
        and referencia = 'ubtga'
        and empresa_id is null
    );

    update public.ia_token_ofertas
    set
      tipo = 'mensalidade',
      nome = 'Plano Basico Afiliado',
      plano_id = v_basico_id,
      quantidade_tokens = 1000000,
      ativa = true,
      metadata_json = '{"origem":"atomopay_afiliado","tipo_oferta":"af","plano_slug":"basico"}'::jsonb,
      updated_at = now()
    where gateway = 'atomo'
      and referencia = 'ubtga'
      and empresa_id is null;
  end if;

  if v_essencial_id is not null then
    insert into public.ia_token_ofertas (
      gateway,
      referencia,
      tipo,
      nome,
      plano_id,
      empresa_id,
      quantidade_tokens,
      ativa,
      metadata_json
    )
    select
      'atomo',
      '7ibzm',
      'mensalidade',
      'Plano Essencial Direto',
      v_essencial_id,
      null,
      5000000,
      true,
      '{"origem":"atomopay_direto","tipo_oferta":"normal","plano_slug":"essencial"}'::jsonb
    where not exists (
      select 1
      from public.ia_token_ofertas
      where gateway = 'atomo'
        and referencia = '7ibzm'
        and empresa_id is null
    );

    update public.ia_token_ofertas
    set
      tipo = 'mensalidade',
      nome = 'Plano Essencial Direto',
      plano_id = v_essencial_id,
      quantidade_tokens = 5000000,
      ativa = true,
      metadata_json = '{"origem":"atomopay_direto","tipo_oferta":"normal","plano_slug":"essencial"}'::jsonb,
      updated_at = now()
    where gateway = 'atomo'
      and referencia = '7ibzm'
      and empresa_id is null;

    insert into public.ia_token_ofertas (
      gateway,
      referencia,
      tipo,
      nome,
      plano_id,
      empresa_id,
      quantidade_tokens,
      ativa,
      metadata_json
    )
    select
      'atomo',
      'uqddy',
      'mensalidade',
      'Plano Essencial Afiliado',
      v_essencial_id,
      null,
      5000000,
      true,
      '{"origem":"atomopay_afiliado","tipo_oferta":"af","plano_slug":"essencial"}'::jsonb
    where not exists (
      select 1
      from public.ia_token_ofertas
      where gateway = 'atomo'
        and referencia = 'uqddy'
        and empresa_id is null
    );

    update public.ia_token_ofertas
    set
      tipo = 'mensalidade',
      nome = 'Plano Essencial Afiliado',
      plano_id = v_essencial_id,
      quantidade_tokens = 5000000,
      ativa = true,
      metadata_json = '{"origem":"atomopay_afiliado","tipo_oferta":"af","plano_slug":"essencial"}'::jsonb,
      updated_at = now()
    where gateway = 'atomo'
      and referencia = 'uqddy'
      and empresa_id is null;
  end if;
end $$;
