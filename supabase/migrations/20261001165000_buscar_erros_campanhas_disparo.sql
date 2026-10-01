create or replace function public.buscar_whatsapp_disparo_erros_campanhas(
  p_empresa_id uuid,
  p_campanha_ids uuid[]
)
returns table (
  campanha_id uuid,
  erro text,
  erro_codigo_meta integer,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (i.campanha_id)
    i.campanha_id,
    i.erro,
    i.erro_codigo_meta,
    i.created_at
  from public.whatsapp_disparo_itens i
  where i.empresa_id = p_empresa_id
    and i.campanha_id = any(coalesce(p_campanha_ids, array[]::uuid[]))
    and i.status = 'falha'
  order by i.campanha_id, i.created_at desc;
$$;

comment on function public.buscar_whatsapp_disparo_erros_campanhas(uuid, uuid[])
is 'Retorna a falha mais recente de cada campanha para enriquecer os cards consolidados do historico.';