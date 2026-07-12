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
  p_lista_id uuid,
  p_integracao_whatsapp_id uuid DEFAULT NULL,
  p_integracoes_whatsapp_ids uuid[] DEFAULT '{}'
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
        p_integracao_whatsapp_id IS NULL
        OR c.integracao_whatsapp_id = p_integracao_whatsapp_id
      )
      AND (
        COALESCE(array_length(p_integracoes_whatsapp_ids, 1), 0) = 0
        OR c.integracao_whatsapp_id IS NULL
        OR c.integracao_whatsapp_id = ANY(p_integracoes_whatsapp_ids)
      )
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
    uuid,
    uuid,
    uuid[]
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
    uuid,
    uuid,
    uuid[]
  )
  TO service_role;

CREATE OR REPLACE FUNCTION public.contar_conversas_nao_lidas(
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
  p_lista_id uuid DEFAULT NULL,
  p_integracao_whatsapp_id uuid DEFAULT NULL,
  p_integracoes_whatsapp_ids uuid[] DEFAULT '{}'
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
      p_integracao_whatsapp_id IS NULL
      OR c.integracao_whatsapp_id = p_integracao_whatsapp_id
    )
    AND (
      COALESCE(array_length(p_integracoes_whatsapp_ids, 1), 0) = 0
      OR c.integracao_whatsapp_id IS NULL
      OR c.integracao_whatsapp_id = ANY(p_integracoes_whatsapp_ids)
    )
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
    uuid,
    uuid,
    uuid[]
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
    uuid,
    uuid,
    uuid[]
  )
  TO service_role;
