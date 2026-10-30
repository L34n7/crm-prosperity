-- Otimiza as 30 políticas sinalizadas pelo Advisor sem ampliar acesso.
-- ALTER POLICY preserva papéis, comandos e lógica do isolamento entre empresas.
DO $opt$
DECLARE v record; v_using text; v_check text; v_affected integer:=0;
BEGIN
  FOR v IN
    SELECT s.tabela,s.politica,p.qual,p.with_check,p.cmd
    FROM (VALUES
      ('setores','setores_select_same_empresa'),
      ('setores','setores_insert_same_empresa'),
      ('setores','setores_update_same_empresa'),
      ('contatos','contatos_select_same_empresa'),
      ('usuarios','usuarios_select_empresa'),
      ('usuarios','usuarios_update_own_profile'),
      ('conversas_favoritas','conversas_favoritas_select_same_user'),
      ('conversas_favoritas','conversas_favoritas_insert_same_user'),
      ('conversas_favoritas','conversas_favoritas_delete_same_user'),
      ('mensagens_favoritas','mensagens_favoritas_select_same_empresa'),
      ('mensagens_favoritas','mensagens_favoritas_insert_same_empresa'),
      ('mensagens_favoritas','mensagens_favoritas_delete_same_empresa'),
      ('conversas_listas','conversas_listas_select_same_empresa'),
      ('conversas_listas','conversas_listas_insert_same_empresa'),
      ('conversas_listas','conversas_listas_update_same_empresa'),
      ('conversas_listas_itens','conversas_listas_itens_select_same_empresa'),
      ('conversas_listas_itens','conversas_listas_itens_insert_same_empresa'),
      ('conversas_listas_itens','conversas_listas_itens_delete_same_empresa'),
      ('conversas_notas','conversas_notas_insert_same_empresa'),
      ('conversas_notas','conversas_notas_update_same_empresa'),
      ('conversas_notas','conversas_notas_delete_same_empresa'),
      ('integracoes_whatsapp','usuarios podem ver integracoes da empresa'),
      ('integracoes_whatsapp','usuarios podem atualizar integracoes da empresa'),
      ('conversas','conversas_select_mesma_empresa'),
      ('mensagens','mensagens_select_mesma_empresa'),
      ('notificacoes','notificacoes_select_mesma_empresa_ou_usuario'),
      ('automacao_assistente_ia_execucoes','automacao_assistente_exec_empresa_select'),
      ('automacao_versoes','automacao_versoes_empresa_select'),
      ('automacao_intencoes','automacao_intencoes_select_empresa'),
      ('automacao_intencao_execucoes','automacao_intencao_execucoes_select_empresa')
    ) AS s(tabela,politica)
    JOIN pg_policies p ON p.schemaname='public' AND p.tablename=s.tabela AND p.policyname=s.politica
  LOOP
    v_using:=v.qual;
    v_check:=v.with_check;
    IF v_using IS NOT NULL THEN
      v_using:=replace(replace(replace(v_using,
         'auth.uid()','(select auth.uid())'),
         'auth.jwt()','(select auth.jwt())'),
         'auth.role()','(select auth.role())');
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',v.politica,v.tabela,v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_check:=replace(replace(replace(v_check,
         'auth.uid()','(select auth.uid())'),
         'auth.jwt()','(select auth.jwt())'),
         'auth.role()','(select auth.role())');
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',v.politica,v.tabela,v_check);
    END IF;
    v_affected:=v_affected+1;
  END LOOP;
  IF v_affected<>30 THEN
    RAISE EXCEPTION 'Esperadas 30 políticas RLS; encontradas %',v_affected;
  END IF;
END $opt$;
