create or replace function public.listar_disparos_agendados_manuais_resumo(
  p_empresa_id uuid
)
returns table (
  representative_id uuid,
  grupo_id text,
  executar_em timestamptz,
  created_at timestamptz,
  status_geral text,
  total bigint,
  pendentes bigint,
  executando bigint,
  executados bigint,
  cancelados bigint,
  erros bigint,
  nome_campanha text,
  template_id text,
  template_nome text,
  template_idioma text,
  template_categoria text,
  integracao_whatsapp_id text,
  integracao_nome text
)
language sql
security invoker
set search_path = ''
as $$
  select
    (array_agg(a.id order by a.created_at desc, a.id))[1] as representative_id,
    a.payload_json->>'agendamento_grupo_id' as grupo_id,
    min(a.executar_em) as executar_em,
    max(a.created_at) as created_at,
    case
      when count(*) filter (where a.status = 'erro') > 0 then 'erro'
      when count(*) filter (where a.status = 'executando') > 0 then 'executando'
      when count(*) filter (where a.status = 'pendente') > 0 then 'pendente'
      when count(*) filter (where a.status = 'executado') = count(*) then 'executado'
      when count(*) filter (where a.status = 'cancelado') = count(*) then 'cancelado'
      else 'executado'
    end as status_geral,
    count(*) as total,
    count(*) filter (where a.status = 'pendente') as pendentes,
    count(*) filter (where a.status = 'executando') as executando,
    count(*) filter (where a.status = 'executado') as executados,
    count(*) filter (where a.status = 'cancelado') as cancelados,
    count(*) filter (where a.status = 'erro') as erros,
    max(a.payload_json->>'nome_campanha') as nome_campanha,
    max(a.payload_json->>'template_id') as template_id,
    max(a.payload_json->>'template_nome') as template_nome,
    max(a.payload_json->>'template_idioma') as template_idioma,
    max(a.payload_json->>'template_categoria') as template_categoria,
    max(a.payload_json->>'integracao_whatsapp_id') as integracao_whatsapp_id,
    max(a.payload_json->>'integracao_nome') as integracao_nome
  from public.automacao_agendamentos a
  where a.empresa_id = p_empresa_id
    and a.tipo_agendamento = 'disparo_template'
    and a.payload_json->>'origem' = 'manual_agendado'
    and nullif(a.payload_json->>'agendamento_grupo_id', '') is not null
  group by a.payload_json->>'agendamento_grupo_id'
  order by max(a.created_at) desc;
$$;

revoke execute on function public.listar_disparos_agendados_manuais_resumo(uuid) from public;
revoke execute on function public.listar_disparos_agendados_manuais_resumo(uuid) from anon;
revoke execute on function public.listar_disparos_agendados_manuais_resumo(uuid) from authenticated;
grant execute on function public.listar_disparos_agendados_manuais_resumo(uuid) to service_role;
