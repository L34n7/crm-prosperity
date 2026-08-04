create or replace function public.listar_conflitos_disparos_contatos(
  p_empresa_id uuid,
  p_telefones text[],
  p_desde timestamptz,
  p_limite integer default 5000
)
returns table(
  id uuid,
  contato_id uuid,
  telefone_normalizado text,
  campanha_id uuid,
  created_at timestamptz,
  processed_at timestamptz,
  campanha_nome text,
  campanha_template_nome text,
  campanha_total_itens integer,
  campanha_created_at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select
    item.id,
    item.contato_id,
    item.telefone_normalizado,
    item.campanha_id,
    item.created_at,
    item.processed_at,
    campanha.nome as campanha_nome,
    campanha.template_nome as campanha_template_nome,
    campanha.total_itens as campanha_total_itens,
    campanha.created_at as campanha_created_at
  from public.whatsapp_disparo_itens item
  left join public.whatsapp_disparo_campanhas campanha
    on campanha.id = item.campanha_id
   and campanha.empresa_id = item.empresa_id
  where item.empresa_id = p_empresa_id
    and item.status = 'enviado'
    and item.created_at >= p_desde
    and coalesce(cardinality(p_telefones), 0) > 0
    and item.telefone_normalizado = any(p_telefones)
  order by item.created_at desc
  limit greatest(1, least(coalesce(p_limite, 5000), 10000));
$function$;

create or replace function public.listar_contatos_operacionais_contexto_disparo_anterior(
  p_empresa_id uuid,
  p_campanha_id uuid,
  p_integracao_whatsapp_id uuid default null,
  p_mensagem_data_inicio date default null,
  p_mensagem_data_fim date default null,
  p_ultimo_atendente_id uuid default null,
  p_filtrar_por_integracao boolean default false
)
returns table(
  id uuid,
  empresa_id uuid,
  nome text,
  whatsapp_profile_name text,
  telefone text,
  email text,
  origem text,
  campanha text,
  rastreamento_origem_id uuid,
  rastreamento_campanha_id uuid,
  rastreamento_link_id uuid,
  rastreamento_clique_id uuid,
  observacoes text,
  telefone_revisar boolean,
  classificacao text,
  classificacao_atualizada_em timestamptz,
  classificacao_evento_id uuid,
  classificacao_protocolo_id uuid,
  contato_novo boolean,
  campanha_exibicao text,
  campanha_status text,
  campanha_origem_nome text,
  telefone_normalizado text,
  origem_exibicao text,
  opt_in_whatsapp boolean,
  whatsapp_opt_out boolean,
  whatsapp_opt_out_geral boolean,
  whatsapp_opt_out_marketing boolean,
  whatsapp_opt_out_utility boolean,
  conversa_id uuid,
  conversa_status text,
  conversa_ultima_mensagem_em timestamptz,
  conversa_encerrada_em timestamptz,
  protocolo_atual text,
  protocolo_resultado text,
  contato_novo_no_inicio boolean,
  iniciado_com_bot boolean,
  finalizado_com_bot boolean,
  finalizado_por_tipo text,
  finalizado_por_usuario_id uuid,
  finalizado_por_usuario_nome text,
  contexto_integracao_whatsapp_id uuid,
  contexto_integracao_nome text,
  contexto_integracao_numero text,
  ultima_mensagem_contato_em timestamptz,
  ultimo_atendente_id uuid,
  ultimo_atendente_nome text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select contexto.*
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  where exists (
    select 1
    from public.whatsapp_disparo_itens item
    where item.empresa_id = p_empresa_id
      and item.campanha_id = p_campanha_id
      and item.status = 'enviado'
      and (
        item.contato_id = contexto.id
        or (
          item.contato_id is null
          and nullif(item.telefone_normalizado, '') is not null
          and item.telefone_normalizado = contexto.telefone_normalizado
        )
      )
  );
$function$;

grant execute on function public.listar_conflitos_disparos_contatos(uuid, text[], timestamptz, integer) to service_role;
grant execute on function public.listar_contatos_operacionais_contexto_disparo_anterior(uuid, uuid, uuid, date, date, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
