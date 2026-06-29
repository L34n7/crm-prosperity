-- Otimiza a listagem de conversas, os contadores e a expiracao da janela
-- do WhatsApp. A margem operacional solicitada e de um minuto: a conversa
-- fica elegivel para encerramento 23h59 apos a ultima mensagem recebida.

ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS window_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.definir_expiracao_janela_conversa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.window_expires_at :=
    CASE
      WHEN NEW.last_inbound_message_at IS NULL THEN NULL
      ELSE NEW.last_inbound_message_at + interval '23 hours 59 minutes'
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversas_definir_expiracao_janela
  ON public.conversas;

CREATE TRIGGER conversas_definir_expiracao_janela
BEFORE INSERT OR UPDATE OF last_inbound_message_at
ON public.conversas
FOR EACH ROW
EXECUTE FUNCTION public.definir_expiracao_janela_conversa();

UPDATE public.conversas
SET window_expires_at =
  last_inbound_message_at + interval '23 hours 59 minutes'
WHERE last_inbound_message_at IS NOT NULL
  AND window_expires_at IS DISTINCT FROM
    last_inbound_message_at + interval '23 hours 59 minutes';

CREATE INDEX IF NOT EXISTS conversas_expiracao_janela_pendente_idx
  ON public.conversas (window_expires_at, id)
  WHERE status IN (
    'aberta',
    'bot',
    'fila',
    'em_atendimento',
    'aguardando_cliente'
  )
    AND window_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversas_empresa_ordenacao_lista_idx
  ON public.conversas (
    empresa_id,
    last_message_at DESC NULLS LAST,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS conversas_favoritas_empresa_usuario_conversa_idx
  ON public.conversas_favoritas (empresa_id, usuario_id, conversa_id);

CREATE INDEX IF NOT EXISTS conversas_listas_itens_empresa_lista_conversa_idx
  ON public.conversas_listas_itens (empresa_id, lista_id, conversa_id);

CREATE INDEX IF NOT EXISTS conversa_protocolos_conversa_ativo_created_idx
  ON public.conversa_protocolos (conversa_id, ativo, created_at DESC);

CREATE INDEX IF NOT EXISTS mensagens_conversa_created_idx
  ON public.mensagens (conversa_id, created_at DESC, id DESC);

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
      AND c.last_inbound_message_at IS NOT NULL
      AND c.last_inbound_message_at
        <= v_agora - interval '23 hours 59 minutes'
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
      AND c.last_inbound_message_at IS NOT NULL
      AND c.last_inbound_message_at
        <= v_agora - interval '23 hours 59 minutes'
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

CREATE OR REPLACE FUNCTION public.obter_contadores_conversas(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_is_admin boolean,
  p_setores_ids uuid[],
  p_usuario_pode_atribuir boolean,
  p_status text,
  p_prioridade text,
  p_contato_id uuid,
  p_setor_id uuid,
  p_responsavel_id uuid,
  p_busca text,
  p_canal text,
  p_lista_id uuid
)
RETURNS TABLE (
  todas bigint,
  minhas bigint,
  favoritos bigint,
  sem_responsavel bigint,
  robo bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH conversas_permitidas AS (
    SELECT
      c.id,
      c.responsavel_id,
      c.bot_ativo
    FROM public.conversas c
    WHERE c.empresa_id = p_empresa_id
      AND (
        p_is_admin
        OR (
          p_usuario_pode_atribuir
          AND c.setor_id IS NOT NULL
          AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
        )
        OR (
          NOT p_usuario_pode_atribuir
          AND (
            c.responsavel_id = p_usuario_id
            OR (
              c.setor_id IS NOT NULL
              AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
              AND c.responsavel_id IS NULL
              AND c.status = 'fila'
            )
          )
        )
      )
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_prioridade IS NULL OR c.prioridade = p_prioridade)
      AND (p_contato_id IS NULL OR c.contato_id = p_contato_id)
      AND (p_setor_id IS NULL OR c.setor_id = p_setor_id)
      AND (p_responsavel_id IS NULL OR c.responsavel_id = p_responsavel_id)
      AND (
        p_canal IS NULL
        OR p_canal = ''
        OR p_canal = 'todos'
        OR c.canal = p_canal
      )
      AND (
        p_lista_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.conversas_listas_itens cli
          WHERE cli.empresa_id = p_empresa_id
            AND cli.lista_id = p_lista_id
            AND cli.conversa_id = c.id
        )
      )
      AND (
        NULLIF(BTRIM(p_busca), '') IS NULL
        OR c.assunto ILIKE '%' || BTRIM(p_busca) || '%'
        OR c.id::text = BTRIM(p_busca)
        OR EXISTS (
          SELECT 1
          FROM public.contatos ct
          WHERE ct.id = c.contato_id
            AND ct.empresa_id = p_empresa_id
            AND (
              ct.nome ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct.telefone ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct.email ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct.empresa ILIKE '%' || BTRIM(p_busca) || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conversa_protocolos cp
          WHERE cp.empresa_id = p_empresa_id
            AND cp.conversa_id = c.id
            AND cp.protocolo ILIKE '%' || BTRIM(p_busca) || '%'
        )
      )
  )
  SELECT
    COUNT(*)::bigint AS todas,
    COUNT(*) FILTER (
      WHERE cp.responsavel_id = p_usuario_id
    )::bigint AS minhas,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.conversas_favoritas cf
        WHERE cf.empresa_id = p_empresa_id
          AND cf.usuario_id = p_usuario_id
          AND cf.conversa_id = cp.id
      )
    )::bigint AS favoritos,
    COUNT(*) FILTER (
      WHERE cp.responsavel_id IS NULL
        AND cp.bot_ativo = false
    )::bigint AS sem_responsavel,
    COUNT(*) FILTER (
      WHERE cp.bot_ativo = true
    )::bigint AS robo
  FROM conversas_permitidas cp;
