-- Evita reconciliações paralelas da mesma campanha e UPDATEs redundantes.
-- A RPC continua service_role-only (migração de segurança anterior).
CREATE OR REPLACE FUNCTION public.sincronizar_automacao_agendamentos_campanha(p_campanha_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_atualizados integer := 0;
BEGIN
  IF p_campanha_id IS NULL THEN RETURN 0; END IF;

  -- Uma única reconciliação por campanha ao mesmo tempo. Webhooks posteriores
  -- continuam agendados no QStash para capturar as alterações mais recentes.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('agendamentos-campanha:' || p_campanha_id::text, 0)) THEN
    RETURN 0;
  END IF;

  UPDATE public.automacao_agendamentos a
  SET
    status = CASE
      WHEN i.status = 'enviado' THEN 'executado'
      WHEN i.status = 'falha' THEN 'erro'
      WHEN i.status = 'cancelado' THEN 'cancelado'
      WHEN c.status NOT IN ('pendente', 'enviando') THEN 'cancelado'
      ELSE 'executando'
    END,
    executed_at = CASE
      WHEN i.status IN ('enviado', 'falha', 'cancelado')
        OR c.status NOT IN ('pendente', 'enviando')
      THEN COALESCE(i.processed_at, now())
      ELSE NULL
    END,
    campanha_disparo_id = i.campanha_id,
    item_disparo_id = i.id,
    payload_json = COALESCE(a.payload_json, '{}'::jsonb)
      || jsonb_build_object(
        'processamento_modelo', 'fila_qstash',
        'campanha_disparo_id', i.campanha_id,
        'item_disparo_id', i.id,
        'resultado_envio', jsonb_strip_nulls(
          jsonb_build_object(
            'message_id', i.message_id,
            'conversa_id', i.conversa_id,
            'protocolo_id', i.conversa_protocolo_id,
            'template_nome', c.template_nome,
            'numero_destino', i.numero,
            'variaveis', i.variaveis,
            'status_item', i.status,
            'status_http', i.status_http
          )
        ),
        'erro_execucao', CASE
          WHEN i.status IN ('falha', 'cancelado')
            OR c.status NOT IN ('pendente', 'enviando')
          THEN COALESCE(i.erro, c.pausa_motivo, c.erro)
          ELSE NULL
        END
      )
  FROM public.whatsapp_disparo_itens i
  JOIN public.whatsapp_disparo_campanhas c
    ON c.id = i.campanha_id
  WHERE i.campanha_id = p_campanha_id
    AND i.automacao_agendamento_id = a.id
    AND (
      a.status IS DISTINCT FROM CASE
        WHEN i.status = 'enviado' THEN 'executado'
        WHEN i.status = 'falha' THEN 'erro'
        WHEN i.status = 'cancelado' THEN 'cancelado'
        WHEN c.status NOT IN ('pendente', 'enviando') THEN 'cancelado'
        ELSE 'executando'
      END
      OR a.executed_at IS DISTINCT FROM CASE
        WHEN i.status IN ('enviado','falha','cancelado')
          OR c.status NOT IN ('pendente','enviando')
        -- Evita modificar executed_at sempre que processed_at está vazio.
        THEN COALESCE(i.processed_at, a.executed_at)
        ELSE NULL
      END
      OR a.campanha_disparo_id IS DISTINCT FROM i.campanha_id
      OR a.item_disparo_id IS DISTINCT FROM i.id
      OR a.payload_json->>'processamento_modelo' IS DISTINCT FROM 'fila_qstash'
      OR a.payload_json->'resultado_envio' IS DISTINCT FROM jsonb_strip_nulls(
        jsonb_build_object(
          'message_id', i.message_id,
          'conversa_id', i.conversa_id,
          'protocolo_id', i.conversa_protocolo_id,
          'template_nome', c.template_nome,
          'numero_destino', i.numero,
          'variaveis', i.variaveis,
          'status_item', i.status,
          'status_http', i.status_http
        )
      )
      OR a.payload_json->>'erro_execucao' IS DISTINCT FROM CASE
        WHEN i.status IN ('falha','cancelado')
          OR c.status NOT IN ('pendente','enviando')
        THEN COALESCE(i.erro, c.pausa_motivo, c.erro)
        ELSE NULL
      END
    );

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN v_atualizados;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_automacao_agendamentos_campanha(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_automacao_agendamentos_campanha(uuid)
  TO service_role;
