-- Auditoria nativa de mutacoes administrativas e comerciais.
-- Registra mudancas na mesma transacao, omitindo dados sensiveis.
-- Controle de campos evita auditar heartbeats, contadores e tokens consumidos por mensagem.

create or replace function public.crm_auditoria_valor_seguro_v2(p_campo text, p_valor jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare v_texto text;
begin
  if p_valor is null or p_valor = 'null'::jsonb then return 'null'::jsonb; end if;
  if lower(p_campo) ~ '(senha|password|secret|token|credential|credencial|chave|(^|_)key($|_)|pin_|pin$|cpf|cnpj|documento|diagnostico|anamnese|prescricao|queixa|prontuario|observac|conteudo|prompt|instruc|foto|imagem|video|anexo|arquivo|payload|metadata|config_json|telefone|email|endereco|nome_cliente|nome_responsavel|access_|refresh_|api_|url|link|ip$|user_agent)'
  then return to_jsonb('[valor protegido]'::text); end if;
  if jsonb_typeof(p_valor) in ('array','object') then
    return to_jsonb('[estrutura alterada]'::text);
  end if;
  v_texto := p_valor #>> '{}';
  if length(v_texto) > 200 then
    return to_jsonb('[texto alterado - ' || length(v_texto)::text || ' caracteres]'::text);
  end if;
  return p_valor;
end;
$$;

create or replace function public.crm_auditoria_mutacao_v2()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_doc jsonb;
  v_empresa_id uuid;
  v_entidade_id uuid;
  v_ator_id uuid;
  v_ator_nome text;
  v_actor_hint uuid;
  v_ant jsonb := '{}'::jsonb;
  v_dep jsonb := '{}'::jsonb;
  v_campos text[] := '{}'::text[];
  v_todos text[];
  v_col text;
  v_categoria text;
  v_lista text;
  v_operacao text;
  v_chave text;
  v_fallback text;
  v_autor_origem text;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_doc := v_new;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_doc := v_old;
  else
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_doc := v_new;
  end if;

  v_categoria := coalesce(nullif(TG_ARGV[0],''),'sistema');
  v_lista := coalesce(nullif(TG_ARGV[1],''),'*');
  if v_lista='*' then
    select coalesce(array_agg(k),array[]::text[]) into v_todos
    from jsonb_object_keys(v_doc || v_old) k;
  else
    v_todos := string_to_array(v_lista,',');
  end if;

  foreach v_col in array v_todos loop
    if v_col = any(array['id','empresa_id','created_at','updated_at','criado_em','atualizado_em','updated_by','created_by','ultima_sincronizacao_em','sync_at','last_sync_at'])
    then continue; end if;
    if not (v_doc ? v_col or v_old ? v_col) then continue; end if;
    if TG_OP='UPDATE' and v_old->v_col is not distinct from v_new->v_col then
      continue;
    end if;
    if TG_OP='INSERT' and (v_new->v_col is null or v_new->v_col='null'::jsonb) then
      continue;
    end if;
    v_campos := array_append(v_campos,v_col);
    if TG_OP <> 'INSERT' then
      v_ant := v_ant || jsonb_build_object(v_col,public.crm_auditoria_valor_seguro_v2(v_col,v_old->v_col));
    end if;
    if TG_OP <> 'DELETE' then
      v_dep := v_dep || jsonb_build_object(v_col,public.crm_auditoria_valor_seguro_v2(v_col,v_new->v_col));
    end if;
  end loop;

  if TG_OP='UPDATE' and coalesce(array_length(v_campos,1),0)=0 then return NEW; end if;

  -- Empresa gestora de white-label e/ou tenant normal; nunca mistura tenants.
  if TG_TABLE_NAME='empresas' then
    v_empresa_id := (v_doc->>'id')::uuid;
  elsif TG_TABLE_NAME='white_labels' then
    v_empresa_id := nullif(v_doc->>'empresa_gestora_id','')::uuid;
  elsif TG_TABLE_NAME='white_label_administradores' then
    select wl.empresa_gestora_id into v_empresa_id
      from public.white_labels wl
      where wl.id = nullif(v_doc->>'white_label_id','')::uuid;
  elsif TG_TABLE_NAME='imobiliario_integracoes_leads_visibilidade' then
    v_empresa_id := nullif(v_doc->>'empresa_visualizadora_id','')::uuid;
  elsif TG_TABLE_NAME='perfil_permissoes' then
    select pf.empresa_id into v_empresa_id
      from public.perfis_empresa pf
      where pf.id = nullif(v_doc->>'perfil_empresa_id','')::uuid;
  elsif TG_TABLE_NAME in ('usuarios_perfis','usuarios_setores','usuario_permissoes') then
    v_empresa_id := nullif(v_doc->>'empresa_id','')::uuid;
    if v_empresa_id is null then
      select u.empresa_id into v_empresa_id from public.usuarios u
      where u.id=nullif(v_doc->>'usuario_id','')::uuid;
    end if;
  else
    v_empresa_id := nullif(v_doc->>'empresa_id','')::uuid;
  end if;

  -- Excepcao segura: sem empresa vinculada, nao atrelar a empresa alheia.
  if v_empresa_id is null then
    -- Exclusões por cascata podem ocorrer após a exclusão do pai: o log do pai
    -- já registra a operação, sem bloquear a remoção relacional.
    if TG_OP='DELETE' then return OLD; end if;
    raise exception 'Auditoria: impossivel identificar empresa para %.%',TG_TABLE_NAME,TG_OP;
  end if;

  if v_doc ? 'id' and v_doc->>'id' is not null then
    v_entidade_id := (v_doc->>'id')::uuid;
    v_chave := v_doc->>'id';
  else
    -- Tabelas com PK composta usam identificador estavel, nao UUID arbitrario.
    v_chave := concat_ws(':',coalesce(v_doc->>'codigo',''),coalesce(v_doc->>'plano_codigo',''),
      coalesce(v_doc->>'modelo_id',''),coalesce(v_doc->>'categoria',''),
      coalesce(v_doc->>'faixa_id',''),coalesce(v_doc->>'usuario_id',''),
      coalesce(v_doc->>'tipo',''),coalesce(v_doc->>'item_id',''),
      coalesce(v_doc->>'codigo_fipe',''),coalesce(v_doc->>'nome',''));
    v_entidade_id := md5(TG_TABLE_NAME || ':' || v_empresa_id::text || ':' || v_chave)::uuid;
  end if;

  v_actor_hint := null;
  if v_doc ? 'updated_by' and v_doc->>'updated_by' is not null then
    begin v_actor_hint := (v_doc->>'updated_by')::uuid; exception when invalid_text_representation then null; end;
  elsif TG_OP='INSERT' and v_doc ? 'created_by' and v_doc->>'created_by' is not null then
    begin v_actor_hint := (v_doc->>'created_by')::uuid; exception when invalid_text_representation then null; end;
  end if;

  select u.id,u.nome into v_ator_id,v_ator_nome
  from public.usuarios u
  where u.empresa_id=v_empresa_id and u.id=coalesce(auth.uid(),v_actor_hint)
  limit 1;
  v_autor_origem := case when v_ator_id is not null then 'usuario_identificado' else 'sistema_api' end;
  v_operacao := case TG_OP when 'INSERT' then 'registro_criado'
    when 'DELETE' then 'registro_excluido' else 'registro_alterado' end;

  insert into public.logs_auditoria (
    empresa_id, categoria, entidade, entidade_id, acao, descricao,
    usuario_id, usuario_nome, antes, depois, detalhes, metadata
  )
  values(
    v_empresa_id,v_categoria,TG_TABLE_NAME,v_entidade_id,v_operacao,
    TG_TABLE_NAME || ': ' || array_to_string(v_campos,', '),
    v_ator_id,v_ator_nome,
    nullif(v_ant,'{}'::jsonb),nullif(v_dep,'{}'::jsonb),
    jsonb_build_object('campos_alterados',to_jsonb(v_campos),
      'operacao',TG_OP,'tabela',TG_TABLE_NAME,'chave_registro',v_chave),
    jsonb_build_object('origem','auditoria_nativa_v2','ator',v_autor_origem)
  );
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.crm_auditoria_valor_seguro_v2(text,jsonb) from PUBLIC,anon,authenticated;
revoke all on function public.crm_auditoria_mutacao_v2() from PUBLIC,anon,authenticated;

do $audit$
declare
  r record;
  v_campos text;
  v_colunas text[];
  v_update_of text;
  v_instalados integer := 0;
begin
  for r in
    select categoria,tabela,campos
    from jsonb_to_recordset('[{"categoria":"agentes_ia","tabela":"agentes_ia","campos":"*"},{"categoria":"agentes_ia","tabela":"agente_ia_conhecimentos","campos":"*"},{"categoria":"agentes_ia","tabela":"agente_ia_ferramentas","campos":"*"},{"categoria":"agentes_ia","tabela":"agente_ia_gatilhos","campos":"*"},{"categoria":"configuracoes","tabela":"configuracoes_empresa","campos":"*"},{"categoria":"configuracoes","tabela":"configuracoes_usuario","campos":"*"},{"categoria":"configuracoes","tabela":"empresas","campos":"nome_fantasia,razao_social,documento,email,telefone,nome_responsavel,status,plano_id,nicho_id,timezone,logo_url,site,endereco,cidade,estado,limite_integracoes_whatsapp,limite_total_numeros_whatsapp,limite_usuarios,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em,assinatura_renovada_em,assinatura_gateway,cancelada_em,exclusao_prevista_em,white_label_id,white_label_tipo,restauracao_pendente_pagamento_em,encerramento_por"},{"categoria":"configuracoes","tabela":"empresa_modulos","campos":"*"},{"categoria":"configuracoes","tabela":"empresa_tokens_ia","campos":"limite_mensal,limite_mensal_personalizado,periodo_inicio,periodo_fim,ultima_renovacao_em"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_classificacoes_fipe","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_configuracoes","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_cotacoes","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_faixas","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_modelos_empresa","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_modelos_plano","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_opcionais_empresa","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_planos","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_planos_arquivos","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_precos_planos","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_regras_empresa","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_regras_modelos","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_taxas_empresa","campos":"*"},{"categoria":"cotacao_veicular","tabela":"cotacao_veicular_taxas_planos","campos":"*"},{"categoria":"white_label","tabela":"white_labels","campos":"*"},{"categoria":"white_label","tabela":"white_label_administradores","campos":"*"},{"categoria":"email_marketing","tabela":"email_campanhas","campos":"nome,assunto,status,template_id,remetente_id,scheduled_at,agendado_para,finalizado_em,cancelado_em"},{"categoria":"email_marketing","tabela":"email_templates","campos":"*"},{"categoria":"email_marketing","tabela":"email_remetentes","campos":"*"},{"categoria":"email_marketing","tabela":"email_marketing_integracoes","campos":"*"},{"categoria":"email_marketing","tabela":"email_suppressions","campos":"email,motivo,fonte"},{"categoria":"whatsapp","tabela":"integracoes_whatsapp","campos":"nome_conexao,numero,provider,status,phone_number_id,waba_id,config_json,token_ref,webhook_verificado,phone_number_display_name,verified_name,phone_number_status,code_verification_status,quality_rating,onboarding_status,payment_method_added,phone_registered,app_assigned,meta_messaging_limit_tier,meta_messaging_limit,meta_account_mode,modo_integracao,coex_status,is_on_biz_app,suspensa_por_inadimplencia_em,webhook_assinatura_status"},{"categoria":"whatsapp","tabela":"whatsapp_templates","campos":"*"},{"categoria":"whatsapp","tabela":"whatsapp_service_automacao_limites","campos":"*"},{"categoria":"whatsapp","tabela":"whatsapp_opt_out_contextos","campos":"ativo,estado,status,motivo"},{"categoria":"whatsapp","tabela":"whatsapp_supressoes","campos":"status,motivo,ativo,bloqueado_em"},{"categoria":"agenda","tabela":"agenda_agendamentos","campos":"agenda_id,contato_id,conversa_id,titulo,inicio_at,fim_at,status,origem,tipo_id,responsavel_id,local,link_reuniao,cor,prioridade,confirmacao_status,resultado,concluido_em,cancelado_em,observacoes"},{"categoria":"agenda","tabela":"agenda_automacao_regras","campos":"*"},{"categoria":"agenda","tabela":"calendarios","campos":"*"},{"categoria":"agenda","tabela":"agenda_catalogo_itens","campos":"*"},{"categoria":"agenda","tabela":"agenda_disponibilidades","campos":"*"},{"categoria":"agenda","tabela":"agenda_disponibilidade_intervalos","campos":"*"},{"categoria":"agenda","tabela":"agenda_google_integracoes","campos":"google_email,google_calendar_id,sync_ativo,sync_status,refresh_token_encrypted,conectado_em"},{"categoria":"agenda","tabela":"agenda_grupos_distribuicao","campos":"*"},{"categoria":"agenda","tabela":"agenda_grupos_ocupacao","campos":"*"},{"categoria":"agenda","tabela":"agenda_resultados_comerciais","campos":"*"},{"categoria":"agenda","tabela":"agenda_tipos","campos":"*"},{"categoria":"agenda","tabela":"agenda_vinculos","campos":"*"},{"categoria":"agenda","tabela":"agenda_whatsapp_automacoes","campos":"*"},{"categoria":"agenda","tabela":"agenda_participantes","campos":"*"},{"categoria":"estoque","tabela":"estoque_configuracoes","campos":"*"},{"categoria":"estoque","tabela":"estoque_itens","campos":"*"},{"categoria":"estoque","tabela":"estoque_categorias","campos":"*"},{"categoria":"estoque","tabela":"estoque_marcas","campos":"*"},{"categoria":"estoque","tabela":"estoque_depositos","campos":"*"},{"categoria":"estoque","tabela":"estoque_localizacoes","campos":"*"},{"categoria":"estoque","tabela":"estoque_lotes","campos":"*"},{"categoria":"estoque","tabela":"estoque_embalagens","campos":"*"},{"categoria":"estoque","tabela":"estoque_precos_canais","campos":"*"},{"categoria":"estoque","tabela":"estoque_precos_historico","campos":"*"},{"categoria":"estoque","tabela":"estoque_custos_historico","campos":"*"},{"categoria":"estoque","tabela":"estoque_reservas","campos":"*"},{"categoria":"estoque","tabela":"estoque_inventarios","campos":"*"},{"categoria":"estoque","tabela":"estoque_inventario_itens","campos":"*"},{"categoria":"estoque","tabela":"estoque_movimentacoes","campos":"*"},{"categoria":"estoque","tabela":"estoque_documentos","campos":"*"},{"categoria":"estoque","tabela":"estoque_documento_itens","campos":"*"},{"categoria":"estoque","tabela":"estoque_promocoes","campos":"*"},{"categoria":"estoque","tabela":"estoque_promocao_itens","campos":"*"},{"categoria":"estoque","tabela":"estoque_regras_pagamento","campos":"*"},{"categoria":"estoque","tabela":"estoque_consumos_clinicos","campos":"*"},{"categoria":"estoque","tabela":"estoque_importacoes_produtos","campos":"*"},{"categoria":"financeiro","tabela":"pagamentos","campos":"evento,status,metodo,valor,valor_liquido,paid_at,refunded_at"},{"categoria":"financeiro","tabela":"pagamento_gateway_transacoes","campos":"status,valor,valor_centavos,metodo,paid_at,refunded_at,valor_liquido"},{"categoria":"financeiro","tabela":"prosperity_pay_assinaturas","campos":"status,billing_model,base_amount_cents,current_amount_cents,cycle_number,current_period_start,current_period_end,next_due_at,items,pending_change,pending_payment"},{"categoria":"financeiro","tabela":"prosperity_pay_recursos_agendados","campos":"*"},{"categoria":"financeiro","tabela":"ia_token_movimentacoes","campos":"*"},{"categoria":"financeiro","tabela":"ia_token_ofertas","campos":"*"},{"categoria":"financeiro","tabela":"ia_token_renovacoes","campos":"*"},{"categoria":"financeiro","tabela":"mercado_pago_integracoes","campos":"*"},{"categoria":"financeiro","tabela":"financeiro_contas_pagar","campos":"*"},{"categoria":"financeiro","tabela":"financeiro_contas_pagar_baixas","campos":"*"},{"categoria":"financeiro","tabela":"comercial_documentos","campos":"*"},{"categoria":"financeiro","tabela":"comercial_pagamentos","campos":"*"},{"categoria":"financeiro","tabela":"comercial_recebimentos_compra","campos":"*"},{"categoria":"financeiro","tabela":"comercial_recebimento_compra_itens","campos":"*"},{"categoria":"financeiro","tabela":"comercial_parceiros","campos":"*"},{"categoria":"financeiro","tabela":"fiscal_configuracoes","campos":"*"},{"categoria":"financeiro","tabela":"fiscal_documentos","campos":"*"},{"categoria":"conversas","tabela":"conversas","campos":"setor_id,responsavel_id,status,bot_ativo,prioridade,assunto,etiqueta_id,etiqueta_cor,aguardando_atendente,agente_ia_id,escopo_fila,envios_automaticos_bloqueados_em"},{"categoria":"conversas","tabela":"conversa_protocolos","campos":"*"},{"categoria":"conversas","tabela":"conversas_listas","campos":"*"},{"categoria":"conversas","tabela":"conversas_listas_itens","campos":"*"},{"categoria":"conversas","tabela":"conversas_notas","campos":"*"},{"categoria":"contatos","tabela":"contatos","campos":"nome,telefone,email,status_lead,classificacao,interesse,observacoes,automacoes_desabilitadas,telefone_revisar,campo_contato,nome_anterior"},{"categoria":"contatos","tabela":"contato_informacoes_captura","campos":"*"},{"categoria":"contatos","tabela":"contatos_listas","campos":"*"},{"categoria":"contatos","tabela":"contato_automacoes_integracoes","campos":"*"},{"categoria":"contatos","tabela":"contato_atribuicoes_meta","campos":"status,contato_id,origem_id,campanha_id"},{"categoria":"saude","tabela":"pacientes","campos":"*"},{"categoria":"saude","tabela":"prontuarios","campos":"*"},{"categoria":"saude","tabela":"prontuario_atendimentos","campos":"*"},{"categoria":"saude","tabela":"odontograma_dentes","campos":"*"},{"categoria":"saude","tabela":"odontograma_evolucoes","campos":"*"},{"categoria":"saude","tabela":"podograma_fotos","campos":"*"},{"categoria":"saude","tabela":"podograma_marcacoes","campos":"*"},{"categoria":"imobiliario","tabela":"imoveis","campos":"*"},{"categoria":"imobiliario","tabela":"imoveis_externos","campos":"status,titulo,preco,valor,valor_venda,valor_aluguel,descricao,atualizado_em,data_atualizacao,publicado,ativo"},{"categoria":"imobiliario","tabela":"imovel_publicacoes","campos":"*"},{"categoria":"imobiliario","tabela":"imovel_pessoas","campos":"*"},{"categoria":"imobiliario","tabela":"imovel_leads_portal","campos":"*"},{"categoria":"imobiliario","tabela":"imobiliario_integracoes_webhook","campos":"*"},{"categoria":"imobiliario","tabela":"imobiliario_integracoes_leads_visibilidade","campos":"*"},{"categoria":"permissoes","tabela":"usuarios","campos":"nome,email,ativo,status,perfil_id,setor_id,role,telefone"},{"categoria":"permissoes","tabela":"perfis_empresa","campos":"*"},{"categoria":"permissoes","tabela":"perfil_integracoes_whatsapp","campos":"*"},{"categoria":"permissoes","tabela":"perfil_permissoes","campos":"*"},{"categoria":"permissoes","tabela":"usuario_permissoes","campos":"*"},{"categoria":"permissoes","tabela":"usuarios_perfis","campos":"*"},{"categoria":"permissoes","tabela":"usuarios_setores","campos":"*"},{"categoria":"permissoes","tabela":"setores","campos":"*"},{"categoria":"disparos","tabela":"whatsapp_disparo_campanhas","campos":"nome,origem,status,integracao_whatsapp_id,template_id,template_nome,template_categoria,processamento_modo,limite_meta,pausa_motivo,started_at,paused_at,finished_at,metadata_json"},{"categoria":"fluxos","tabela":"automacao_fluxos","campos":"nome,descricao,status,ativo,padrao,versao_atual,fluxo_json"},{"categoria":"fluxos","tabela":"automacao_gatilhos","campos":"*"},{"categoria":"fluxos","tabela":"automacao_nos","campos":"tipo,config_json,configuracao_json,configuracoes,conteudo,ativo,ordem"},{"categoria":"fluxos","tabela":"automacao_conexoes","campos":"*"},{"categoria":"fluxos","tabela":"automacao_variaveis","campos":"*"},{"categoria":"fluxos","tabela":"automacao_intencoes","campos":"*"},{"categoria":"fluxos","tabela":"automacao_versoes","campos":"*"},{"categoria":"fluxos","tabela":"rotina_automacoes","campos":"nome,descricao,status,ativo,frequencia,horario,config_json"},{"categoria":"fluxos","tabela":"rotina_automacao_acoes","campos":"*"},{"categoria":"fluxos","tabela":"rotina_automacao_condicoes","campos":"*"},{"categoria":"fluxos","tabela":"rotina_automacao_gatilhos","campos":"*"}]'::jsonb)
      as cfg(categoria text,tabela text,campos text)
  loop
    if to_regclass('public.'||r.tabela) is null then
      raise warning 'Auditoria: tabela % nao existe, nao instalada',r.tabela;
      continue;
    end if;
    if r.campos='*' then
      execute format('drop trigger if exists trg_auditoria_nativa_v2 on public.%I',r.tabela);
      execute format('create trigger trg_auditoria_nativa_v2 after insert or update or delete on public.%I for each row execute function public.crm_auditoria_mutacao_v2(%L,%L)',r.tabela,r.categoria,r.campos);
    else
      select array_agg(c.column_name order by c.ordinal_position) into v_colunas
      from information_schema.columns c
      where c.table_schema='public' and c.table_name=r.tabela
        and c.column_name=any(string_to_array(r.campos,','));
      if cardinality(v_colunas)=0 or v_colunas is null then
        raise exception 'Auditoria: nenhuma coluna rastreavel em %: %',r.tabela,r.campos;
      end if;
      v_campos := array_to_string(v_colunas,',');
      select string_agg(format('%I',x),',') into v_update_of from unnest(v_colunas) x;
      execute format('drop trigger if exists trg_auditoria_nativa_v2 on public.%I',r.tabela);
      execute format('drop trigger if exists trg_auditoria_nativa_v2_mudanca on public.%I',r.tabela);
      execute format('create trigger trg_auditoria_nativa_v2 after insert or delete on public.%I for each row execute function public.crm_auditoria_mutacao_v2(%L,%L)',r.tabela,r.categoria,v_campos);
      execute format('create trigger trg_auditoria_nativa_v2_mudanca after update of %s on public.%I for each row execute function public.crm_auditoria_mutacao_v2(%L,%L)',v_update_of,r.tabela,r.categoria,v_campos);
    end if;
    v_instalados := v_instalados + 1;
  end loop;
  raise notice 'Auditoria instalada em % tabelas',v_instalados;
end;
$audit$;
