-- Mantém security_invoker e o contrato de 33 colunas da view.
-- A projeção em colunas, em vez de um registro composto, permite ao
-- otimizador aplicar o filtro empresa_id antes do WindowAgg.
CREATE OR REPLACE VIEW public.conversas_canonicas WITH (security_invoker = true) AS
 WITH identificadas AS (
         SELECT c.*,
                CASE
                    WHEN (c.canal = 'whatsapp'::text) THEN COALESCE(integracao.phone_number_id, c.integracao_whatsapp_phone_number_id_anterior, ('integracao:'::text || (c.integracao_whatsapp_id)::text), ('conversa:'::text || (c.id)::text))
                    ELSE ('conversa:'::text || (c.id)::text)
                END AS chave_integracao_logica,
                CASE
                    WHEN (c.status = ANY (ARRAY['aberta'::text, 'bot'::text, 'fila'::text, 'em_atendimento'::text, 'aguardando_cliente'::text])) THEN 0
                    WHEN (c.origem_atendimento = 'historico_coexistence'::text) THEN 2
                    ELSE 1
                END AS prioridade_canonica
           FROM (conversas c
             LEFT JOIN integracoes_whatsapp integracao ON (((integracao.id = c.integracao_whatsapp_id) AND (integracao.empresa_id = c.empresa_id))))
        ), ranqueadas AS (
         SELECT identificadas.*,
            row_number() OVER (PARTITION BY identificadas.empresa_id, identificadas.contato_id, identificadas.canal, identificadas.chave_integracao_logica ORDER BY identificadas.prioridade_canonica, identificadas.last_message_at DESC NULLS LAST, identificadas.created_at DESC, identificadas.id DESC) AS ordem
           FROM identificadas
        )
 SELECT c.id AS id,
    c.empresa_id AS empresa_id,
    c.contato_id AS contato_id,
    c.setor_id AS setor_id,
    c.responsavel_id AS responsavel_id,
    c.integracao_whatsapp_id AS integracao_whatsapp_id,
    c.status AS status,
    c.canal AS canal,
    c.origem_atendimento AS origem_atendimento,
    c.prioridade AS prioridade,
    c.assunto AS assunto,
    c.started_at AS started_at,
    c.last_message_at AS last_message_at,
    c.closed_at AS closed_at,
    c.created_at AS created_at,
    c.updated_at AS updated_at,
    c.bot_ativo AS bot_ativo,
    c.etiqueta_cor AS etiqueta_cor,
    c.etiqueta_id AS etiqueta_id,
    c.last_inbound_message_at AS last_inbound_message_at,
    c.rastreamento_origem_id AS rastreamento_origem_id,
    c.rastreamento_campanha_id AS rastreamento_campanha_id,
    c.rastreamento_link_id AS rastreamento_link_id,
    c.rastreamento_clique_id AS rastreamento_clique_id,
    c.rastreamento_atribuido_em AS rastreamento_atribuido_em,
    c.window_expires_at AS window_expires_at,
    c.integracao_whatsapp_id_anterior AS integracao_whatsapp_id_anterior,
    c.integracao_whatsapp_phone_number_id_anterior AS integracao_whatsapp_phone_number_id_anterior,
    c.historico_importado AS historico_importado,
    c.historico_importado_em AS historico_importado_em,
    c.historico_request_id AS historico_request_id,
    c.aguardando_atendente AS aguardando_atendente,
    c.escopo_fila AS escopo_fila
   FROM ranqueadas c
  WHERE (ordem = 1);

-- Preferências locais: sem VACUUM FULL, bloqueio prolongado ou remoção de índices.
ALTER TABLE public.mensagens SET (
  autovacuum_vacuum_scale_factor = 0.08,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold = 500
);
ALTER TABLE public.fila_processamento_auto SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 200,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold = 200
);
ALTER TABLE public.whatsapp_webhook_eventos SET (
  autovacuum_vacuum_scale_factor = 0.10,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold = 1000
);
