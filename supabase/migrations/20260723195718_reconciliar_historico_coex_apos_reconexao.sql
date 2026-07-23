-- Quando um número é desconectado, as conversas preservadas ficam com
-- integracao_whatsapp_id = NULL e guardam o phone_number_id anterior.
-- Ao reconectar o mesmo número, o histórico Coex pode reenviar os mesmos
-- wamid. A deduplicação global encontra a mensagem antiga e não a insere na
-- nova conversa histórica, deixando a conversa nova aparentemente apenas com
-- mensagens enviadas. Esta rotina religa essas mensagens à conversa histórica
-- da integração atual, sem duplicar o wamid.

CREATE OR REPLACE FUNCTION public.reconciliar_whatsapp_coex_historico_itens(
  p_item_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_movidas integer := 0;
BEGIN
  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- Ajusta os limites da conversa de destino antes de mover as mensagens.
  WITH candidatos AS (
    SELECT DISTINCT ON (mensagem.id)
      mensagem.id AS mensagem_id,
      mensagem.conversa_id AS conversa_origem_id,
      mensagem.created_at AS mensagem_em,
      conversa_destino.id AS conversa_destino_id
    FROM public.whatsapp_coex_historico_itens item
    JOIN public.integracoes_whatsapp integracao
      ON integracao.id = item.integracao_whatsapp_id
     AND integracao.empresa_id = item.empresa_id
    JOIN public.contatos contato
      ON contato.empresa_id = item.empresa_id
     AND contato.telefone = public.normalizar_telefone_whatsapp(
       item.telefone_contato
     )
    JOIN public.mensagens mensagem
      ON mensagem.empresa_id = item.empresa_id
     AND mensagem.mensagem_externa_id = item.mensagem_externa_id
    JOIN public.conversas conversa_origem
      ON conversa_origem.id = mensagem.conversa_id
    JOIN LATERAL (
      SELECT conversa.id
      FROM public.conversas conversa
      WHERE conversa.empresa_id = item.empresa_id
        AND conversa.contato_id = contato.id
        AND conversa.integracao_whatsapp_id = item.integracao_whatsapp_id
        AND conversa.canal = 'whatsapp'
        AND conversa.origem_atendimento = 'historico_coexistence'
      ORDER BY conversa.created_at DESC, conversa.id DESC
      LIMIT 1
    ) conversa_destino ON true
    WHERE item.id = ANY(p_item_ids)
      AND item.status = 'processado'
      AND mensagem.conversa_id IS DISTINCT FROM conversa_destino.id
      AND conversa_origem.integracao_whatsapp_id IS NULL
      AND conversa_origem.integracao_whatsapp_phone_number_id_anterior =
        integracao.phone_number_id
    ORDER BY mensagem.id, conversa_destino.id
  ), limites AS (
    SELECT
      conversa_destino_id,
      min(mensagem_em) AS primeira_mensagem,
      max(mensagem_em) AS ultima_mensagem
    FROM candidatos
    GROUP BY conversa_destino_id
  )
  UPDATE public.conversas conversa
  SET
    started_at = least(conversa.started_at, limites.primeira_mensagem),
    last_message_at = CASE
      WHEN conversa.last_message_at IS NULL THEN limites.ultima_mensagem
      ELSE greatest(conversa.last_message_at, limites.ultima_mensagem)
    END,
    closed_at = CASE
      WHEN conversa.closed_at IS NULL THEN limites.ultima_mensagem
      ELSE greatest(conversa.closed_at, limites.ultima_mensagem)
    END,
    historico_importado = true,
    historico_importado_em = coalesce(
      conversa.historico_importado_em,
      now()
    ),
    updated_at = now()
  FROM limites
  WHERE conversa.id = limites.conversa_destino_id;

  WITH candidatos AS (
    SELECT DISTINCT ON (mensagem.id)
      mensagem.id AS mensagem_id,
      mensagem.conversa_id AS conversa_origem_id,
      conversa_destino.id AS conversa_destino_id,
      protocolo_destino.id AS protocolo_destino_id,
      item.integracao_whatsapp_id
    FROM public.whatsapp_coex_historico_itens item
    JOIN public.integracoes_whatsapp integracao
      ON integracao.id = item.integracao_whatsapp_id
     AND integracao.empresa_id = item.empresa_id
    JOIN public.contatos contato
      ON contato.empresa_id = item.empresa_id
     AND contato.telefone = public.normalizar_telefone_whatsapp(
       item.telefone_contato
     )
    JOIN public.mensagens mensagem
      ON mensagem.empresa_id = item.empresa_id
     AND mensagem.mensagem_externa_id = item.mensagem_externa_id
    JOIN public.conversas conversa_origem
      ON conversa_origem.id = mensagem.conversa_id
    JOIN LATERAL (
      SELECT conversa.id
      FROM public.conversas conversa
      WHERE conversa.empresa_id = item.empresa_id
        AND conversa.contato_id = contato.id
        AND conversa.integracao_whatsapp_id = item.integracao_whatsapp_id
        AND conversa.canal = 'whatsapp'
        AND conversa.origem_atendimento = 'historico_coexistence'
      ORDER BY conversa.created_at DESC, conversa.id DESC
      LIMIT 1
    ) conversa_destino ON true
    LEFT JOIN LATERAL (
      SELECT protocolo.id
      FROM public.conversa_protocolos protocolo
      WHERE protocolo.conversa_id = conversa_destino.id
        AND protocolo.ativo = true
      ORDER BY protocolo.created_at DESC, protocolo.id DESC
      LIMIT 1
    ) protocolo_destino ON true
    WHERE item.id = ANY(p_item_ids)
      AND item.status = 'processado'
      AND mensagem.conversa_id IS DISTINCT FROM conversa_destino.id
      AND conversa_origem.integracao_whatsapp_id IS NULL
      AND conversa_origem.integracao_whatsapp_phone_number_id_anterior =
        integracao.phone_number_id
    ORDER BY mensagem.id, conversa_destino.id
  )
  UPDATE public.mensagens mensagem
  SET
    conversa_id = candidatos.conversa_destino_id,
    conversa_protocolo_id = candidatos.protocolo_destino_id,
    metadata_json = coalesce(mensagem.metadata_json, '{}'::jsonb)
      || jsonb_build_object(
        'coex_relinked_after_reconnect', true,
        'coex_previous_conversation_id',
          candidatos.conversa_origem_id::text,
        'coex_relinked_integration_id',
          candidatos.integracao_whatsapp_id::text,
        'coex_relinked_at', now()
      ),
    updated_at = now()
  FROM candidatos
  WHERE mensagem.id = candidatos.mensagem_id;

  GET DIAGNOSTICS v_movidas = ROW_COUNT;
  RETURN v_movidas;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconciliar_whatsapp_coex_historico_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_ids uuid[];
BEGIN
  SELECT array_agg(novo.id)
  INTO v_item_ids
  FROM novos_itens novo
  JOIN antigos_itens antigo ON antigo.id = novo.id
  WHERE novo.status = 'processado'
    AND antigo.status IS DISTINCT FROM novo.status;

  IF v_item_ids IS NOT NULL AND cardinality(v_item_ids) > 0 THEN
    PERFORM public.reconciliar_whatsapp_coex_historico_itens(v_item_ids);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_coex_reconciliar_historico_trigger
  ON public.whatsapp_coex_historico_itens;

CREATE TRIGGER whatsapp_coex_reconciliar_historico_trigger
AFTER UPDATE ON public.whatsapp_coex_historico_itens
REFERENCING OLD TABLE AS antigos_itens NEW TABLE AS novos_itens
FOR EACH STATEMENT
EXECUTE FUNCTION public.reconciliar_whatsapp_coex_historico_trigger();

COMMENT ON FUNCTION public.reconciliar_whatsapp_coex_historico_itens(uuid[]) IS
  'Religa mensagens históricas já existentes à conversa Coex da integração reconectada, sem duplicar wamid.';
