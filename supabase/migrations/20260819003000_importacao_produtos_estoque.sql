-- Importacao transacional do cadastro de produtos. O saldo inicial e sempre
-- registrado por documento e estoque_saldos continua sendo a fonte de verdade.

create table if not exists public.estoque_importacoes_produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  idempotency_key text not null,
  arquivo_nome text,
  total_linhas integer not null default 0,
  resultado jsonb,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  concluido_em timestamptz,
  unique (empresa_id, idempotency_key)
);

create index if not exists estoque_importacoes_produtos_empresa_data_idx
  on public.estoque_importacoes_produtos (empresa_id, created_at desc);

alter table public.estoque_importacoes_produtos enable row level security;
revoke all on table public.estoque_importacoes_produtos from public, anon, authenticated;

create or replace function public.estoque_importar_produtos(
  p_empresa_id uuid,
  p_itens jsonb,
  p_usuario_id uuid default null,
  p_atualizar_existentes boolean default true,
  p_arquivo_nome text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_importacao_id uuid;
  v_resultado jsonb;
  v_linha jsonb;
  v_numero_linha integer;
  v_item public.estoque_itens%rowtype;
  v_item_ids uuid[];
  v_item_id uuid;
  v_categoria_id uuid;
  v_marca_id uuid;
  v_deposito_id uuid;
  v_localizacao_id uuid;
  v_lote_id uuid;
  v_saldo_inicial numeric(18,6);
  v_codigo text;
  v_sku text;
  v_codigo_barras text;
  v_nome text;
  v_tipo text;
  v_unidade text;
  v_categoria text;
  v_marca text;
  v_controla_lote boolean;
  v_controla_validade boolean;
  v_controla_serie boolean;
  v_item_novo boolean;
  v_itens_documento jsonb := '[]'::jsonb;
  v_documento jsonb;
  v_codigos_processados text[] := array[]::text[];
  v_skus_processados text[] := array[]::text[];
  v_barras_processadas text[] := array[]::text[];
  v_itens_processados uuid[] := array[]::uuid[];
  v_criados integer := 0;
  v_atualizados integer := 0;
  v_ignorados integer := 0;
begin
  if p_empresa_id is null then raise exception 'Empresa obrigatoria.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Importacao sem produtos.';
  end if;
  if jsonb_array_length(p_itens) > 2000 then
    raise exception 'A importacao pode ter no maximo 2000 produtos.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Chave de idempotencia obrigatoria.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('estoque-importacao:' || p_empresa_id::text, 0));

  insert into public.estoque_importacoes_produtos (
    empresa_id, idempotency_key, arquivo_nome, total_linhas, created_by
  ) values (
    p_empresa_id, btrim(p_idempotency_key), nullif(btrim(p_arquivo_nome), ''),
    jsonb_array_length(p_itens), p_usuario_id
  )
  on conflict (empresa_id, idempotency_key) do nothing
  returning id into v_importacao_id;

  if v_importacao_id is null then
    select resultado into v_resultado
      from public.estoque_importacoes_produtos
     where empresa_id = p_empresa_id
       and idempotency_key = btrim(p_idempotency_key);
    if v_resultado is null then raise exception 'Importacao identica ainda em processamento.'; end if;
    return v_resultado;
  end if;

  for v_linha in select value from jsonb_array_elements(p_itens)
  loop
    v_numero_linha := coalesce(nullif(v_linha->>'linha', '')::integer, 0);
    v_codigo := nullif(btrim(v_linha->>'codigo'), '');
    v_sku := nullif(btrim(v_linha->>'sku'), '');
    v_codigo_barras := nullif(btrim(v_linha->>'codigo_barras'), '');
    v_nome := nullif(btrim(v_linha->>'nome'), '');
    v_tipo := nullif(lower(btrim(v_linha->>'tipo')), '');
    v_unidade := nullif(lower(btrim(v_linha->>'unidade')), '');
    v_categoria := nullif(btrim(v_linha->>'categoria'), '');
    v_marca := nullif(btrim(v_linha->>'marca'), '');
    v_saldo_inicial := coalesce(nullif(v_linha->>'saldo_inicial', '')::numeric, 0);

    if v_nome is null then raise exception 'Linha %: nome obrigatorio.', v_numero_linha; end if;
    if v_tipo is not null and v_tipo not in ('produto', 'material', 'insumo') then
      raise exception 'Linha %: tipo de item invalido.', v_numero_linha;
    end if;
    if v_unidade is not null and v_unidade not in ('un','kg','g','l','ml','m','cm','cx','pct') then
      raise exception 'Linha %: unidade invalida.', v_numero_linha;
    end if;
    if v_saldo_inicial < 0 then raise exception 'Linha %: saldo inicial invalido.', v_numero_linha; end if;
    if v_codigo is not null and lower(v_codigo) = any(v_codigos_processados) then
      raise exception 'Linha %: codigo repetido na planilha.', v_numero_linha;
    end if;
    if v_sku is not null and lower(v_sku) = any(v_skus_processados) then
      raise exception 'Linha %: SKU repetido na planilha.', v_numero_linha;
    end if;
    if v_codigo_barras is not null and lower(v_codigo_barras) = any(v_barras_processadas) then
      raise exception 'Linha %: codigo de barras repetido na planilha.', v_numero_linha;
    end if;
    if v_codigo is not null then v_codigos_processados := array_append(v_codigos_processados, lower(v_codigo)); end if;
    if v_sku is not null then v_skus_processados := array_append(v_skus_processados, lower(v_sku)); end if;
    if v_codigo_barras is not null then v_barras_processadas := array_append(v_barras_processadas, lower(v_codigo_barras)); end if;

    select coalesce(array_agg(distinct i.id), array[]::uuid[])
      into v_item_ids
      from public.estoque_itens i
     where i.empresa_id = p_empresa_id
       and i.ativo
       and (
         (v_codigo is not null and lower(i.codigo) = lower(v_codigo))
         or (v_sku is not null and lower(i.sku) = lower(v_sku))
         or (v_codigo_barras is not null and lower(i.codigo_barras) = lower(v_codigo_barras))
       );

    if cardinality(v_item_ids) > 1 then
      raise exception 'Linha %: codigo, SKU ou codigo de barras identificam produtos diferentes.', v_numero_linha;
    end if;
    v_item_id := case when cardinality(v_item_ids) = 1 then v_item_ids[1] else null end;
    v_item_novo := v_item_id is null;

    if v_item_id is not null and v_item_id = any(v_itens_processados) then
      raise exception 'Linha %: o mesmo produto foi identificado em mais de uma linha.', v_numero_linha;
    end if;
    if v_item_id is not null then
      v_itens_processados := array_append(v_itens_processados, v_item_id);
    end if;

    if v_item_id is not null and not coalesce(p_atualizar_existentes, true) then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    v_categoria_id := null;
    if v_categoria is not null then
      select id into v_categoria_id
        from public.estoque_categorias
       where empresa_id = p_empresa_id and lower(nome) = lower(v_categoria)
       order by ativo desc, created_at
       limit 1;
      if v_categoria_id is null then
        insert into public.estoque_categorias (empresa_id, nome)
        values (p_empresa_id, v_categoria)
        returning id into v_categoria_id;
      else
        update public.estoque_categorias set ativo = true where id = v_categoria_id;
      end if;
    end if;

    v_marca_id := null;
    if v_marca is not null then
      select id into v_marca_id
        from public.estoque_marcas
       where empresa_id = p_empresa_id and lower(nome) = lower(v_marca)
       order by ativo desc, created_at
       limit 1;
      if v_marca_id is null then
        insert into public.estoque_marcas (empresa_id, nome)
        values (p_empresa_id, v_marca)
        returning id into v_marca_id;
      else
        update public.estoque_marcas set ativo = true where id = v_marca_id;
      end if;
    end if;

    if v_item_id is null then
      v_controla_validade := coalesce(nullif(v_linha->>'controla_validade', '')::boolean, false);
      v_controla_lote := v_controla_validade or coalesce(nullif(v_linha->>'controla_lote', '')::boolean, false);
      v_controla_serie := coalesce(nullif(v_linha->>'controla_serie', '')::boolean, false);

      insert into public.estoque_itens (
        empresa_id, codigo, nome, descricao, tipo, unidade, saldo, estoque_minimo,
        custo_unitario, preco_venda, sku, codigo_barras, categoria_id, marca_id,
        controla_lote, controla_validade, controla_serie, created_by, updated_by
      ) values (
        p_empresa_id, v_codigo, v_nome, nullif(btrim(v_linha->>'descricao'), ''),
        coalesce(v_tipo, 'produto'), coalesce(v_unidade, 'un'), 0,
        coalesce(nullif(v_linha->>'estoque_minimo', '')::numeric, 0),
        coalesce(nullif(v_linha->>'custo_unitario', '')::numeric, 0),
        nullif(v_linha->>'preco_venda', '')::numeric, v_sku, v_codigo_barras,
        v_categoria_id, v_marca_id, v_controla_lote, v_controla_validade,
        v_controla_serie, p_usuario_id, p_usuario_id
      ) returning * into v_item;
      v_item_id := v_item.id;
      v_criados := v_criados + 1;
    else
      select * into v_item
        from public.estoque_itens
       where empresa_id = p_empresa_id and id = v_item_id and ativo
       for update;

      v_controla_validade := coalesce(nullif(v_linha->>'controla_validade', '')::boolean, v_item.controla_validade);
      v_controla_lote := v_controla_validade or coalesce(nullif(v_linha->>'controla_lote', '')::boolean, v_item.controla_lote);
      v_controla_serie := coalesce(nullif(v_linha->>'controla_serie', '')::boolean, v_item.controla_serie);

      update public.estoque_itens
         set codigo = coalesce(v_codigo, codigo),
             nome = v_nome,
             descricao = coalesce(nullif(btrim(v_linha->>'descricao'), ''), descricao),
             tipo = coalesce(v_tipo, tipo),
             unidade = coalesce(v_unidade, unidade),
             estoque_minimo = coalesce(nullif(v_linha->>'estoque_minimo', '')::numeric, estoque_minimo),
             preco_venda = coalesce(nullif(v_linha->>'preco_venda', '')::numeric, preco_venda),
             sku = coalesce(v_sku, sku),
             codigo_barras = coalesce(v_codigo_barras, codigo_barras),
             categoria_id = coalesce(v_categoria_id, categoria_id),
             marca_id = coalesce(v_marca_id, marca_id),
             controla_lote = v_controla_lote,
             controla_validade = v_controla_validade,
             controla_serie = v_controla_serie,
             updated_by = p_usuario_id,
             updated_at = now()
       where id = v_item_id
       returning * into v_item;
      v_atualizados := v_atualizados + 1;
    end if;
    if v_item_novo then
      v_itens_processados := array_append(v_itens_processados, v_item_id);
    end if;

    -- Saldo inicial so e aceito para itens criados nesta transacao.
    if v_saldo_inicial > 0 and v_item_novo then
      v_deposito_id := nullif(v_linha->>'deposito_id', '')::uuid;
      if v_deposito_id is null then
        select id into v_deposito_id
          from public.estoque_depositos
         where empresa_id = p_empresa_id and ativo
         order by principal desc, created_at
         limit 1;
      end if;
      if not exists (
        select 1 from public.estoque_depositos
         where empresa_id = p_empresa_id and id = v_deposito_id and ativo
      ) then raise exception 'Linha %: deposito invalido.', v_numero_linha; end if;

      v_localizacao_id := nullif(v_linha->>'localizacao_id', '')::uuid;
      if v_localizacao_id is not null and not exists (
        select 1 from public.estoque_localizacoes
         where empresa_id = p_empresa_id and id = v_localizacao_id
           and deposito_id = v_deposito_id and ativo
      ) then raise exception 'Linha %: localizacao invalida para o deposito.', v_numero_linha; end if;

      v_lote_id := null;
      if v_item.controla_lote or v_item.controla_validade then
        if nullif(btrim(v_linha->>'lote'), '') is null then
          raise exception 'Linha %: lote obrigatorio.', v_numero_linha;
        end if;
        if v_item.controla_validade and nullif(v_linha->>'validade', '') is null then
          raise exception 'Linha %: validade obrigatoria.', v_numero_linha;
        end if;
        if nullif(v_linha->>'fabricado_em', '') is not null
           and nullif(v_linha->>'validade', '') is not null
           and (v_linha->>'fabricado_em')::date > (v_linha->>'validade')::date then
          raise exception 'Linha %: fabricacao posterior a validade.', v_numero_linha;
        end if;
        insert into public.estoque_lotes (
          empresa_id, estoque_item_id, codigo, fabricado_em, validade
        ) values (
          p_empresa_id, v_item_id, btrim(v_linha->>'lote'),
          nullif(v_linha->>'fabricado_em', '')::date,
          nullif(v_linha->>'validade', '')::date
        )
        on conflict (empresa_id, estoque_item_id, codigo) do update
          set fabricado_em = coalesce(excluded.fabricado_em, estoque_lotes.fabricado_em),
              validade = coalesce(excluded.validade, estoque_lotes.validade)
        returning id into v_lote_id;
      end if;

      if v_item.controla_serie then
        if v_saldo_inicial <> 1 or nullif(btrim(v_linha->>'numero_serie'), '') is null then
          raise exception 'Linha %: item serializado exige saldo 1 e numero de serie.', v_numero_linha;
        end if;
      end if;

      v_itens_documento := v_itens_documento || jsonb_build_array(jsonb_build_object(
        'estoque_item_id', v_item_id,
        'deposito_destino_id', v_deposito_id,
        'localizacao_destino_id', v_localizacao_id,
        'lote_id', v_lote_id,
        'numero_serie', nullif(btrim(v_linha->>'numero_serie'), ''),
        'quantidade', v_saldo_inicial,
        'custo_unitario', coalesce(nullif(v_linha->>'custo_unitario', '')::numeric, 0)
      ));
    end if;
  end loop;

  if jsonb_array_length(v_itens_documento) > 0 then
    v_documento := public.estoque_registrar_documento(
      p_empresa_id, 'saldo_inicial', v_itens_documento, p_usuario_id,
      'Saldos iniciais da importacao de produtos', 'importacao_planilha',
      v_importacao_id, 'importacao-produtos:' || v_importacao_id::text
    );
  end if;

  v_resultado := jsonb_build_object(
    'importacao_id', v_importacao_id,
    'criados', v_criados,
    'atualizados', v_atualizados,
    'ignorados', v_ignorados,
    'documento_id', v_documento->>'documento_id'
  );

  update public.estoque_importacoes_produtos
     set resultado = v_resultado, concluido_em = now()
   where id = v_importacao_id;

  return v_resultado;
end;
$$;

revoke execute on function public.estoque_importar_produtos(uuid,jsonb,uuid,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.estoque_importar_produtos(uuid,jsonb,uuid,boolean,text,text)
  to service_role;

comment on function public.estoque_importar_produtos(uuid,jsonb,uuid,boolean,text,text) is
  'Importa produtos de forma atomica e registra saldos iniciais por documento ERP.';
