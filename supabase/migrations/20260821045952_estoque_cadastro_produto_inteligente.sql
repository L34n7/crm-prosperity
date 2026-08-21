create or replace function public.estoque_cadastrar_produto_completo(
  p_empresa_id uuid,
  p_dados jsonb,
  p_embalagem jsonb default null,
  p_estoque_inicial jsonb default null,
  p_usuario_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_criacao jsonb;
  v_item_id uuid;
  v_embalagem_id uuid;
  v_lote_id uuid;
  v_documento jsonb;
  v_documento_id uuid;
  v_controla_lote boolean;
  v_controla_validade boolean;
  v_controla_serie boolean;
  v_codigo_barras text;
  v_emb_codigo_barras text;
  v_sku text;
  v_fator numeric(18,6) := 1;
  v_quantidade numeric(18,6);
  v_quantidade_base numeric(18,6);
  v_deposito_id uuid;
  v_localizacao_id uuid;
  v_unidade_quantidade text;
  v_lote jsonb;
  v_itens_documento jsonb := '[]'::jsonb;
  v_seriais jsonb := '[]'::jsonb;
  v_serial jsonb;
  v_serial_texto text;
  v_total_seriais integer := 0;
begin
  if p_empresa_id is null then raise exception 'Empresa obrigatoria.'; end if;
  if jsonb_typeof(v_dados) <> 'object' then raise exception 'Dados do produto invalidos.'; end if;
  if nullif(btrim(v_dados->>'nome'), '') is null then raise exception 'Informe o nome do produto.'; end if;
  if coalesce(nullif(v_dados->>'tipo', ''), 'produto') not in ('produto', 'material', 'insumo') then raise exception 'Tipo de produto invalido.'; end if;
  if coalesce(nullif(v_dados->>'unidade', ''), 'un') not in ('un', 'cx', 'pct', 'kg', 'g', 'l', 'ml', 'm', 'cm') then raise exception 'Unidade-base invalida.'; end if;
  if coalesce(nullif(v_dados->>'estoque_minimo', '')::numeric, 0) < 0 then raise exception 'Estoque minimo nao pode ser negativo.'; end if;
  if coalesce(nullif(v_dados->>'custo_unitario', '')::numeric, 0) < 0 then raise exception 'Custo unitario nao pode ser negativo.'; end if;
  if nullif(v_dados->>'preco_venda', '') is not null and (v_dados->>'preco_venda')::numeric < 0 then raise exception 'Preco de venda nao pode ser negativo.'; end if;

  v_controla_validade := coalesce((v_dados->>'controla_validade')::boolean, false);
  v_controla_lote := coalesce((v_dados->>'controla_lote')::boolean, false) or v_controla_validade;
  v_controla_serie := coalesce((v_dados->>'controla_serie')::boolean, false);
  v_dados := v_dados || jsonb_build_object(
    'controla_lote', v_controla_lote,
    'controla_validade', v_controla_validade,
    'controla_serie', v_controla_serie
  );

  v_codigo_barras := nullif(btrim(v_dados->>'codigo_barras'), '');
  v_sku := nullif(btrim(v_dados->>'sku'), '');
  if v_sku is not null and exists (
    select 1 from public.estoque_itens
     where empresa_id = p_empresa_id and ativo
       and lower(btrim(coalesce(sku, ''))) = lower(v_sku)
  ) then
    raise exception 'Este SKU ja esta vinculado a outro produto ativo.';
  end if;
  if v_codigo_barras is not null and exists (
    select 1 from public.estoque_embalagens
     where empresa_id = p_empresa_id and ativo and btrim(coalesce(codigo_barras, '')) = v_codigo_barras
  ) then
    raise exception 'Este codigo de barras ja esta vinculado a uma embalagem.';
  end if;

  if p_embalagem is not null then
    if jsonb_typeof(p_embalagem) <> 'object' then raise exception 'Dados da embalagem invalidos.'; end if;
    if nullif(btrim(p_embalagem->>'nome'), '') is null or nullif(btrim(p_embalagem->>'sigla'), '') is null then
      raise exception 'Informe o nome e a sigla da embalagem.';
    end if;
    v_fator := coalesce(nullif(p_embalagem->>'fator_conversao', '')::numeric, 0);
    if v_fator <= 0 then raise exception 'O fator de conversao da embalagem deve ser maior que zero.'; end if;
    if coalesce((p_embalagem->>'padrao_compra')::boolean, false) and not coalesce((p_embalagem->>'permite_compra')::boolean, true) then
      raise exception 'A embalagem padrao de compra precisa estar habilitada para compras.';
    end if;
    if coalesce((p_embalagem->>'padrao_venda')::boolean, false) and not coalesce((p_embalagem->>'permite_venda')::boolean, true) then
      raise exception 'A embalagem padrao de venda precisa estar habilitada para vendas.';
    end if;
    if nullif(p_embalagem->>'preco_venda', '') is not null and (p_embalagem->>'preco_venda')::numeric < 0 then
      raise exception 'O preco da embalagem nao pode ser negativo.';
    end if;
    v_emb_codigo_barras := nullif(regexp_replace(coalesce(p_embalagem->>'codigo_barras', ''), '\D', '', 'g'), '');
    if v_emb_codigo_barras is not null and v_codigo_barras is not null and v_emb_codigo_barras = regexp_replace(v_codigo_barras, '\D', '', 'g') then
      raise exception 'O codigo de barras da embalagem deve ser diferente do codigo do produto.';
    end if;
    if v_emb_codigo_barras is not null and exists (
      select 1 from public.estoque_itens
       where empresa_id = p_empresa_id and lower(btrim(coalesce(codigo_barras, ''))) = lower(v_emb_codigo_barras)
    ) then
      raise exception 'Este codigo de barras ja esta vinculado a um produto.';
    end if;
  end if;

  v_criacao := public.estoque_salvar_item_com_classificacoes(
    p_empresa_id,
    v_dados,
    0,
    null,
    p_usuario_id
  );
  v_item_id := nullif(v_criacao->>'item_id', '')::uuid;
  if v_item_id is null then raise exception 'Nao foi possivel criar o produto.'; end if;

  if p_embalagem is not null then
    insert into public.estoque_embalagens (
      empresa_id, estoque_item_id, nome, sigla, fator_conversao, codigo_barras,
      preco_venda, permite_compra, permite_venda, padrao_compra, padrao_venda,
      ativo, created_by, updated_at
    ) values (
      p_empresa_id,
      v_item_id,
      btrim(p_embalagem->>'nome'),
      upper(btrim(p_embalagem->>'sigla')),
      v_fator,
      v_emb_codigo_barras,
      nullif(p_embalagem->>'preco_venda', '')::numeric,
      coalesce((p_embalagem->>'permite_compra')::boolean, true),
      coalesce((p_embalagem->>'permite_venda')::boolean, true),
      coalesce((p_embalagem->>'padrao_compra')::boolean, false),
      coalesce((p_embalagem->>'padrao_venda')::boolean, false),
      true,
      p_usuario_id,
      now()
    ) returning id into v_embalagem_id;
  end if;

  if p_estoque_inicial is not null and coalesce((p_estoque_inicial->>'registrar')::boolean, false) then
    if jsonb_typeof(p_estoque_inicial) <> 'object' then raise exception 'Dados do estoque inicial invalidos.'; end if;
    v_deposito_id := nullif(p_estoque_inicial->>'deposito_id', '')::uuid;
    v_localizacao_id := nullif(p_estoque_inicial->>'localizacao_id', '')::uuid;
    v_quantidade := coalesce(nullif(p_estoque_inicial->>'quantidade', '')::numeric, 0);
    v_unidade_quantidade := coalesce(nullif(p_estoque_inicial->>'unidade_quantidade', ''), 'base');
    if v_deposito_id is null then raise exception 'Selecione o deposito do estoque inicial.'; end if;
    if not exists (select 1 from public.estoque_depositos where empresa_id=p_empresa_id and id=v_deposito_id and ativo) then
      raise exception 'Deposito nao encontrado ou inativo.';
    end if;
    if v_localizacao_id is not null and not exists (
      select 1 from public.estoque_localizacoes
       where empresa_id=p_empresa_id and id=v_localizacao_id and deposito_id=v_deposito_id and ativo
    ) then
      raise exception 'Localizacao nao pertence ao deposito selecionado.';
    end if;
    if v_quantidade <= 0 then raise exception 'A quantidade inicial deve ser maior que zero.'; end if;
    if v_unidade_quantidade not in ('base', 'embalagem') then raise exception 'Unidade da quantidade inicial invalida.'; end if;
    if v_unidade_quantidade = 'embalagem' and v_embalagem_id is null then
      raise exception 'Configure uma embalagem antes de informar a quantidade inicial por embalagem.';
    end if;
    v_quantidade_base := v_quantidade * case when v_unidade_quantidade='embalagem' then v_fator else 1 end;
    if v_quantidade_base <= 0 then raise exception 'A quantidade inicial em unidade-base deve ser maior que zero.'; end if;

    if v_controla_lote then
      v_lote := coalesce(p_estoque_inicial->'lote', '{}'::jsonb);
      if jsonb_typeof(v_lote) <> 'object' then raise exception 'Dados do lote invalidos.'; end if;
      if nullif(btrim(v_lote->>'codigo'), '') is null then raise exception 'Informe o lote do estoque inicial.'; end if;
      if v_controla_validade and nullif(v_lote->>'validade', '') is null then raise exception 'Informe a validade do estoque inicial.'; end if;
      if nullif(v_lote->>'fabricado_em', '') is not null and nullif(v_lote->>'validade', '') is not null
         and (v_lote->>'fabricado_em')::date > (v_lote->>'validade')::date then
        raise exception 'A fabricacao nao pode ser posterior a validade.';
      end if;
      insert into public.estoque_lotes (
        empresa_id, estoque_item_id, codigo, fabricado_em, validade, fabricante
      ) values (
        p_empresa_id,
        v_item_id,
        btrim(v_lote->>'codigo'),
        nullif(v_lote->>'fabricado_em', '')::date,
        nullif(v_lote->>'validade', '')::date,
        nullif(btrim(v_lote->>'fabricante'), '')
      ) returning id into v_lote_id;
    end if;

    if v_controla_serie then
      if trunc(v_quantidade_base) <> v_quantidade_base then
        raise exception 'Produto serializado precisa resultar em uma quantidade inteira de unidades-base.';
      end if;
      v_seriais := coalesce(p_estoque_inicial->'numeros_serie', '[]'::jsonb);
      if jsonb_typeof(v_seriais) <> 'array' then raise exception 'Numeros de serie invalidos.'; end if;
      v_total_seriais := jsonb_array_length(v_seriais);
      if v_total_seriais <> v_quantidade_base::integer then
        raise exception 'Informe um numero de serie para cada unidade-base.';
      end if;
      if exists (
        select 1
          from (
            select lower(btrim(value #>> '{}')) as serial, count(*) as quantidade
              from jsonb_array_elements(v_seriais)
             group by lower(btrim(value #>> '{}'))
          ) duplicados
         where duplicados.serial = '' or duplicados.quantidade > 1
      ) then
        raise exception 'Os numeros de serie devem ser preenchidos e nao podem se repetir.';
      end if;
      for v_serial in select value from jsonb_array_elements(v_seriais)
      loop
        v_serial_texto := btrim(v_serial #>> '{}');
        if exists (
          select 1 from public.estoque_saldos
           where empresa_id=p_empresa_id and estoque_item_id=v_item_id
             and lower(btrim(coalesce(numero_serie, ''))) = lower(v_serial_texto)
             and saldo_fisico > 0
        ) then
          raise exception 'Numero de serie % ja possui saldo para este produto.', v_serial_texto;
        end if;
        v_itens_documento := v_itens_documento || jsonb_build_array(jsonb_build_object(
          'estoque_item_id', v_item_id,
          'deposito_destino_id', v_deposito_id,
          'localizacao_destino_id', v_localizacao_id,
          'lote_id', v_lote_id,
          'numero_serie', v_serial_texto,
          'quantidade', 1,
          'custo_unitario', coalesce(nullif(v_dados->>'custo_unitario', '')::numeric, 0)
        ));
      end loop;
    else
      v_itens_documento := jsonb_build_array(jsonb_build_object(
        'estoque_item_id', v_item_id,
        'deposito_destino_id', v_deposito_id,
        'localizacao_destino_id', v_localizacao_id,
        'lote_id', v_lote_id,
        'quantidade', v_quantidade_base,
        'custo_unitario', coalesce(nullif(v_dados->>'custo_unitario', '')::numeric, 0)
      ));
    end if;

    v_documento := public.estoque_registrar_documento(
      p_empresa_id,
      'saldo_inicial',
      v_itens_documento,
      p_usuario_id,
      'Saldo inicial do cadastro inteligente',
      'cadastro_item',
      v_item_id,
      'cadastro-produto:' || v_item_id::text
    );
    v_documento_id := nullif(v_documento->>'documento_id', '')::uuid;
  end if;

  return jsonb_build_object(
    'item_id', v_item_id,
    'categoria_id', v_criacao->'categoria_id',
    'marca_id', v_criacao->'marca_id',
    'embalagem_id', v_embalagem_id,
    'lote_id', v_lote_id,
    'documento_id', v_documento_id,
    'quantidade_base', case when v_documento_id is null then 0 else v_quantidade_base end
  );
end;
$function$;

revoke all on function public.estoque_cadastrar_produto_completo(uuid, jsonb, jsonb, jsonb, uuid) from public;
revoke all on function public.estoque_cadastrar_produto_completo(uuid, jsonb, jsonb, jsonb, uuid) from anon;
revoke all on function public.estoque_cadastrar_produto_completo(uuid, jsonb, jsonb, jsonb, uuid) from authenticated;
grant execute on function public.estoque_cadastrar_produto_completo(uuid, jsonb, jsonb, jsonb, uuid) to service_role;
