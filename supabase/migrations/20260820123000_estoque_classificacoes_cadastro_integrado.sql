-- Cadastro integrado de produtos, categorias e marcas.
-- Garante unicidade sem diferenciar maiusculas/minusculas e permite que a
-- importacao da NF-e crie os itens ainda inexistentes na mesma transacao.

do $$
declare
  v_registro record;
  v_principal uuid;
begin
  for v_registro in
    select empresa_id, lower(btrim(nome)) as chave, array_agg(id order by created_at, id) as ids
      from public.estoque_marcas
     group by empresa_id, lower(btrim(nome))
    having count(*) > 1
  loop
    v_principal := v_registro.ids[1];
    update public.estoque_itens
       set marca_id = v_principal
     where empresa_id = v_registro.empresa_id
       and marca_id = any(v_registro.ids[2:array_length(v_registro.ids, 1)]);
    delete from public.estoque_marcas
     where empresa_id = v_registro.empresa_id
       and id = any(v_registro.ids[2:array_length(v_registro.ids, 1)]);
  end loop;

  for v_registro in
    select empresa_id, lower(btrim(nome)) as chave, array_agg(id order by created_at, id) as ids
      from public.estoque_categorias
     group by empresa_id, lower(btrim(nome))
    having count(*) > 1
  loop
    v_principal := v_registro.ids[1];
    update public.estoque_itens
       set categoria_id = v_principal
     where empresa_id = v_registro.empresa_id
       and categoria_id = any(v_registro.ids[2:array_length(v_registro.ids, 1)]);
    update public.estoque_categorias
       set categoria_pai_id = v_principal
     where empresa_id = v_registro.empresa_id
       and categoria_pai_id = any(v_registro.ids[2:array_length(v_registro.ids, 1)]);
    delete from public.estoque_categorias
     where empresa_id = v_registro.empresa_id
       and id = any(v_registro.ids[2:array_length(v_registro.ids, 1)]);
  end loop;
end;
$$;

create unique index if not exists estoque_marcas_empresa_nome_normalizado_uk
  on public.estoque_marcas (empresa_id, lower(btrim(nome)));

create unique index if not exists estoque_categorias_empresa_nome_normalizado_uk
  on public.estoque_categorias (empresa_id, lower(btrim(nome)));

update public.estoque_itens item
   set categoria_id = null
 where categoria_id is not null
   and not exists (select 1 from public.estoque_categorias categoria where categoria.id = item.categoria_id);
update public.estoque_itens item
   set marca_id = null
 where marca_id is not null
   and not exists (select 1 from public.estoque_marcas marca where marca.id = item.marca_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'estoque_itens_categoria_fk') then
    alter table public.estoque_itens add constraint estoque_itens_categoria_fk
      foreign key (categoria_id) references public.estoque_categorias(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'estoque_itens_marca_fk') then
    alter table public.estoque_itens add constraint estoque_itens_marca_fk
      foreign key (marca_id) references public.estoque_marcas(id) on delete set null;
  end if;
end;
$$;

create or replace function public.estoque_obter_ou_criar_categoria(
  p_empresa_id uuid,
  p_nome text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_id uuid;
begin
  if v_nome = '' then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text || ':categoria:' || lower(v_nome), 0));
  select id into v_id
    from public.estoque_categorias
   where empresa_id = p_empresa_id
     and lower(btrim(nome)) = lower(v_nome)
   order by ativo desc, created_at
   limit 1;

  if v_id is null then
    insert into public.estoque_categorias (empresa_id, nome)
    values (p_empresa_id, v_nome)
    returning id into v_id;
  else
    update public.estoque_categorias set ativo = true where id = v_id and not ativo;
  end if;
  return v_id;
end;
$$;

create or replace function public.estoque_obter_ou_criar_marca(
  p_empresa_id uuid,
  p_nome text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_id uuid;
begin
  if v_nome = '' then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text || ':marca:' || lower(v_nome), 0));
  select id into v_id
    from public.estoque_marcas
   where empresa_id = p_empresa_id
     and lower(btrim(nome)) = lower(v_nome)
   order by ativo desc, created_at
   limit 1;

  if v_id is null then
    insert into public.estoque_marcas (empresa_id, nome)
    values (p_empresa_id, v_nome)
    returning id into v_id;
  else
    update public.estoque_marcas set ativo = true where id = v_id and not ativo;
  end if;
  return v_id;
end;
$$;

