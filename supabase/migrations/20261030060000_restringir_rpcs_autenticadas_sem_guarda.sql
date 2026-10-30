-- Least privilege: funções SECURITY DEFINER sem validação da identidade
-- não ficam disponíveis a usuários JWT authenticated.
-- Whitelist restrita às RPCs da Agenda que verificam auth.uid()/empresa
-- e às funções auxiliares necessárias às políticas de acesso RLS.
DO $secure$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND p.proname NOT IN (
        'agenda_etapa1_buscar_contatos',
        'agenda_etapa1_excluir_tipo',
        'agenda_etapa1_listar',
        'agenda_etapa1_listar_base',
        'agenda_etapa1_listar_tipos_personalizados',
        'agenda_etapa1_salvar_agendamento',
        'agenda_etapa1_salvar_tipo',
        'agenda_etapa2_salvar_agendamento',
        'usuario_empresa_id_atual',
        'usuario_sistema_id_atual',
        'usuario_pode_ver_assinatura_empresa_realtime'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.assinatura);
  END LOOP;
END $secure$;
