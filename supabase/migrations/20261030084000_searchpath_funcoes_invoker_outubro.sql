-- Endurece search_path de 31 funções invoker do Advisor sem alterar o corpo
-- nem configurações de work_mem existentes. pg_temp fica por último.
DO $$
DECLARE
  v record;
  v_total int := 0;
BEGIN
  FOR v IN
    SELECT p.oid::regprocedure AS assinatura,p.prosecdef,p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname = ANY(ARRAY[
        'set_updated_at_timestamp','set_current_timestamp_updated_at',
        'normalizar_telefone_whatsapp','rastreamento_atualizar_updated_at',
        'rastreamento_criar_evento','rastreamento_evento_clique',
        'rastreamento_evento_contato','rastreamento_evento_conversa',
        'rastreamento_criar_origem_padrao_empresa',
        'rastreamento_evento_primeira_mensagem','agenda_etapa1_set_updated_at',
        'definir_expiracao_janela_conversa','contato_atribuicoes_meta_updated_at',
        'contato_eh_novo','preparar_protocolo_conversa','set_updated_at',
        'vincular_evento_ao_protocolo','recalcular_resultado_protocolo',
        'rastreamento_evento_recalcular_resultados','preparar_feedback_agendamento',
        'registrar_inicio_protocolo','rastreamento_evento_contato_criado',
        'whatsapp_meta_timestamp_item','rastreamento_evento_agendamento',
        'rastreamento_classificacao_evento','registrar_estado_protocolo_conversa',
        'recalcular_classificacao_contato','estoque_normalizar_busca',
        'selecionar_ids_contatos_lista_disparo_paginados',
        'listar_contatos_operacionais_contexto_ids',
        'selecionar_ids_contatos_disparo_paginados'
      ])
  LOOP
    IF v.prosecdef THEN
      RAISE EXCEPTION 'A função % não é invoker, revisar antes de alterar',v.assinatura;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, public, pg_temp', v.assinatura);
    v_total := v_total+1;
  END LOOP;
  IF v_total <> 31 THEN
    RAISE EXCEPTION 'Esperadas 31 funções, encontradas %',v_total;
  END IF;
END $$;
