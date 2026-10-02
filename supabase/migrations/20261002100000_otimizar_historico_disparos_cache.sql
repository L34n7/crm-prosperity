-- Protege o histórico de disparos contra consultas caras e rajadas concorrentes.
-- A versão otimizada usa o próprio log de disparos (atualizado pelo webhook)
-- em vez de procurar novamente a mensagem correspondente para cada linha.

create index if not exists whatsapp_disparos_logs_empresa_integracao_created_id_idx
  on public.whatsapp_disparos_logs (
    empresa_id,
    integracao_whatsapp_id,
    created_at desc,
    id desc
  );

create index if not exists whatsapp_disparos_logs_empresa_status_created_id_idx
  on public.whatsapp_disparos_logs (
    empresa_id,
    status,
    created_at desc,
    id desc
  );

create or replace view public.whatsapp_disparo_historico_otimizado_v
with (security_invoker = true)
as
with logs_enriquecidos as (
  select
    l.*,
    c.nome as campanha_nome,
    t.categoria as template_categoria_cadastro,
    case
      when lower(coalesce(l.metadata_json ->> 'ultimo_status_meta', '')) in ('read', 'lida')
        then 'lida'
      when lower(coalesce(l.metadata_json ->> 'ultimo_status_meta', '')) in ('delivered', 'entregue')
        then 'entregue'
      when lower(coalesce(l.metadata_json ->> 'ultimo_status_meta', '')) in ('sent', 'enviada')
        then 'enviada'
      when lower(coalesce(l.metadata_json ->> 'ultimo_status_meta', '')) in ('failed', 'falha')
        then 'falha'
      when l.status = 'falha' then 'falha'
      when l.status = 'sucesso' then 'enviada'
      when l.status = 'processando' then 'processando'
      else null
    end as mensagem_status_envio,
    coalesce(l.metadata_json, '{}'::jsonb) as metadata_final
  from public.whatsapp_disparos_logs l
  left join public.whatsapp_disparo_campanhas c
    on c.id = l.campanha_disparo_id
   and c.empresa_id = l.empresa_id
  left join public.whatsapp_templates t
    on t.id = l.template_id
   and t.empresa_id = l.empresa_id
),
logs_historico as (
  select
    l.empresa_id,
    l.created_at as cursor_data,
    '3_' || replace(l.id::text, '-', '') as cursor_chave,
    l.id::text as registro_id,
    l.campanha_disparo_id::text as campanha_id,
    l.campanha_nome,
    l.numero,
    coalesce(l.nome_contato, 'Sem nome') as nome_contato,
    coalesce(l.template_nome, '-') as template_nome,
    l.template_idioma,
    coalesce(
      l.template_categoria_cadastro,
      l.metadata_final ->> 'template_categoria',
      l.metadata_final ->> 'categoria',
      l.metadata_final #>> '{template,category}',
      l.metadata_final #>> '{template,categoria}'
    ) as template_categoria,
    coalesce(l.mensagem, 'Sem conteúdo') as mensagem_template,
    case
      when l.mensagem_status_envio = 'falha' then 'falha'
      when l.mensagem_status_envio in ('enviada', 'entregue', 'lida') then 'sucesso'
      when l.status = 'falha' then 'falha'
      when l.status = 'sucesso' then 'sucesso'
      when l.status = 'processando' then 'processando'
      else 'pendente'
    end as status_disparo,
    case
      when l.mensagem_status_envio = 'lida' then 'Lida'
      when l.mensagem_status_envio = 'entregue' then 'Entregue'
      when l.mensagem_status_envio = 'enviada' then 'Enviado'
      when l.mensagem_status_envio = 'falha' or l.status = 'falha' then 'Falhou'
      when l.status = 'sucesso' then 'Enviado'
      when l.status = 'processando' then 'Aguardando confirmação'
      else 'Pendente'
    end as status_label,
    l.status_http,
    l.message_id,
    l.conversa_id::text as conversa_id,
    l.conversa_protocolo_id::text as conversa_protocolo_id,
    l.contato_id::text as contato_id,
    l.integracao_whatsapp_id::text as integracao_whatsapp_id,
    coalesce(
      l.metadata_final #>> '{erro_meta,detalhe}',
      l.metadata_final #>> '{whatsapp_status,error_message}',
      l.metadata_final #>> '{whatsapp_status,raw_status,errors,0,error_data,details}',
      l.metadata_final #>> '{whatsapp_status,raw_status,errors,0,message}',
      l.metadata_final #>> '{meta_error,error_data,details}',
      l.metadata_final #>> '{meta_error,message}',
      l.metadata_final #>> '{meta_response,error,error_data,details}',
      l.metadata_final #>> '{meta_response,error,message}',
      l.erro
    ) as erro,
    coalesce(
      l.metadata_final #>> '{erro_meta,codigo}',
      l.metadata_final #>> '{whatsapp_status,raw_status,errors,0,code}',
      l.metadata_final #>> '{meta_error,code}',
      l.metadata_final #>> '{meta_response,error,code}'
    ) as erro_codigo_meta,
    l.metadata_final as metadata_json,
    case
      when lower(coalesce(l.metadata_final ->> 'tipo', '')) = 'disparo_template_individual'
        or lower(coalesce(l.metadata_final ->> 'origem', '')) = 'individual'
        then 'individual'
      when lower(coalesce(l.metadata_final ->> 'tipo', '')) in (
        'disparo_template_agendado',
        'disparo_template_agendado_fila'
      )
        or lower(coalesce(l.metadata_final ->> 'origem', '')) = 'agendado'
        then 'agendado'
      else 'manual'
    end as origem_historico,
    (
      l.mensagem_status_envio in ('enviada', 'entregue', 'lida')
      or l.status = 'sucesso'
    ) as ok,
    null::text as status_campanha,
    null::integer as total_itens,
    null::integer as total_enviados,
    null::integer as total_falhas,
    null::integer as total_cancelados,
    null::text as pausa_motivo,
    lower(
      concat_ws(
        ' ',
        l.numero,
        l.nome_contato,
        l.template_nome,
        l.campanha_nome,
        l.mensagem,
        l.erro
      )
    ) as search_text
  from logs_enriquecidos l
),
agendados_historico as (
  select
    m.empresa_id,
    m.created_at as cursor_data,
    '2_' || replace(m.id::text, '-', '') as cursor_chave,
    m.id::text as registro_id,
    null::text as campanha_id,
    null::text as campanha_nome,
    coalesce(m.metadata_json ->> 'numero_destino', '-') as numero,
    coalesce(m.metadata_json ->> 'nome_contato', 'Sem nome') as nome_contato,
    coalesce(m.metadata_json ->> 'template_nome', '-') as template_nome,
    m.metadata_json ->> 'template_idioma' as template_idioma,
    coalesce(
      m.metadata_json ->> 'template_categoria',
      m.metadata_json ->> 'categoria',
      m.metadata_json #>> '{template,category}',
      m.metadata_json #>> '{template,categoria}'
    ) as template_categoria,
    coalesce(
      m.metadata_json ->> 'conteudo_renderizado',
      m.conteudo,
      'Sem conteúdo'
    ) as mensagem_template,
    case
      when m.status_envio = 'falha' then 'falha'
      when m.status_envio in ('enviada', 'entregue', 'lida') then 'sucesso'
      when m.status_envio = 'processando' then 'processando'
      else 'pendente'
    end as status_disparo,
    case
      when m.status_envio = 'lida' then 'Lida'
      when m.status_envio = 'entregue' then 'Entregue'
      when m.status_envio = 'enviada' then 'Enviado'
      when m.status_envio = 'falha' then 'Falhou'
      when m.status_envio = 'processando' then 'Aguardando confirmação'
      else 'Pendente'
    end as status_label,
    null::integer as status_http,
    m.mensagem_externa_id as message_id,
    m.conversa_id::text as conversa_id,
    m.conversa_protocolo_id::text as conversa_protocolo_id,
    m.metadata_json ->> 'contato_id' as contato_id,
    m.metadata_json ->> 'integracao_whatsapp_id' as integracao_whatsapp_id,
    coalesce(
      m.metadata_json #>> '{whatsapp_status,error_message}',
      m.metadata_json #>> '{whatsapp_status,raw_status,errors,0,error_data,details}',
      m.metadata_json #>> '{whatsapp_status,raw_status,errors,0,message}'
    ) as erro,
    m.metadata_json #>> '{whatsapp_status,raw_status,errors,0,code}' as erro_codigo_meta,
    coalesce(m.metadata_json, '{}'::jsonb) as metadata_json,
    'agendado'::text as origem_historico,
    m.status_envio in ('enviada', 'entregue', 'lida') as ok,
    null::text as status_campanha,
    null::integer as total_itens,
    null::integer as total_enviados,
    null::integer as total_falhas,
    null::integer as total_cancelados,
    null::text as pausa_motivo,
    lower(
      concat_ws(
        ' ',
        m.metadata_json ->> 'numero_destino',
        m.metadata_json ->> 'nome_contato',
        m.metadata_json ->> 'template_nome',
        m.metadata_json ->> 'conteudo_renderizado',
        m.conteudo
      )
    ) as search_text
  from public.mensagens m
  where m.tipo_mensagem = 'template'
    and m.origem = 'automatica'
    and m.metadata_json ->> 'tipo' = 'disparo_template_agendado'
    and not exists (
      select 1
      from public.whatsapp_disparos_logs l
      where l.empresa_id = m.empresa_id
        and l.message_id = m.mensagem_externa_id
    )
),
campanhas_interrompidas_historico as (
  select
    c.empresa_id,
    c.updated_at as cursor_data,
    '1_' || replace(c.id::text, '-', '') as cursor_chave,
    ('campanha-' || c.id::text) as registro_id,
    c.id::text as campanha_id,
    c.nome as campanha_nome,
    concat(coalesce(c.total_itens, 0), ' contatos') as numero,
    'Disparo em massa'::text as nome_contato,
    coalesce(c.template_nome, t.nome, '-') as template_nome,
    coalesce(c.template_idioma, t.idioma) as template_idioma,
    coalesce(
      c.template_categoria,
      t.categoria,
      c.metadata_json ->> 'template_categoria',
      c.metadata_json ->> 'categoria',
      c.metadata_json #>> '{template,category}',
      c.metadata_json #>> '{template,categoria}'
    ) as template_categoria,
    coalesce(
      c.pausa_motivo,
      c.erro,
      'O disparo em massa foi interrompido para proteger a conta WhatsApp e a estabilidade do sistema.'
    ) as mensagem_template,
    'falha'::text as status_disparo,
    'Disparo em massa cancelado'::text as status_label,
    null::integer as status_http,
    null::text as message_id,
    null::text as conversa_id,
    null::text as conversa_protocolo_id,
    null::text as contato_id,
    c.integracao_whatsapp_id::text as integracao_whatsapp_id,
    coalesce(c.erro, c.pausa_motivo) as erro,
    null::text as erro_codigo_meta,
    (
      coalesce(c.metadata_json, '{}'::jsonb)
      || jsonb_build_object(
        'tipo', 'campanha_disparo_pausada',
        'campanha_id', c.id,
        'campanha_nome', c.nome,
        'status_campanha', c.status,
        'total_itens', coalesce(c.total_itens, 0),
        'total_enviados', coalesce(c.total_enviados, 0),
        'total_falhas', coalesce(c.total_falhas, 0),
        'total_cancelados', greatest(
          coalesce(c.total_cancelados, 0)
          + coalesce(c.total_pendentes, 0)
          + coalesce(c.total_processando, 0),
          0
        ),
        'total_pendentes', coalesce(c.total_pendentes, 0),
        'total_processando', coalesce(c.total_processando, 0),
        'pausa_motivo', c.pausa_motivo
      )
    ) as metadata_json,
    'campanha_pausada'::text as origem_historico,
    false as ok,
    c.status as status_campanha,
    coalesce(c.total_itens, 0) as total_itens,
    coalesce(c.total_enviados, 0) as total_enviados,
    coalesce(c.total_falhas, 0) as total_falhas,
    greatest(
      coalesce(c.total_cancelados, 0)
      + coalesce(c.total_pendentes, 0)
      + coalesce(c.total_processando, 0),
      0
    ) as total_cancelados,
    c.pausa_motivo,
    lower(
      concat_ws(
        ' ',
        c.nome,
        c.template_nome,
        t.nome,
        c.status,
        c.pausa_motivo,
        c.erro
      )
    ) as search_text
  from public.whatsapp_disparo_campanhas c
  left join public.whatsapp_templates t
    on t.id = c.template_id
   and t.empresa_id = c.empresa_id
  where c.status in (
    'pausada_por_falhas',
    'pausada_por_lista_invalida',
    'pausada_por_erro_meta',
    'pausada_por_conta_bloqueada',
    'cancelada',
    'erro'
  )
)
select * from logs_historico
union all
select * from agendados_historico
union all
select * from campanhas_interrompidas_historico;

