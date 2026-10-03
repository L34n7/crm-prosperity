create or replace function public.resumir_whatsapp_disparo_confirmacoes(
  p_campanha_ids uuid[]
)
returns table (
  campanha_id uuid,
  total_enviados_confirmados integer,
  total_aguardando_confirmacao integer
)
language sql
security definer
set search_path = public
as $$
  select
    i.campanha_id,
    count(*) filter (
      where i.status = 'enviado'
        and coalesce(i.metadata_json->>'ultimo_status_meta', '') in (
          'enviada',
          'entregue',
          'lida'
        )
    )::integer as total_enviados_confirmados,
    count(*) filter (
      where i.status = 'enviado'
        and coalesce(i.metadata_json->>'ultimo_status_meta', '') not in (
          'enviada',
          'entregue',
          'lida'
        )
    )::integer as total_aguardando_confirmacao
  from public.whatsapp_disparo_itens i
  where i.campanha_id = any(coalesce(p_campanha_ids, '{}'::uuid[]))
  group by i.campanha_id;
$$;

revoke all on function public.resumir_whatsapp_disparo_confirmacoes(uuid[]) from public;
grant execute on function public.resumir_whatsapp_disparo_confirmacoes(uuid[]) to service_role;
