-- Correção imediata: views de leads não devem contornar o RLS por conta do owner postgres.
-- service_role mantém leitura operacional; anon/authenticated não acessam essas views.
ALTER VIEW public.imovel_leads_portal_visiveis SET (security_invoker = true);
ALTER VIEW public.imovel_leads_portal_resumo SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.imovel_leads_portal_visiveis FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.imovel_leads_portal_resumo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.imovel_leads_portal_visiveis TO service_role;
GRANT SELECT ON TABLE public.imovel_leads_portal_resumo TO service_role;

-- Funções privilegiadas jamais devem ser expostas ao papel sem login.
-- Aplicar também REVOKE PUBLIC: executar REVOKE somente de anon é insuficiente
-- quando a função herda EXECUTE de PUBLIC.
DO $security$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura, p.prorettype='trigger'::regtype AS e_trigger,
           p.proname AS nome
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND has_function_privilege('anon',p.oid,'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',f.assinatura);
    -- Gatilhos executam internamente sem precisar de acesso RPC direto.
    IF f.e_trigger THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',f.assinatura);
    END IF;
  END LOOP;
END $security$;

-- Rotinas administrativas sensíveis são exclusivas do backend (service_role);
-- não devem oferecer invocação autenticada arbitrária via /rest/v1/rpc/.
DO $security$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN (
        'aplicar_pagamento_tokens_ia',
        'atomopay_reconciliar_pix_pendentes',
        'renovar_tokens_assinatura_plano',
        'sincronizar_assinatura_empresa',
        'sincronizar_empresa_tokens_ia',
        'sincronizar_automacao_agendamentos_campanha',
        'processar_lote_importacao_contatos',
        'processar_conversas_expiradas_24h',
        'recuperar_usuario_auth_faltante',
        'reivindicar_whatsapp_disparo_item',
        'reivindicar_whatsapp_disparo_itens',
        'reivindicar_whatsapp_disparo_resultados',
        'recalcular_whatsapp_disparo_campanha',
        'whatsapp_coex_claim_historico_itens',
        'reconciliar_whatsapp_coex_historico_itens',
        'registrar_uso_tokens_ia'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.assinatura);
  END LOOP;
END $security$;
