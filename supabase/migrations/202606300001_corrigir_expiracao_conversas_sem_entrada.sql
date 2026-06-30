-- Conversas iniciadas manualmente ou por template podem nao ter uma mensagem
-- recebida. Nesses casos, a tela bloqueia mensagem livre, mas a expiracao
-- anterior nao criava window_expires_at e o status permanecia aberto.
--
-- Regra:
-- 1. Se houve mensagem recebida, somente ela define a janela.
-- 2. Se nunca houve mensagem recebida, usa a ultima mensagem da conversa.
-- 3. Sem mensagens, usa o inicio/criacao da conversa.
-- Mensagens enviadas nao prolongam uma janela que ja foi aberta pelo contato.

CREATE OR REPLACE FUNCTION public.definir_expiracao_janela_conversa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_base timestamptz;
BEGIN
  v_data_base := COALESCE(
    NEW.last_inbound_message_at,
    NEW.last_message_at,
    NEW.started_at,
    NEW.created_at
  );

  NEW.window_expires_at :=
    CASE
      WHEN v_data_base IS NULL THEN NULL
      ELSE v_data_base + interval '23 hours 59 minutes'
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversas_definir_expiracao_janela
  ON public.conversas;

CREATE TRIGGER conversas_definir_expiracao_janela
BEFORE INSERT OR UPDATE OF
  last_inbound_message_at,
  last_message_at,
  started_at
ON public.conversas
FOR EACH ROW
EXECUTE FUNCTION public.definir_expiracao_janela_conversa();

UPDATE public.conversas c
SET window_expires_at =
  COALESCE(
    c.last_inbound_message_at,
    c.last_message_at,
    c.started_at,
    c.created_at
  ) + interval '23 hours 59 minutes'
WHERE COALESCE(
    c.last_inbound_message_at,
    c.last_message_at,
    c.started_at,
    c.created_at
  ) IS NOT NULL
  AND c.window_expires_at IS DISTINCT FROM
    COALESCE(
      c.last_inbound_message_at,
      c.last_message_at,
      c.started_at,
      c.created_at
    ) + interval '23 hours 59 minutes';

CREATE OR REPLACE FUNCTION public.processar_conversas_expiradas_24h(
  p_limite integer DEFAULT 500
)
RETURNS TABLE (
  conversa_id uuid,
  empresa_id uuid,
  encerrada_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversa record;
  v_agora timestamptz := clock_timestamp();
  v_conversa_atualizada uuid;
BEGIN
  FOR v_conversa IN
    SELECT
      c.id,
      c.empresa_id
    FROM public.conversas c
    WHERE c.status IN (
      'aberta',
      'bot',
      'fila',
      'em_atendimento',
      'aguardando_cliente'
    )
      AND c.window_expires_at IS NOT NULL
      AND c.window_expires_at <= v_agora
    ORDER BY c.window_expires_at, c.id
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 500), 1), 1000)
    FOR UPDATE OF c SKIP LOCKED
  LOOP
    v_conversa_atualizada := NULL;

    UPDATE public.conversas c
    SET
      status = 'encerrado_24h',
      bot_ativo = false,
      closed_at = v_agora,
      updated_at = v_agora
    WHERE c.id = v_conversa.id
      AND c.empresa_id = v_conversa.empresa_id
      AND c.status IN (
        'aberta',
        'bot',
        'fila',
        'em_atendimento',
        'aguardando_cliente'
      )
      AND c.window_expires_at IS NOT NULL
      AND c.window_expires_at <= v_agora
    RETURNING c.id INTO v_conversa_atualizada;

    IF v_conversa_atualizada IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.conversa_protocolos cp
    SET
      ativo = false,
      closed_at = v_agora,
      updated_at = v_agora
    WHERE cp.empresa_id = v_conversa.empresa_id
      AND cp.conversa_id = v_conversa.id
      AND cp.ativo = true;

    UPDATE public.automacao_execucoes ae
    SET
      status = 'cancelado',
      finished_at = v_agora,
      updated_at = v_agora,
      metadata_json =
        COALESCE(ae.metadata_json, '{}'::jsonb)
        || jsonb_build_object(
          'motivo_cancelamento',
          'janela_24h_expirada'
        )
    WHERE ae.empresa_id = v_conversa.empresa_id
      AND ae.conversa_id = v_conversa.id
      AND ae.status IN ('rodando', 'aguardando', 'pausado');

    INSERT INTO public.mensagens (
      empresa_id,
      conversa_id,
      remetente_tipo,
      conteudo,
      tipo_mensagem,
      origem,
      status_envio,
      created_at,
      updated_at
    )
    VALUES (
      v_conversa.empresa_id,
      v_conversa.id,
      'sistema',
      'Conversa encerrada automaticamente porque a janela de 24 horas do WhatsApp expirou sem nova resposta do cliente.',
      'texto',
      'automatica',
      'lida',
      v_agora,
      v_agora
    );

    conversa_id := v_conversa.id;
    empresa_id := v_conversa.empresa_id;
    encerrada_em := v_agora;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL
  ON FUNCTION public.processar_conversas_expiradas_24h(integer)
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.processar_conversas_expiradas_24h(integer)
  TO service_role;
