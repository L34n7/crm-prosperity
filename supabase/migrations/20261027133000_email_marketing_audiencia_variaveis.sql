alter table public.email_campanhas
  add column if not exists audiencia_resumo_json jsonb not null default '{}'::jsonb,
  add column if not exists variaveis_config_json jsonb not null default '{}'::jsonb;

alter table public.email_campanha_destinatarios
  add column if not exists variaveis_json jsonb not null default '{}'::jsonb,
  add column if not exists fonte_lista_id uuid null references public.contatos_listas(id) on delete set null,
  add column if not exists fonte_lista_nome text null;

create index if not exists email_campanha_destinatarios_fonte_lista_idx
  on public.email_campanha_destinatarios (fonte_lista_id);

create or replace function public.email_marketing_analisar_audiencia(
  p_empresa_id uuid,
  p_lista_ids uuid[] default '{}'::uuid[],
  p_incluir_todos boolean default false,
  p_contato_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with listas_selecionadas as (
  select item.lista_id, item.ordem
  from unnest(coalesce(p_lista_ids, '{}'::uuid[]))
    with ordinality as item(lista_id, ordem)
),
base as (
  select
    c.id as contato_id,
    c.nome,
    c.whatsapp_profile_name,
    c.email,
    c.telefone,
    c.empresa,
    c.origem,
    c.campanha,
    c.interesse,
    c.status_lead,
    c.classificacao,
    c.campo_contato,
    null::uuid as lista_id,
    null::text as lista_nome,
    c.campo_contato as campo_contato_resolvido,
    1000000::bigint as prioridade
  from public.contatos c
  where p_incluir_todos = true
    and c.empresa_id = p_empresa_id

  union all

  select
    c.id,
    c.nome,
    c.whatsapp_profile_name,
    c.email,
    c.telefone,
    c.empresa,
    c.origem,
    c.campanha,
    c.interesse,
    c.status_lead,
    c.classificacao,
    c.campo_contato,
    l.id,
    l.nome,
    coalesce(m.campo_contato, c.campo_contato),
    ls.ordem::bigint
  from listas_selecionadas ls
  join public.contatos_listas l
    on l.id = ls.lista_id
   and l.empresa_id = p_empresa_id
  join public.contatos_lista_membros m
    on m.lista_id = l.id
  join public.contatos c
    on c.id = m.contato_id
   and c.empresa_id = p_empresa_id

  union all

  select
    c.id,
    c.nome,
    c.whatsapp_profile_name,
    c.email,
    c.telefone,
    c.empresa,
    c.origem,
    c.campanha,
    c.interesse,
    c.status_lead,
    c.classificacao,
    c.campo_contato,
    null::uuid,
    null::text,
    c.campo_contato,
    500000::bigint
  from public.contatos c
  where c.empresa_id = p_empresa_id
    and c.id = any(coalesce(p_contato_ids, '{}'::uuid[]))
),
avaliada as (
  select
    b.*,
    lower(btrim(coalesce(b.email, ''))) as email_normalizado,
    (
      btrim(coalesce(b.email, '')) <> ''
      and lower(btrim(b.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) as email_valido
  from base b
),
validos as (
  select *
  from avaliada
  where email_valido
),
ranqueados as (
  select
    v.*,
    row_number() over (
      partition by v.email_normalizado
      order by v.prioridade asc, v.contato_id asc
    ) as rn
  from validos v
),
unicos as (
  select *
  from ranqueados
  where rn = 1
),
conflitos as (
  select count(*)::integer as total
  from (
    select email_normalizado
    from validos
    group by email_normalizado
    having count(
      distinct nullif(btrim(coalesce(campo_contato_resolvido, '')), '')
    ) > 1
  ) x
),
estatisticas as (
  select
    (select count(*)::integer from avaliada) as total_registros,
    (select count(*)::integer from avaliada where not email_valido) as sem_email_valido,
    (select count(*)::integer from validos) as emails_validos,
    (select count(*)::integer from unicos) as emails_unicos,
    greatest(
      (select count(*)::integer from validos)
      - (select count(*)::integer from unicos),
      0
    ) as duplicados,
    (
      select count(*)::integer
      from unicos u
      where exists (
        select 1
        from public.email_suppressions s
        where lower(btrim(s.email)) = u.email_normalizado
          and (s.empresa_id is null or s.empresa_id = p_empresa_id)
      )
    ) as suprimidos,
    (select total from conflitos) as conflitos_campo_contato
),
amostra as (
  select jsonb_build_object(
    'contato_id', u.contato_id,
    'nome', coalesce(u.nome, ''),
    'email', u.email_normalizado,
    'telefone', coalesce(u.telefone, ''),
    'empresa', coalesce(u.empresa, ''),
    'origem', coalesce(u.origem, ''),
    'campanha', coalesce(u.campanha, ''),
    'interesse', coalesce(u.interesse, ''),
    'status_lead', coalesce(u.status_lead, ''),
    'classificacao', coalesce(u.classificacao, ''),
    'campo_contato', coalesce(u.campo_contato_resolvido, ''),
    'nome_whatsapp', coalesce(u.whatsapp_profile_name, u.nome, ''),
    'lista_id', u.lista_id,
    'lista_nome', u.lista_nome
  ) as contato
  from unicos u
  where not exists (
    select 1
    from public.email_suppressions s
    where lower(btrim(s.email)) = u.email_normalizado
      and (s.empresa_id is null or s.empresa_id = p_empresa_id)
  )
  order by coalesce(u.nome, ''), u.email_normalizado
  limit 1
)
select jsonb_build_object(
  'total_registros', e.total_registros,
  'sem_email_valido', e.sem_email_valido,
  'emails_validos', e.emails_validos,
  'emails_unicos', e.emails_unicos,
  'duplicados', e.duplicados,
  'suprimidos', e.suprimidos,
  'elegiveis', greatest(e.emails_unicos - e.suprimidos, 0),
  'conflitos_campo_contato', e.conflitos_campo_contato,
  'amostra', coalesce((select contato from amostra), '{}'::jsonb)
)
from estatisticas e;
$$;

revoke all on function public.email_marketing_analisar_audiencia(uuid, uuid[], boolean, uuid[])
  from public, anon, authenticated;
grant execute on function public.email_marketing_analisar_audiencia(uuid, uuid[], boolean, uuid[])
  to service_role;

create or replace function public.email_marketing_preparar_destinatarios(
  p_campanha_id uuid,
  p_empresa_id uuid,
  p_lista_ids uuid[] default '{}'::uuid[],
  p_incluir_todos boolean default false,
  p_contato_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer := 0;
  v_suprimidos integer := 0;
begin
  delete from public.email_campanha_destinatarios
  where campanha_id = p_campanha_id;

  with listas_selecionadas as (
    select item.lista_id, item.ordem
    from unnest(coalesce(p_lista_ids, '{}'::uuid[]))
      with ordinality as item(lista_id, ordem)
  ),
  base as (
    select
      c.id as contato_id,
      c.nome,
      c.whatsapp_profile_name,
      c.email,
      c.telefone,
      c.empresa,
      c.origem,
      c.campanha,
      c.interesse,
      c.status_lead,
      c.classificacao,
      c.campo_contato,
      null::uuid as lista_id,
      null::text as lista_nome,
      c.campo_contato as campo_contato_resolvido,
      1000000::bigint as prioridade
    from public.contatos c
    where p_incluir_todos = true
      and c.empresa_id = p_empresa_id

    union all

    select
      c.id,
      c.nome,
      c.whatsapp_profile_name,
      c.email,
      c.telefone,
      c.empresa,
      c.origem,
      c.campanha,
      c.interesse,
      c.status_lead,
      c.classificacao,
      c.campo_contato,
      l.id,
      l.nome,
      coalesce(m.campo_contato, c.campo_contato),
      ls.ordem::bigint
    from listas_selecionadas ls
    join public.contatos_listas l
      on l.id = ls.lista_id
     and l.empresa_id = p_empresa_id
    join public.contatos_lista_membros m
      on m.lista_id = l.id
    join public.contatos c
      on c.id = m.contato_id
     and c.empresa_id = p_empresa_id

    union all

    select
      c.id,
      c.nome,
      c.whatsapp_profile_name,
      c.email,
      c.telefone,
      c.empresa,
      c.origem,
      c.campanha,
      c.interesse,
      c.status_lead,
      c.classificacao,
      c.campo_contato,
      null::uuid,
      null::text,
      c.campo_contato,
      500000::bigint
    from public.contatos c
    where c.empresa_id = p_empresa_id
      and c.id = any(coalesce(p_contato_ids, '{}'::uuid[]))
  ),
  validos as (
    select
      b.*,
      lower(btrim(b.email)) as email_normalizado
    from base b
    where btrim(coalesce(b.email, '')) <> ''
      and lower(btrim(b.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  ranqueados as (
    select
      v.*,
      row_number() over (
        partition by v.email_normalizado
        order by v.prioridade asc, v.contato_id asc
      ) as rn
    from validos v
  ),
  unicos as (
    select *
    from ranqueados
    where rn = 1
  )
  insert into public.email_campanha_destinatarios (
    campanha_id,
    contato_id,
    email,
    nome,
    status,
    suprimido_em,
    variaveis_json,
    fonte_lista_id,
    fonte_lista_nome
  )
  select
    p_campanha_id,
    u.contato_id,
    u.email_normalizado,
    u.nome,
    case
      when exists (
        select 1
        from public.email_suppressions s
        where lower(btrim(s.email)) = u.email_normalizado
          and (s.empresa_id is null or s.empresa_id = p_empresa_id)
      ) then 'suprimido'
      else 'pendente'
    end,
    case
      when exists (
        select 1
        from public.email_suppressions s
        where lower(btrim(s.email)) = u.email_normalizado
          and (s.empresa_id is null or s.empresa_id = p_empresa_id)
      ) then now()
      else null
    end,
    jsonb_build_object(
      'nome', coalesce(u.nome, ''),
      'nome_contato', coalesce(u.nome, ''),
      'contato_nome', coalesce(u.nome, ''),
      'nome_whatsapp', coalesce(u.whatsapp_profile_name, u.nome, ''),
      'whatsapp_nome', coalesce(u.whatsapp_profile_name, u.nome, ''),
      'nome_perfil_whatsapp', coalesce(u.whatsapp_profile_name, u.nome, ''),
      'perfil_whatsapp_nome', coalesce(u.whatsapp_profile_name, u.nome, ''),
      'email', u.email_normalizado,
      'email_contato', u.email_normalizado,
      'contato_email', u.email_normalizado,
      'telefone', coalesce(u.telefone, ''),
      'numero', coalesce(u.telefone, ''),
      'numero_contato', coalesce(u.telefone, ''),
      'contato_numero', coalesce(u.telefone, ''),
      'telefone_contato', coalesce(u.telefone, ''),
      'contato_telefone', coalesce(u.telefone, ''),
      'empresa', coalesce(u.empresa, ''),
      'campo_contato', coalesce(u.campo_contato_resolvido, ''),
      'variavel_contato', coalesce(u.campo_contato_resolvido, ''),
      'interesse', coalesce(u.interesse, ''),
      'campanha', coalesce(u.campanha, ''),
      'origem', coalesce(u.origem, ''),
      'status', coalesce(u.status_lead, ''),
      'status_lead', coalesce(u.status_lead, ''),
      'classificacao', coalesce(u.classificacao, ''),
      'classificacao_lead', coalesce(u.classificacao, ''),
      'lead_classificacao', coalesce(u.classificacao, '')
    ),
    u.lista_id,
    u.lista_nome
  from unicos u;

  select count(*)::integer,
         count(*) filter (where status = 'suprimido')::integer
    into v_total, v_suprimidos
  from public.email_campanha_destinatarios
  where campanha_id = p_campanha_id;

  return jsonb_build_object(
    'total_destinatarios', v_total,
    'total_suprimidos', v_suprimidos,
    'total_programados', greatest(v_total - v_suprimidos, 0)
  );
end;
$$;

revoke all on function public.email_marketing_preparar_destinatarios(uuid, uuid, uuid[], boolean, uuid[])
  from public, anon, authenticated;
grant execute on function public.email_marketing_preparar_destinatarios(uuid, uuid, uuid[], boolean, uuid[])
  to service_role;