$$;

REVOKE ALL
  ON FUNCTION public.obter_contadores_conversas(
    uuid,
    uuid,
    boolean,
    uuid[],
    boolean,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    text,
    uuid
  )
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.obter_contadores_conversas(
    uuid,
    uuid,
    boolean,
    uuid[],
    boolean,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    text,
    uuid
  )
  TO service_role;

DROP FUNCTION IF EXISTS public.contar_conversas_nao_lidas(
  uuid,
  uuid,
  boolean,
  uuid[],
  boolean
);

CREATE FUNCTION public.contar_conversas_nao_lidas(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_is_admin boolean,
  p_setores_ids uuid[] DEFAULT '{}',
  p_usuario_pode_atribuir boolean DEFAULT false,
  p_status text DEFAULT NULL,
  p_prioridade text DEFAULT NULL,
  p_contato_id uuid DEFAULT NULL,
  p_setor_id uuid DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_lista_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::integer
  FROM public.conversas c
  LEFT JOIN public.conversa_leituras cl
    ON cl.empresa_id = c.empresa_id
   AND cl.conversa_id = c.id
   AND cl.usuario_id = p_usuario_id
  WHERE c.empresa_id = p_empresa_id
    AND (
      p_is_admin
      OR (
        p_usuario_pode_atribuir
        AND c.setor_id IS NOT NULL
        AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
      )
      OR (
        NOT p_usuario_pode_atribuir
        AND (
          c.responsavel_id = p_usuario_id
          OR (
            c.setor_id IS NOT NULL
            AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
            AND c.responsavel_id IS NULL
            AND c.status = 'fila'
          )
        )
      )
    )
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_prioridade IS NULL OR c.prioridade = p_prioridade)
    AND (p_contato_id IS NULL OR c.contato_id = p_contato_id)
    AND (p_setor_id IS NULL OR c.setor_id = p_setor_id)
    AND (p_responsavel_id IS NULL OR c.responsavel_id = p_responsavel_id)
    AND (
      p_canal IS NULL
      OR p_canal = ''
      OR p_canal = 'todos'
      OR c.canal = p_canal
    )
    AND (
      p_lista_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.conversas_listas_itens cli
        WHERE cli.empresa_id = p_empresa_id
          AND cli.lista_id = p_lista_id
          AND cli.conversa_id = c.id
      )
    )
    AND (
      NULLIF(BTRIM(p_busca), '') IS NULL
      OR c.assunto ILIKE '%' || BTRIM(p_busca) || '%'
      OR c.id::text = BTRIM(p_busca)
      OR EXISTS (
        SELECT 1
        FROM public.contatos ct
        WHERE ct.id = c.contato_id
          AND ct.empresa_id = p_empresa_id
          AND (
            ct.nome ILIKE '%' || BTRIM(p_busca) || '%'
            OR ct.telefone ILIKE '%' || BTRIM(p_busca) || '%'
            OR ct.email ILIKE '%' || BTRIM(p_busca) || '%'
            OR ct.empresa ILIKE '%' || BTRIM(p_busca) || '%'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.conversa_protocolos cp
        WHERE cp.empresa_id = p_empresa_id
          AND cp.conversa_id = c.id
          AND cp.protocolo ILIKE '%' || BTRIM(p_busca) || '%'
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.mensagens m
      WHERE m.empresa_id = p_empresa_id
        AND m.conversa_id = c.id
        AND (m.origem = 'recebida' OR m.remetente_tipo = 'contato')
        AND (
          cl.ultima_mensagem_lida_at IS NULL
          OR m.created_at > cl.ultima_mensagem_lida_at
        )
      LIMIT 1
    );
$$;

REVOKE ALL
  ON FUNCTION public.contar_conversas_nao_lidas(
    uuid,
    uuid,
    boolean,
    uuid[],
    boolean,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    text,
    uuid
  )
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.contar_conversas_nao_lidas(
    uuid,
    uuid,
    boolean,
    uuid[],
    boolean,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    text,
    uuid
  )
  TO service_role;

CREATE OR REPLACE FUNCTION public.listar_conversas_resumo(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_is_admin boolean,
  p_setores_ids uuid[],
  p_usuario_pode_atribuir boolean,
  p_status text,
  p_prioridade text,
  p_contato_id uuid,
  p_setor_id uuid,
  p_responsavel_id uuid,
  p_busca text,
  p_canal text,
  p_chip text,
  p_lista_id uuid,
  p_cursor_last_message_at timestamptz,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limite integer
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH pagina AS (
    SELECT c.*
    FROM public.conversas c
    LEFT JOIN public.conversa_leituras cl
      ON cl.empresa_id = c.empresa_id
     AND cl.conversa_id = c.id
     AND cl.usuario_id = p_usuario_id
    WHERE c.empresa_id = p_empresa_id
      AND (
        p_is_admin
        OR (
          p_usuario_pode_atribuir
          AND c.setor_id IS NOT NULL
          AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
        )
        OR (
          NOT p_usuario_pode_atribuir
          AND (
            c.responsavel_id = p_usuario_id
            OR (
              c.setor_id IS NOT NULL
              AND c.setor_id = ANY(COALESCE(p_setores_ids, '{}'::uuid[]))
              AND c.responsavel_id IS NULL
              AND c.status = 'fila'
            )
          )
        )
      )
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_prioridade IS NULL OR c.prioridade = p_prioridade)
      AND (p_contato_id IS NULL OR c.contato_id = p_contato_id)
      AND (p_setor_id IS NULL OR c.setor_id = p_setor_id)
      AND (p_responsavel_id IS NULL OR c.responsavel_id = p_responsavel_id)
      AND (
        p_canal IS NULL
        OR p_canal = ''
        OR p_canal = 'todos'
        OR c.canal = p_canal
      )
      AND (
        p_lista_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.conversas_listas_itens cli
          WHERE cli.empresa_id = p_empresa_id
            AND cli.lista_id = p_lista_id
            AND cli.conversa_id = c.id
        )
      )
      AND (
        NULLIF(BTRIM(p_busca), '') IS NULL
        OR c.assunto ILIKE '%' || BTRIM(p_busca) || '%'
        OR c.id::text = BTRIM(p_busca)
        OR EXISTS (
          SELECT 1
          FROM public.contatos ct_busca
          WHERE ct_busca.id = c.contato_id
            AND ct_busca.empresa_id = p_empresa_id
            AND (
              ct_busca.nome ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct_busca.telefone ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct_busca.email ILIKE '%' || BTRIM(p_busca) || '%'
              OR ct_busca.empresa ILIKE '%' || BTRIM(p_busca) || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conversa_protocolos cp_busca
          WHERE cp_busca.empresa_id = p_empresa_id
            AND cp_busca.conversa_id = c.id
            AND cp_busca.protocolo ILIKE '%' || BTRIM(p_busca) || '%'
        )
      )
      AND (
        NULLIF(BTRIM(p_chip), '') IS NULL
        OR p_chip = 'Todas'
        OR (p_chip = 'fila' AND c.responsavel_id IS NULL)
        OR (p_chip = 'robo' AND c.bot_ativo = true)
        OR (
          p_chip = 'sem_responsavel'
          AND c.responsavel_id IS NULL
          AND c.bot_ativo = false
        )
        OR (
          p_chip = 'urgentes'
          AND c.prioridade IN ('alta', 'urgente')
        )
        OR (p_chip = 'minhas' AND c.responsavel_id = p_usuario_id)
        OR (
          p_chip = 'favoritos'
          AND EXISTS (
            SELECT 1
            FROM public.conversas_favoritas cf_filtro
            WHERE cf_filtro.empresa_id = p_empresa_id
              AND cf_filtro.usuario_id = p_usuario_id
              AND cf_filtro.conversa_id = c.id
          )
        )
        OR (
          p_chip = 'nao_lidas'
          AND EXISTS (
            SELECT 1
            FROM public.mensagens m_nao_lida
            WHERE m_nao_lida.empresa_id = p_empresa_id
              AND m_nao_lida.conversa_id = c.id
              AND (
                m_nao_lida.origem = 'recebida'
                OR m_nao_lida.remetente_tipo = 'contato'
              )
              AND (
                cl.ultima_mensagem_lida_at IS NULL
                OR m_nao_lida.created_at > cl.ultima_mensagem_lida_at
              )
            LIMIT 1
          )
        )
      )
      AND (
        p_cursor_id IS NULL
        OR ROW(
          COALESCE(c.last_message_at, '-infinity'::timestamptz),
          c.created_at,
          c.id
        ) < ROW(
          COALESCE(
            p_cursor_last_message_at,
            '-infinity'::timestamptz
          ),
          p_cursor_created_at,
          p_cursor_id
        )
      )
    ORDER BY
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC,
      c.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 21), 1), 101)
  )
  SELECT jsonb_build_object(
    'id', c.id,
    'assunto', c.assunto,
    'status', c.status,
    'bot_ativo', c.bot_ativo,
    'prioridade', c.prioridade,
    'canal', c.canal,
    'origem_atendimento', c.origem_atendimento,
    'integracao_whatsapp_id', c.integracao_whatsapp_id,
    'last_message_at', c.last_message_at,
    'started_at', c.started_at,
    'created_at', c.created_at,
    'setor_id', c.setor_id,
    'responsavel_id', c.responsavel_id,
    'etiqueta_id', c.etiqueta_id,
    'etiqueta_cor', c.etiqueta_cor,
    'favorita', EXISTS (
      SELECT 1
      FROM public.conversas_favoritas cf
      WHERE cf.empresa_id = p_empresa_id
        AND cf.usuario_id = p_usuario_id
        AND cf.conversa_id = c.id
    ),
    'protocolo', protocolo.protocolo,
    'ultima_mensagem', COALESCE(
      NULLIF(BTRIM(ultima_mensagem.conteudo), ''),
      NULLIF(BTRIM(ultima_mensagem.metadata_json->>'caption'), ''),
      CASE ultima_mensagem.tipo_mensagem
        WHEN 'imagem' THEN 'Imagem'
        WHEN 'audio' THEN 'Áudio'
        WHEN 'video' THEN 'Vídeo'
        WHEN 'documento' THEN COALESCE(
          NULLIF(BTRIM(ultima_mensagem.metadata_json->>'filename'), ''),
          'Documento'
        )
        WHEN 'contato' THEN 'Contato compartilhado'
        WHEN 'localizacao' THEN 'Localização'
        WHEN 'template' THEN 'Template enviado'
        WHEN 'botao' THEN 'Resposta por botão'
        WHEN 'lista' THEN 'Resposta por lista'
        WHEN 'unsupported' THEN 'Mensagem não suportada'
        ELSE CASE
          WHEN ultima_mensagem.id IS NULL THEN NULL
          ELSE 'Mensagem'
        END
      END
    ),
    'unread_count', COALESCE(nao_lidas.quantidade, 0),
    'listas', COALESCE(listas.itens, '[]'::jsonb),
    'tem_disparo_agendado_pendente', disparo.id IS NOT NULL,
    'disparo_agendado_pendente', CASE
      WHEN disparo.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', disparo.id,
        'executar_em', disparo.executar_em,
        'template_nome', disparo.payload_json->>'template_nome'
      )
    END,
    'contatos', CASE
      WHEN contato.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', contato.id,
        'nome', contato.nome,
        'whatsapp_profile_name', contato.whatsapp_profile_name,
        'telefone', contato.telefone,
        'email', contato.email,
        'origem', contato.origem,
        'status_lead', contato.status_lead,
        'empresa', contato.empresa,
        'observacoes', contato.observacoes,
        'campanha', contato.campanha,
        'rastreamento_campanha_id', contato.rastreamento_campanha_id,
        'rastreamento_campanhas', CASE
          WHEN campanha.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', campanha.id,
            'nome', campanha.nome,
            'status', campanha.status,
            'rastreamento_origens', CASE
              WHEN origem.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', origem.id,
                'nome', origem.nome
              )
            END
          )
        END
      )
    END,
    'setores', CASE
      WHEN setor.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', setor.id, 'nome', setor.nome)
    END,
    'responsavel', CASE
      WHEN responsavel.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', responsavel.id,
        'nome', responsavel.nome
      )
    END,
    'etiquetas', CASE
      WHEN etiqueta.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', etiqueta.id,
        'nome', etiqueta.nome,
        'descricao', etiqueta.descricao,
        'cor', etiqueta.cor
      )
    END
  )
  FROM pagina c
  LEFT JOIN public.contatos contato
    ON contato.id = c.contato_id
  LEFT JOIN public.setores setor
    ON setor.id = c.setor_id
  LEFT JOIN public.usuarios responsavel
    ON responsavel.id = c.responsavel_id
  LEFT JOIN public.etiquetas etiqueta
    ON etiqueta.id = c.etiqueta_id
  LEFT JOIN public.rastreamento_campanhas campanha
    ON campanha.id = contato.rastreamento_campanha_id
  LEFT JOIN public.rastreamento_origens origem
    ON origem.id = campanha.origem_id
  LEFT JOIN LATERAL (
    SELECT cp.protocolo
    FROM public.conversa_protocolos cp
    WHERE cp.empresa_id = p_empresa_id
      AND cp.conversa_id = c.id
      AND cp.ativo = true
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT 1
  ) protocolo ON true
  LEFT JOIN LATERAL (
    SELECT
      m.id,
      m.conteudo,
      m.tipo_mensagem,
      m.metadata_json
    FROM public.mensagens m
    WHERE m.empresa_id = p_empresa_id
      AND m.conversa_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) ultima_mensagem ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS quantidade
    FROM public.mensagens m
    LEFT JOIN public.conversa_leituras cl
      ON cl.empresa_id = p_empresa_id
     AND cl.conversa_id = c.id
     AND cl.usuario_id = p_usuario_id
    WHERE m.empresa_id = p_empresa_id
      AND m.conversa_id = c.id
      AND (m.origem = 'recebida' OR m.remetente_tipo = 'contato')
      AND (
        cl.ultima_mensagem_lida_at IS NULL
        OR m.created_at > cl.ultima_mensagem_lida_at
      )
  ) nao_lidas ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('id', lista.id, 'nome', lista.nome)
      ORDER BY lista.nome, lista.id
    ) AS itens
    FROM public.conversas_listas_itens cli
    JOIN public.conversas_listas lista
      ON lista.id = cli.lista_id
    WHERE cli.empresa_id = p_empresa_id
      AND cli.conversa_id = c.id
  ) listas ON true
  LEFT JOIN LATERAL (
    SELECT
      aa.id,
      aa.executar_em,
      aa.payload_json
    FROM public.automacao_agendamentos aa
    WHERE aa.empresa_id = p_empresa_id
      AND aa.tipo_agendamento = 'disparo_template'
      AND aa.status = 'pendente'
      AND aa.payload_json->>'conversa_id' = c.id::text
    ORDER BY aa.executar_em, aa.id
    LIMIT 1
  ) disparo ON true
  ORDER BY
    c.last_message_at DESC NULLS LAST,
    c.created_at DESC,
    c.id DESC;
$$;

REVOKE ALL
  ON FUNCTION public.listar_conversas_resumo(
    uuid,
    uuid,
    boolean,
    uuid[],
    boolean,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    integer
  )
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.listar_conversas_resumo(
    uuid,
    uuid,
    boolean,
    uuid[],
    boolean,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    integer
  )
  TO service_role;
