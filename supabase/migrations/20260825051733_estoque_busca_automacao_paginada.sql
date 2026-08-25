create or replace function public.estoque_buscar_produtos_automacao_paginado(
  p_empresa_id uuid,
  p_termo text,
  p_modo text default 'automatico'::text,
  p_limite integer default 15,
  p_offset integer default 0
)
returns table(
  id uuid,
  codigo text,
  sku text,
  codigo_barras text,
  nome text,
  unidade text,
  preco_venda numeric,
  score numeric,
  match_tipo text,
  embalagem_id uuid,
  total_resultados bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_termo text := public.estoque_normalizar_busca(p_termo);
  v_modo text := lower(btrim(coalesce(p_modo, 'automatico')));
  v_limite integer := least(15, greatest(1, coalesce(p_limite, 15)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_token_principal text;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatorio';
  end if;

  if v_modo not in ('automatico', 'nome', 'codigo_sku', 'codigo_barras') then
    raise exception 'modo de pesquisa invalido';
  end if;

  if v_termo = '' then
    return;
  end if;

  v_token_principal := split_part(v_termo, ' ', 1);

  return query
  with candidatos_base as (
    select
      i.id,
      i.codigo,
      i.sku,
      i.codigo_barras,
      i.nome,
      i.unidade,
      i.preco_venda,
      public.estoque_normalizar_busca(i.nome) as nome_norm,
      public.estoque_normalizar_busca(i.codigo) as codigo_norm,
      public.estoque_normalizar_busca(i.sku) as sku_norm,
      public.estoque_normalizar_busca(i.codigo_barras) as barras_norm,
      embalagem_match.id as embalagem_match_id
    from public.estoque_itens i
    left join lateral (
      select e.id
      from public.estoque_embalagens e
      where e.empresa_id = p_empresa_id
        and e.estoque_item_id = i.id
        and e.ativo
        and e.codigo_barras is not null
        and public.estoque_normalizar_busca(e.codigo_barras) = v_termo
      order by e.padrao_venda desc, e.created_at asc
      limit 1
    ) embalagem_match on true
    where i.empresa_id = p_empresa_id
      and i.ativo
      and (
        (v_modo = 'codigo_barras' and (
          public.estoque_normalizar_busca(i.codigo_barras) = v_termo or
          embalagem_match.id is not null
        ))
        or (v_modo = 'codigo_sku' and (
          public.estoque_normalizar_busca(i.codigo) like '%' || v_termo || '%' or
          public.estoque_normalizar_busca(i.sku) like '%' || v_termo || '%'
        ))
        or (v_modo in ('automatico', 'nome') and (
          public.estoque_normalizar_busca(i.nome) like '%' || v_termo || '%' or
          public.estoque_normalizar_busca(i.nome) like '%' || v_token_principal || '%' or
          public.estoque_normalizar_busca(i.nome) % v_termo or
          (v_modo = 'automatico' and (
            public.estoque_normalizar_busca(i.codigo) = v_termo or
            public.estoque_normalizar_busca(i.sku) = v_termo or
            public.estoque_normalizar_busca(i.codigo_barras) = v_termo or
            embalagem_match.id is not null
          ))
        ))
      )
  ),
  pontuados as (
    select
      c.*,
      coalesce((
        select avg(
          case
            when c.nome_norm like '%' || token || '%' then 1::numeric
            else 0::numeric
          end
        )
        from regexp_split_to_table(v_termo, E'\\s+') token
        where length(token) >= 2
      ), 0::numeric) as cobertura_tokens,
      similarity(c.nome_norm, v_termo)::numeric as similaridade
    from candidatos_base c
  ),
  classificados as (
    select
      p.*,
      case
        when p.codigo_norm = v_termo and v_modo in ('automatico', 'codigo_sku') then 1.000
        when p.sku_norm = v_termo and v_modo in ('automatico', 'codigo_sku') then 0.995
        when p.barras_norm = v_termo and v_modo in ('automatico', 'codigo_barras') then 0.990
        when p.embalagem_match_id is not null and v_modo in ('automatico', 'codigo_barras') then 0.985
        when p.nome_norm = v_termo and v_modo in ('automatico', 'nome') then 0.980
        when p.nome_norm like '%' || v_termo || '%' and v_modo in ('automatico', 'nome') then 0.940
        when v_modo in ('automatico', 'nome') then greatest(
          p.cobertura_tokens * 0.900,
          p.similaridade * 0.800
        )
        when v_modo = 'codigo_sku' and (
          p.codigo_norm like '%' || v_termo || '%' or
          p.sku_norm like '%' || v_termo || '%'
        ) then 0.850
        else 0::numeric
      end as ranking,
      case
        when p.codigo_norm = v_termo and v_modo in ('automatico', 'codigo_sku') then 'codigo_exato'
        when p.sku_norm = v_termo and v_modo in ('automatico', 'codigo_sku') then 'sku_exato'
        when p.barras_norm = v_termo and v_modo in ('automatico', 'codigo_barras') then 'codigo_barras_exato'
        when p.embalagem_match_id is not null and v_modo in ('automatico', 'codigo_barras') then 'embalagem_codigo_barras_exato'
        when p.nome_norm = v_termo and v_modo in ('automatico', 'nome') then 'nome_exato'
        when p.nome_norm like '%' || v_termo || '%' and v_modo in ('automatico', 'nome') then 'nome_contem'
        else 'texto'
      end as tipo_match
    from pontuados p
  ),
  filtrados as (
    select *
    from classificados c
    where c.ranking > 0
      and (
        c.tipo_match <> 'texto' or
        c.cobertura_tokens >= 0.5 or
        c.similaridade >= 0.18
      )
  )
  select
    c.id,
    c.codigo,
    c.sku,
    c.codigo_barras,
    c.nome,
    c.unidade,
    c.preco_venda,
    round(c.ranking, 4) as score,
    c.tipo_match as match_tipo,
    c.embalagem_match_id as embalagem_id,
    count(*) over() as total_resultados
  from filtrados c
  order by c.ranking desc, c.nome asc
  limit v_limite
  offset v_offset;
end;
$function$;

revoke all on function public.estoque_buscar_produtos_automacao_paginado(uuid, text, text, integer, integer) from public;
grant execute on function public.estoque_buscar_produtos_automacao_paginado(uuid, text, text, integer, integer) to service_role;

comment on function public.estoque_buscar_produtos_automacao_paginado(uuid, text, text, integer, integer)
is 'Busca paginada de produtos para automacoes de estoque, com ate 15 itens por pagina e total de resultados.';
