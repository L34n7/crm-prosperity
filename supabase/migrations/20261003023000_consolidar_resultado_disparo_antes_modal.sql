create or replace function public.reivindicar_whatsapp_disparo_resultados(
  p_usuario_id uuid,
  p_empresa_id uuid,
  p_integracao_ids uuid[],
  p_limite integer default 25
)
returns table (campanha_id uuid)
language sql
security definer
set search_path = public
as $$
  with candidatas as (
    select e.campanha_id
    from public.whatsapp_disparo_resultado_eventos e
    where e.empresa_id = p_empresa_id
      and e.disponivel_em <= now()
      and e.integracao_whatsapp_id = any(
        coalesce(p_integracao_ids, '{}'::uuid[])
      )
      and (
        not exists (
          select 1
          from public.whatsapp_disparo_itens i
          where i.campanha_id = e.campanha_id
            and i.status = 'enviado'
            and coalesce(i.metadata_json->>'ultimo_status_meta', '') = ''
        )
        or e.finalizado_em <= now() - interval '20 seconds'
      )
      and not exists (
        select 1
        from public.whatsapp_disparo_resultado_visualizacoes v
        where v.campanha_id = e.campanha_id
          and v.usuario_id = p_usuario_id
      )
    order by e.finalizado_em asc, e.campanha_id asc
    limit least(greatest(coalesce(p_limite, 25), 1), 50)
  ),
  reivindicadas as (
    insert into public.whatsapp_disparo_resultado_visualizacoes (
      campanha_id,
      usuario_id,
      empresa_id,
      exibido_em
    )
    select
      c.campanha_id,
      p_usuario_id,
      p_empresa_id,
      now()
    from candidatas c
    on conflict (campanha_id, usuario_id) do nothing
    returning campanha_id
  )
  select r.campanha_id
  from reivindicadas r;
$$;

revoke all on function public.reivindicar_whatsapp_disparo_resultados(
  uuid, uuid, uuid[], integer
) from public;

grant execute on function public.reivindicar_whatsapp_disparo_resultados(
  uuid, uuid, uuid[], integer
) to service_role;
