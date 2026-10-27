create or replace function public.buscar_whatsapp_disparo_erros_resumo_campanhas(
  p_empresa_id uuid,
  p_campanha_ids uuid[]
)
returns table(
  campanha_id uuid,
  erro text,
  erro_codigo_meta integer,
  quantidade bigint
)
language sql
stable
set search_path = public
as $$
  select
    i.campanha_id,
    coalesce(nullif(btrim(i.erro), ''), 'Falha sem descrição') as erro,
    i.erro_codigo_meta,
    count(*)::bigint as quantidade
  from public.whatsapp_disparo_itens i
  where i.empresa_id = p_empresa_id
    and i.campanha_id = any(coalesce(p_campanha_ids, array[]::uuid[]))
    and i.status = 'falha'
  group by
    i.campanha_id,
    coalesce(nullif(btrim(i.erro), ''), 'Falha sem descrição'),
    i.erro_codigo_meta
  order by
    i.campanha_id,
    quantidade desc,
    i.erro_codigo_meta nulls last,
    erro;
$$;

revoke all on function public.buscar_whatsapp_disparo_erros_resumo_campanhas(uuid, uuid[]) from public;
revoke all on function public.buscar_whatsapp_disparo_erros_resumo_campanhas(uuid, uuid[]) from anon;
revoke all on function public.buscar_whatsapp_disparo_erros_resumo_campanhas(uuid, uuid[]) from authenticated;
grant execute on function public.buscar_whatsapp_disparo_erros_resumo_campanhas(uuid, uuid[]) to service_role;
