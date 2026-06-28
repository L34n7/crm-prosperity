create index if not exists whatsapp_disparos_logs_empresa_created_id_idx
  on public.whatsapp_disparos_logs (empresa_id, created_at desc, id desc);

create index if not exists whatsapp_disparos_logs_empresa_message_id_idx
  on public.whatsapp_disparos_logs (empresa_id, message_id)
  where message_id is not null;

create index if not exists mensagens_empresa_externa_idx
  on public.mensagens (empresa_id, mensagem_externa_id)
  where mensagem_externa_id is not null;

create index if not exists mensagens_disparos_agendados_historico_idx
  on public.mensagens (empresa_id, created_at desc, id desc)
  where tipo_mensagem = 'template'
    and origem = 'automatica'
    and metadata_json ->> 'tipo' = 'disparo_template_agendado';

create index if not exists whatsapp_disparo_campanhas_empresa_created_id_idx
  on public.whatsapp_disparo_campanhas (empresa_id, created_at desc, id desc);

create index if not exists whatsapp_disparo_campanhas_interrompidas_idx
  on public.whatsapp_disparo_campanhas (empresa_id, updated_at desc, id desc)
  where status in (
    'pausada_por_falhas',
    'pausada_por_lista_invalida',
    'pausada_por_erro_meta',
    'pausada_por_conta_bloqueada',
    'cancelada',
    'erro'
  );

create or replace view public.whatsapp_disparo_historico_paginado_v
with (security_invoker = true)
as
with logs_enriquecidos as (
  select
    l.*,
    c.nome as campanha_nome,
    t.categoria as template_categoria_cadastro,
    m.status_envio as mensagem_status_envio,
    (
      coalesce(l.metadata_json, '{}'::jsonb)
      || coalesce(m.metadata_json, '{}'::jsonb)
      || jsonb_build_object(
        'log_metadata',
        coalesce(l.metadata_json, '{}'::jsonb),
        'mensagem_metadata',
        coalesce(m.metadata_json, '{}'::jsonb)
      )
    ) as metadata_final
  from public.whatsapp_disparos_logs l
  left join public.whatsapp_disparo_campanhas c
    on c.id = l.campanha_disparo_id
   and c.empresa_id = l.empresa_id
  left join public.whatsapp_templates t
    on t.id = l.template_id
   and t.empresa_id = l.empresa_id
  left join lateral (
    select
      mensagem.status_envio,
      mensagem.metadata_json
    from public.mensagens mensagem
    where mensagem.empresa_id = l.empresa_id
      and mensagem.mensagem_externa_id = l.message_id
    order by mensagem.created_at desc, mensagem.id desc
    limit 1
  ) m on l.message_id is not null
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
      l.metadata_final #>> '{whatsapp_status,raw_status,errors,0,code}',
      l.metadata_final #>> '{meta_error,code}',
      l.metadata_final #>> '{meta_response,error,code}'
    ) as erro_codigo_meta,
    l.metadata_final as metadata_json,
    case
      when lower(coalesce(l.metadata_final ->> 'tipo', '')) = 'disparo_template_individual'
        or lower(coalesce(l.metadata_final ->> 'origem', '')) = 'individual'
        then 'individual'
      when lower(coalesce(l.metadata_final ->> 'tipo', '')) = 'disparo_template_agendado'
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
    m.metadata_json #>> '{whatsapp_status,raw_status,errors,0,code}'
      as erro_codigo_meta,
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
        'tipo',
        'campanha_disparo_pausada',
        'campanha_id',
        c.id,
        'campanha_nome',
        c.nome,
        'status_campanha',
        c.status,
        'total_itens',
        coalesce(c.total_itens, 0),
        'total_enviados',
        coalesce(c.total_enviados, 0),
        'total_falhas',
        coalesce(c.total_falhas, 0),
        'total_cancelados',
        greatest(
          coalesce(c.total_cancelados, 0)
          + coalesce(c.total_pendentes, 0)
          + coalesce(c.total_processando, 0),
          0
        ),
        'total_pendentes',
        coalesce(c.total_pendentes, 0),
        'total_processando',
        coalesce(c.total_processando, 0),
        'pausa_motivo',
        c.pausa_motivo
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

revoke all on public.whatsapp_disparo_historico_paginado_v
  from anon, authenticated;
grant select on public.whatsapp_disparo_historico_paginado_v
  to service_role;

create or replace function public.buscar_whatsapp_disparo_historico_paginado(
  p_empresa_id uuid,
  p_limite integer default 8,
  p_cursor_data timestamptz default null,
  p_cursor_chave text default null,
  p_status text default null,
  p_campanha_id uuid default null,
  p_busca text default null
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

revoke all on function public.buscar_whatsapp_disparo_historico_paginado(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.buscar_whatsapp_disparo_historico_paginado(
  uuid,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  text
) to service_role;

create or replace function public.contar_whatsapp_disparo_historico(
  p_empresa_id uuid,
  p_campanha_id uuid default null,
  p_busca text default null
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
      p_campanha_id is null
      or h.campanha_id = p_campanha_id::text
    )
    and (
      p_busca is null
      or btrim(p_busca) = ''
      or strpos(h.search_text, lower(btrim(p_busca))) > 0
    );
$$;

revoke all on function public.contar_whatsapp_disparo_historico(
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.contar_whatsapp_disparo_historico(
  uuid,
  uuid,
  text
) to service_role;

notify pgrst, 'reload schema';
