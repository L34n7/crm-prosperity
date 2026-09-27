create or replace function public.buscar_whatsapp_disparo_historico_paginado_v2(
  p_empresa_id uuid,
  p_limite integer default 8,
  p_cursor_data timestamptz default null,
  p_cursor_chave text default null,
  p_status text default null,
  p_campanha_id uuid default null,
  p_busca text default null,
  p_integracao_whatsapp_id uuid default null,
  p_integracoes_permitidas uuid[] default null
)
returns setof public.whatsapp_disparo_historico_paginado_v
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.*
  from public.whatsapp_disparo_historico_paginado_v h
  where h.empresa_id = p_empresa_id
    and (
      h.integracao_whatsapp_id is null
      or p_integracoes_permitidas is null
      or h.integracao_whatsapp_id = any (
        array(
          select integracao_id::text
          from unnest(p_integracoes_permitidas) as integracao_id
        )
      )
    )
    and (
      p_integracao_whatsapp_id is null
      or h.integracao_whatsapp_id = p_integracao_whatsapp_id::text
    )
    and (
      p_cursor_data is null
      or p_cursor_chave is null
      or (h.cursor_data, h.cursor_chave) < (p_cursor_data, p_cursor_chave)
    )
    and (
      p_status is null
      or p_status = ''
      or p_status = 'todos'
      or (p_status = 'sucesso' and h.status_disparo = 'sucesso')
      or (p_status = 'processando' and h.status_disparo = 'processando')
      or (
        p_status = 'falha'
        and h.status_disparo in ('falha', 'pendente')
      )
    )
    and (
      p_campanha_id is null
      or h.campanha_id = p_campanha_id::text
    )
    and (
      p_busca is null
      or btrim(p_busca) = ''
      or strpos(h.search_text, lower(btrim(p_busca))) > 0
    )
  order by h.cursor_data desc, h.cursor_chave desc
  limit least(greatest(coalesce(p_limite, 8), 1), 51);
$$;

create or replace function public.contar_whatsapp_disparo_historico_v2(
  p_empresa_id uuid,
  p_campanha_id uuid default null,
  p_busca text default null,
  p_integracao_whatsapp_id uuid default null,
  p_integracoes_permitidas uuid[] default null
)
returns table (
  total bigint,
  sucesso bigint,
  processando bigint,
  falha bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) as total,
    count(*) filter (where h.status_disparo = 'sucesso') as sucesso,
    count(*) filter (where h.status_disparo = 'processando') as processando,
    count(*) filter (
      where h.status_disparo in ('falha', 'pendente')
    ) as falha
  from public.whatsapp_disparo_historico_paginado_v h
  where h.empresa_id = p_empresa_id
    and (
      h.integracao_whatsapp_id is null
      or p_integracoes_permitidas is null
      or h.integracao_whatsapp_id = any (
        array(
          select integracao_id::text
          from unnest(p_integracoes_permitidas) as integracao_id
        )
      )
    )
    and (
      p_integracao_whatsapp_id is null
      or h.integracao_whatsapp_id = p_integracao_whatsapp_id::text
    )
    and (
      p_campanha_id is null
      or h.campanha_id = p_campanha_id::text
    )
    and (
      p_busca is null
      or btrim(p_busca) = ''
      or strpos(h.search_text, lower(btrim(p_busca))) > 0
    );
$$;

revoke all on function public.buscar_whatsapp_disparo_historico_paginado_v2(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.buscar_whatsapp_disparo_historico_paginado_v2(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid[]
) to service_role;

revoke all on function public.contar_whatsapp_disparo_historico_v2(
  uuid,
  uuid,
  text,
  uuid,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.contar_whatsapp_disparo_historico_v2(
  uuid,
  uuid,
  text,
  uuid,
  uuid[]
) to service_role;

notify pgrst, 'reload schema';