revoke all on public.whatsapp_disparo_historico_otimizado_v
  from anon, authenticated;
grant select on public.whatsapp_disparo_historico_otimizado_v
  to service_role;

create table if not exists public.whatsapp_disparo_historico_totais_cache (
  chave text primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  total bigint not null default 0,
  sucesso bigint not null default 0,
  processando bigint not null default 0,
  falha bigint not null default 0,
  atualizado_em timestamptz not null default now()
);

create index if not exists whatsapp_disparo_historico_totais_cache_empresa_idx
  on public.whatsapp_disparo_historico_totais_cache (empresa_id, atualizado_em desc);

alter table public.whatsapp_disparo_historico_totais_cache enable row level security;
revoke all on table public.whatsapp_disparo_historico_totais_cache
  from anon, authenticated;
grant all on table public.whatsapp_disparo_historico_totais_cache
  to service_role;

create or replace function public.buscar_whatsapp_disparo_historico_paginado_v3(
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
returns setof public.whatsapp_disparo_historico_otimizado_v
language sql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $$
  select h.*
  from public.whatsapp_disparo_historico_otimizado_v h
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
      or (p_status = 'falha' and h.status_disparo in ('falha', 'pendente'))
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

revoke all on function public.buscar_whatsapp_disparo_historico_paginado_v3(
  uuid, integer, timestamptz, text, text, uuid, text, uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.buscar_whatsapp_disparo_historico_paginado_v3(
  uuid, integer, timestamptz, text, text, uuid, text, uuid, uuid[]
) to service_role;

create or replace function public.contar_whatsapp_disparo_historico_v3(
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
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $$
declare
  v_integracoes text;
  v_chave text;
  v_cache public.whatsapp_disparo_historico_totais_cache%rowtype;
  v_lock_ok boolean;
  v_total bigint := 0;
  v_sucesso bigint := 0;
  v_processando bigint := 0;
  v_falha bigint := 0;
begin
  select string_agg(x::text, ',' order by x::text)
    into v_integracoes
  from unnest(coalesce(p_integracoes_permitidas, '{}'::uuid[])) as x;

  v_chave := md5(concat_ws(
    '|',
    p_empresa_id::text,
    coalesce(p_campanha_id::text, '*'),
    lower(btrim(coalesce(p_busca, ''))),
    coalesce(p_integracao_whatsapp_id::text, '*'),
    case when p_integracoes_permitidas is null then '*' else coalesce(v_integracoes, '') end
  ));

  select *
    into v_cache
  from public.whatsapp_disparo_historico_totais_cache
  where chave = v_chave;

  if found and v_cache.atualizado_em >= now() - interval '60 seconds' then
    return query
    select v_cache.total, v_cache.sucesso, v_cache.processando, v_cache.falha;
    return;
  end if;

  v_lock_ok := pg_try_advisory_xact_lock(hashtextextended(v_chave, 0));

  if not v_lock_ok then
    if v_cache.chave is not null
      and v_cache.atualizado_em >= now() - interval '10 minutes'
    then
      return query
      select v_cache.total, v_cache.sucesso, v_cache.processando, v_cache.falha;
    end if;

    -- Outra sessão já está calculando a mesma combinação.
    -- Retornar sem linha é preferível a iniciar uma segunda varredura cara.
    return;
  end if;

  -- Revalida depois de obter o lock para evitar trabalho duplicado.
  select *
    into v_cache
  from public.whatsapp_disparo_historico_totais_cache
  where chave = v_chave;

  if found and v_cache.atualizado_em >= now() - interval '60 seconds' then
    return query
    select v_cache.total, v_cache.sucesso, v_cache.processando, v_cache.falha;
    return;
  end if;

  select
    count(*)::bigint,
    count(*) filter (where h.status_disparo = 'sucesso')::bigint,
    count(*) filter (where h.status_disparo = 'processando')::bigint,
    count(*) filter (where h.status_disparo in ('falha', 'pendente'))::bigint
  into v_total, v_sucesso, v_processando, v_falha
  from public.whatsapp_disparo_historico_otimizado_v h
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

  insert into public.whatsapp_disparo_historico_totais_cache (
    chave,
    empresa_id,
    total,
    sucesso,
    processando,
    falha,
    atualizado_em
  )
  values (
    v_chave,
    p_empresa_id,
    v_total,
    v_sucesso,
    v_processando,
    v_falha,
    now()
  )
  on conflict (chave) do update
  set
    total = excluded.total,
    sucesso = excluded.sucesso,
    processando = excluded.processando,
    falha = excluded.falha,
    atualizado_em = excluded.atualizado_em;

  return query select v_total, v_sucesso, v_processando, v_falha;
end;
$$;

revoke all on function public.contar_whatsapp_disparo_historico_v3(
  uuid, uuid, text, uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.contar_whatsapp_disparo_historico_v3(
  uuid, uuid, text, uuid, uuid[]
) to service_role;

notify pgrst, 'reload schema';
