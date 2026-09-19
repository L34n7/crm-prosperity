CREATE OR REPLACE FUNCTION public.listar_contatos_operacionais_contexto_lista(p_empresa_id uuid, p_lista_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_mensagem_data_inicio date DEFAULT NULL::date, p_mensagem_data_fim date DEFAULT NULL::date, p_ultimo_atendente_id uuid DEFAULT NULL::uuid, p_filtrar_por_integracao boolean DEFAULT false)
 RETURNS TABLE(id uuid, empresa_id uuid, nome text, whatsapp_profile_name text, telefone text, email text, origem text, campanha text, variavel_contato text, rastreamento_origem_id uuid, rastreamento_campanha_id uuid, rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text, telefone_revisar boolean, classificacao text, classificacao_atualizada_em timestamp with time zone, classificacao_evento_id uuid, classificacao_protocolo_id uuid, contato_novo boolean, campanha_exibicao text, campanha_status text, campanha_origem_nome text, telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean, whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean, whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean, conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamp with time zone, conversa_encerrada_em timestamp with time zone, protocolo_atual text, protocolo_resultado text, contato_novo_no_inicio boolean, iniciado_com_bot boolean, finalizado_com_bot boolean, finalizado_por_tipo text, finalizado_por_usuario_id uuid, finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid, contexto_integracao_nome text, contexto_integracao_numero text, ultima_mensagem_contato_em timestamp with time zone, ultimo_atendente_id uuid, ultimo_atendente_nome text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    contexto.id,
    contexto.empresa_id,
    contexto.nome,
    contexto.whatsapp_profile_name,
    contexto.telefone,
    contexto.email,
    contexto.origem,
    contexto.campanha,
    coalesce(membro.variavel_contato, contexto.variavel_contato) as variavel_contato,
    contexto.rastreamento_origem_id,
    contexto.rastreamento_campanha_id,
    contexto.rastreamento_link_id,
    contexto.rastreamento_clique_id,
    contexto.observacoes,
    contexto.telefone_revisar,
    contexto.classificacao,
    contexto.classificacao_atualizada_em,
    contexto.classificacao_evento_id,
    contexto.classificacao_protocolo_id,
    contexto.contato_novo,
    contexto.campanha_exibicao,
    contexto.campanha_status,
    contexto.campanha_origem_nome,
    contexto.telefone_normalizado,
    contexto.origem_exibicao,
    contexto.opt_in_whatsapp,
    contexto.whatsapp_opt_out,
    contexto.whatsapp_opt_out_geral,
    contexto.whatsapp_opt_out_marketing,
    contexto.whatsapp_opt_out_utility,
    contexto.conversa_id,
    contexto.conversa_status,
    contexto.conversa_ultima_mensagem_em,
    contexto.conversa_encerrada_em,
    contexto.protocolo_atual,
    contexto.protocolo_resultado,
    contexto.contato_novo_no_inicio,
    contexto.iniciado_com_bot,
    contexto.finalizado_com_bot,
    contexto.finalizado_por_tipo,
    contexto.finalizado_por_usuario_id,
    contexto.finalizado_por_usuario_nome,
    contexto.contexto_integracao_whatsapp_id,
    contexto.contexto_integracao_nome,
    contexto.contexto_integracao_numero,
    contexto.ultima_mensagem_contato_em,
    contexto.ultimo_atendente_id,
    contexto.ultimo_atendente_nome,
    contexto.created_at,
    contexto.updated_at
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  join public.contatos_lista_membros membro
    on membro.lista_id = p_lista_id
   and membro.contato_id = contexto.id
  join public.contatos_listas lista
    on lista.id = membro.lista_id
   and lista.empresa_id = p_empresa_id;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_contatos_operacionais_contexto_disparo_anterior_lista(p_empresa_id uuid, p_campanha_id uuid, p_lista_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_mensagem_data_inicio date DEFAULT NULL::date, p_mensagem_data_fim date DEFAULT NULL::date, p_ultimo_atendente_id uuid DEFAULT NULL::uuid, p_filtrar_por_integracao boolean DEFAULT false)
 RETURNS TABLE(id uuid, empresa_id uuid, nome text, whatsapp_profile_name text, telefone text, email text, origem text, campanha text, variavel_contato text, rastreamento_origem_id uuid, rastreamento_campanha_id uuid, rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text, telefone_revisar boolean, classificacao text, classificacao_atualizada_em timestamp with time zone, classificacao_evento_id uuid, classificacao_protocolo_id uuid, contato_novo boolean, campanha_exibicao text, campanha_status text, campanha_origem_nome text, telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean, whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean, whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean, conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamp with time zone, conversa_encerrada_em timestamp with time zone, protocolo_atual text, protocolo_resultado text, contato_novo_no_inicio boolean, iniciado_com_bot boolean, finalizado_com_bot boolean, finalizado_por_tipo text, finalizado_por_usuario_id uuid, finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid, contexto_integracao_nome text, contexto_integracao_numero text, ultima_mensagem_contato_em timestamp with time zone, ultimo_atendente_id uuid, ultimo_atendente_nome text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    contexto.id,
    contexto.empresa_id,
    contexto.nome,
    contexto.whatsapp_profile_name,
    contexto.telefone,
    contexto.email,
    contexto.origem,
    contexto.campanha,
    coalesce(membro.variavel_contato, contexto.variavel_contato) as variavel_contato,
    contexto.rastreamento_origem_id,
    contexto.rastreamento_campanha_id,
    contexto.rastreamento_link_id,
    contexto.rastreamento_clique_id,
    contexto.observacoes,
    contexto.telefone_revisar,
    contexto.classificacao,
    contexto.classificacao_atualizada_em,
    contexto.classificacao_evento_id,
    contexto.classificacao_protocolo_id,
    contexto.contato_novo,
    contexto.campanha_exibicao,
    contexto.campanha_status,
    contexto.campanha_origem_nome,
    contexto.telefone_normalizado,
    contexto.origem_exibicao,
    contexto.opt_in_whatsapp,
    contexto.whatsapp_opt_out,
    contexto.whatsapp_opt_out_geral,
    contexto.whatsapp_opt_out_marketing,
    contexto.whatsapp_opt_out_utility,
    contexto.conversa_id,
    contexto.conversa_status,
    contexto.conversa_ultima_mensagem_em,
    contexto.conversa_encerrada_em,
    contexto.protocolo_atual,
    contexto.protocolo_resultado,
    contexto.contato_novo_no_inicio,
    contexto.iniciado_com_bot,
    contexto.finalizado_com_bot,
    contexto.finalizado_por_tipo,
    contexto.finalizado_por_usuario_id,
    contexto.finalizado_por_usuario_nome,
    contexto.contexto_integracao_whatsapp_id,
    contexto.contexto_integracao_nome,
    contexto.contexto_integracao_numero,
    contexto.ultima_mensagem_contato_em,
    contexto.ultimo_atendente_id,
    contexto.ultimo_atendente_nome,
    contexto.created_at,
    contexto.updated_at
  from public.listar_contatos_operacionais_contexto_disparo_anterior(
    p_empresa_id,
    p_campanha_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  join public.contatos_lista_membros membro
    on membro.lista_id = p_lista_id
   and membro.contato_id = contexto.id
  join public.contatos_listas lista
    on lista.id = membro.lista_id
   and lista.empresa_id = p_empresa_id;
$function$
;

revoke all on function public.listar_contatos_operacionais_contexto_lista(uuid, uuid, uuid, date, date, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto_lista(uuid, uuid, uuid, date, date, uuid, boolean)
  to service_role;

revoke all on function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(uuid, uuid, uuid, uuid, date, date, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(uuid, uuid, uuid, uuid, date, date, uuid, boolean)
  to service_role;
