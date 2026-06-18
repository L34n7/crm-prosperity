CREATE INDEX IF NOT EXISTS mensagens_empresa_conversa_recebida_created_idx
ON public.mensagens (empresa_id, conversa_id, created_at DESC)
WHERE origem = 'recebida' OR remetente_tipo = 'contato';

CREATE INDEX IF NOT EXISTS conversa_leituras_empresa_usuario_conversa_idx
ON public.conversa_leituras (empresa_id, usuario_id, conversa_id);

CREATE INDEX IF NOT EXISTS conversas_empresa_responsavel_idx
ON public.conversas (empresa_id, responsavel_id);

CREATE INDEX IF NOT EXISTS conversas_empresa_setor_status_idx
ON public.conversas (empresa_id, setor_id, status);

CREATE OR REPLACE FUNCTION public.contar_conversas_nao_lidas(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_is_admin boolean,
  p_setores_ids uuid[] DEFAULT '{}',
  p_usuario_pode_atribuir boolean DEFAULT false
)
RETURNS integer
LANGUAGE sql
STABLE
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
        AND c.setor_id = ANY(p_setores_ids)
      )
      OR (
        NOT p_usuario_pode_atribuir
        AND (
          c.responsavel_id = p_usuario_id
          OR (
            c.setor_id IS NOT NULL
            AND c.setor_id = ANY(p_setores_ids)
            AND c.responsavel_id IS NULL
            AND c.status = 'fila'
          )
        )
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