create or replace function public.estoque_salvar_item_com_classificacoes(
  p_empresa_id uuid,
  p_dados jsonb,
  p_saldo_inicial numeric default 0,
  p_deposito_id uuid default null,
  p_usuario_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_id uuid := nullif(p_dados->>'id', '')::uuid;
  v_categoria_id uuid := nullif(p_dados->>'categoria_id', '')::uuid;
  v_marca_id uuid := nullif(p_dados->>'marca_id', '')::uuid;
  v_dados jsonb := p_dados;
begin
  if nullif(btrim(p_dados->>'nome'), '') is null then
    raise exception 'Informe o nome do item.';
  end if;

  if v_categoria_id is not null and not exists (
    select 1 from public.estoque_categorias
     where id = v_categoria_id and empresa_id = p_empresa_id and ativo
  ) then
    raise exception 'Categoria invalida para esta empresa.';
  end if;
  if v_marca_id is not null and not exists (
    select 1 from public.estoque_marcas
     where id = v_marca_id and empresa_id = p_empresa_id and ativo
  ) then
    raise exception 'Marca invalida para esta empresa.';
  end if;

  if v_categoria_id is null then
    v_categoria_id := public.estoque_obter_ou_criar_categoria(p_empresa_id, p_dados->>'categoria_nome');
  end if;
  if v_marca_id is null then
    v_marca_id := public.estoque_obter_ou_criar_marca(p_empresa_id, p_dados->>'marca_nome');
  end if;

  v_dados := v_dados || jsonb_build_object(
    'categoria_id', coalesce(v_categoria_id::text, ''),
    'marca_id', coalesce(v_marca_id::text, '')
  );

  if v_item_id is null then
    v_item_id := public.estoque_criar_item_com_saldo_inicial(
      p_empresa_id, v_dados, greatest(coalesce(p_saldo_inicial, 0), 0),
      p_deposito_id, p_usuario_id
    );
  else
    update public.estoque_itens
       set codigo = nullif(btrim(v_dados->>'codigo'), ''),
           nome = btrim(v_dados->>'nome'),
           descricao = nullif(btrim(v_dados->>'descricao'), ''),
           tipo = coalesce(nullif(v_dados->>'tipo', ''), 'produto'),
           unidade = coalesce(nullif(v_dados->>'unidade', ''), 'un'),
           estoque_minimo = coalesce(nullif(v_dados->>'estoque_minimo', '')::numeric, 0),
           custo_unitario = coalesce(nullif(v_dados->>'custo_unitario', '')::numeric, 0),
           preco_venda = nullif(v_dados->>'preco_venda', '')::numeric,
           sku = nullif(btrim(v_dados->>'sku'), ''),
           codigo_barras = nullif(btrim(v_dados->>'codigo_barras'), ''),
           categoria_id = v_categoria_id,
           marca_id = v_marca_id,
           controla_lote = coalesce((v_dados->>'controla_lote')::boolean, false),
           controla_validade = coalesce((v_dados->>'controla_validade')::boolean, false),
           controla_serie = coalesce((v_dados->>'controla_serie')::boolean, false),
           updated_by = p_usuario_id,
           updated_at = now()
     where id = v_item_id and empresa_id = p_empresa_id;
    if not found then raise exception 'Item nao encontrado.'; end if;
  end if;

  return jsonb_build_object(
    'item_id', v_item_id,
    'categoria_id', v_categoria_id,
    'marca_id', v_marca_id
  );
end;
$$;

create or replace function public.comercial_importar_receber_xml_com_itens(
  p_empresa_id uuid,
  p_fornecedor jsonb,
  p_deposito_id uuid,
  p_itens jsonb,
  p_nfe jsonb,
  p_usuario_id uuid default null,
  p_idempotency_key text default null,
  p_observacao text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_resultado jsonb;
  v_criacao jsonb;
  v_item_existente_id uuid;
  v_codigo_barras text;
  v_codigo text;
  v_criados integer := 0;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A NF-e precisa possuir ao menos um item.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    if nullif(v_item->>'estoque_item_id', '') is null then
      if coalesce((v_item->>'criar_item')::boolean, false) is not true then
        raise exception 'Vincule ou cadastre todos os produtos da NF-e.';
      end if;
      v_codigo_barras := nullif(btrim(v_item->'novo_item'->>'codigo_barras'), '');
      v_codigo := nullif(btrim(v_item->'novo_item'->>'codigo'), '');
      v_item_existente_id := null;
      select id into v_item_existente_id
        from public.estoque_itens
       where empresa_id = p_empresa_id
         and ativo
         and (
           (v_codigo_barras is not null and codigo_barras = v_codigo_barras)
           or (v_codigo is not null and (codigo = v_codigo or sku = v_codigo))
         )
       order by created_at
       limit 1;

      if v_item_existente_id is null then
        v_criacao := public.estoque_salvar_item_com_classificacoes(
          p_empresa_id,
          coalesce(v_item->'novo_item', '{}'::jsonb),
          0,
          null,
          p_usuario_id
        );
        v_item_existente_id := (v_criacao->>'item_id')::uuid;
        v_criados := v_criados + 1;
      end if;
      v_item := jsonb_set(v_item, '{estoque_item_id}', to_jsonb(v_item_existente_id::text));
    end if;
    v_itens := v_itens || jsonb_build_array(v_item - 'criar_item' - 'novo_item');
  end loop;

  v_resultado := public.comercial_importar_receber_xml(
    p_empresa_id, p_fornecedor, p_deposito_id, v_itens, p_nfe,
    p_usuario_id, p_idempotency_key, p_observacao
  );
  return v_resultado || jsonb_build_object('itens_criados', v_criados);
end;
$$;

revoke execute on function public.estoque_obter_ou_criar_categoria(uuid,text) from public, anon, authenticated;
revoke execute on function public.estoque_obter_ou_criar_marca(uuid,text) from public, anon, authenticated;
revoke execute on function public.estoque_salvar_item_com_classificacoes(uuid,jsonb,numeric,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.comercial_importar_receber_xml_com_itens(uuid,jsonb,uuid,jsonb,jsonb,uuid,text,text) from public, anon, authenticated;

grant execute on function public.estoque_obter_ou_criar_categoria(uuid,text) to service_role;
grant execute on function public.estoque_obter_ou_criar_marca(uuid,text) to service_role;
grant execute on function public.estoque_salvar_item_com_classificacoes(uuid,jsonb,numeric,uuid,uuid) to service_role;
grant execute on function public.comercial_importar_receber_xml_com_itens(uuid,jsonb,uuid,jsonb,jsonb,uuid,text,text) to service_role;
