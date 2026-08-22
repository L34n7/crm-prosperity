create or replace function public.estoque_normalizar_busca(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(
      translate(
        lower(coalesce(p_texto, '')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create index if not exists estoque_itens_nome_busca_trgm_idx
  on public.estoque_itens
  using gin (public.estoque_normalizar_busca(nome) gin_trgm_ops)
  where ativo;

create index if not exists estoque_itens_empresa_sku_ativo_idx
  on public.estoque_itens (empresa_id, lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '' and ativo;

create or replace function public.estoque_buscar_produtos_automacao(
  p_empresa_id uuid,
  p_termo text,
  p_modo text default 'automatico',
  p_limite integer default 5
)
returns table (
  id uuid,
  codigo text,
  sku text,
  codigo_barras text,
  nome text,
  unidade text,
  preco_venda numeric,
  score numeric,
  match_tipo text,
  embalagem_id uuid
)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_termo text := public.estoque_normalizar_busca(p_termo);
  v_modo text := lower(btrim(coalesce(p_modo, 'automatico')));
  v_limite integer := least(10, greatest(1, coalesce(p_limite, 5)));
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
      (
        select e.id
        from public.estoque_embalagens e
        where e.empresa_id = p_empresa_id
          and e.estoque_item_id = i.id
          and e.ativo
          and e.codigo_barras is not null
          and public.estoque_normalizar_busca(e.codigo_barras) = v_termo
        order by e.padrao_venda desc, e.created_at asc
        limit 1
      ) as embalagem_match_id
    from public.estoque_itens i
    where i.empresa_id = p_empresa_id
      and i.ativo
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
        from regexp_split_to_table(v_termo, '\\s+') token
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
    c.embalagem_match_id as embalagem_id
  from classificados c
  where c.ranking > 0
    and (
      (v_modo = 'codigo_barras' and (
        c.barras_norm = v_termo or c.embalagem_match_id is not null
      ))
      or (v_modo = 'codigo_sku' and (
        c.codigo_norm like '%' || v_termo || '%' or
        c.sku_norm like '%' || v_termo || '%'
      ))
      or (v_modo in ('automatico', 'nome') and (
        c.nome_norm like '%' || v_termo || '%' or
        c.cobertura_tokens >= 0.5 or
        c.similaridade >= 0.18 or
        (v_modo = 'automatico' and (
          c.codigo_norm = v_termo or
          c.sku_norm = v_termo or
          c.barras_norm = v_termo or
          c.embalagem_match_id is not null
        ))
      ))
    )
  order by c.ranking desc, c.nome asc
  limit v_limite;
end;
$$;

revoke all on function public.estoque_buscar_produtos_automacao(uuid, text, text, integer) from public;
revoke all on function public.estoque_buscar_produtos_automacao(uuid, text, text, integer) from anon;
revoke all on function public.estoque_buscar_produtos_automacao(uuid, text, text, integer) from authenticated;
grant execute on function public.estoque_buscar_produtos_automacao(uuid, text, text, integer) to service_role;

alter table public.automacao_nos
  drop constraint if exists automacao_nos_tipo_no_check;

alter table public.automacao_nos
  add constraint automacao_nos_tipo_no_check
  check (
    tipo_no = any (
      array[
        'inicio'::text,
        'enviar_texto'::text,
        'pergunta_opcoes'::text,
        'pergunta_livre_ia'::text,
        'transferir_setor'::text,
        'encerrar'::text,
        'enviar_imagem'::text,
        'enviar_video'::text,
        'enviar_audio'::text,
        'enviar_arquivo'::text,
        'enviar_botoes'::text,
        'botao_redirect'::text,
        'avaliacao'::text,
        'capturar_resposta'::text,
        'agendar_disparo'::text,
        'agenda_buscar_agendamento'::text,
        'agenda_escolher_horario'::text,
        'agenda_criar_agendamento'::text,
        'agenda_remarcar_agendamento'::text,
        'agenda_cancelar_agendamento'::text,
        'interpretar_arquivo_ia'::text,
        'consultar_estoque'::text
      ]
    )
  ) not valid;
