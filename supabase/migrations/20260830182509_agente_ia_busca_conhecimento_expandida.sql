-- Amplia o número de termos considerados em consultas naturais longas.
create or replace function public.agente_ia_buscar_conhecimento(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_consulta text,
  p_limite integer default 5
)
returns table(id uuid, titulo text, categoria text, trecho text, rank real)
language sql
stable
set search_path = public
as $$
  with termos as (
    select array(
      select termo
      from (
        select distinct termo
        from unnest(tsvector_to_array(to_tsvector('portuguese'::regconfig, coalesce(p_consulta, '')))) as termo
        where length(termo) >= 2
        limit 32
      ) relevantes
    ) as itens
  ), consulta as (
    select case
      when coalesce(cardinality(itens), 0) = 0 then null::tsquery
      else to_tsquery('portuguese'::regconfig, (select string_agg(quote_literal(item), ' | ') from unnest(itens) as item))
    end as q
    from termos
  )
  select c.id, c.titulo, c.categoria, left(c.conteudo, 1600) as trecho,
    case when consulta.q is null then 0::real else ts_rank_cd(c.search_vector, consulta.q) end as rank
  from public.agente_ia_conhecimentos c
  cross join consulta
  where c.empresa_id = p_empresa_id and c.agente_id = p_agente_id and c.ativo = true
    and (consulta.q is null or c.search_vector @@ consulta.q)
  order by c.prioridade desc, rank desc, c.updated_at desc
  limit least(greatest(coalesce(p_limite, 5), 1), 5);
$$;
