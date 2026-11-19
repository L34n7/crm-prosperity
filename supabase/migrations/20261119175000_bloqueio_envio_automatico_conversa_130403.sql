-- Bloqueio por CONVERSA após erro permanente Meta 130403.
-- Não altera integrações, outros contatos, envios humanos nem disparos em massa.
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS envios_automaticos_bloqueados_em timestamptz,
  ADD COLUMN IF NOT EXISTS envios_automaticos_bloqueio_codigo integer,
  ADD COLUMN IF NOT EXISTS envios_automaticos_bloqueio_mensagem_id uuid;

COMMENT ON COLUMN public.conversas.envios_automaticos_bloqueados_em
  IS 'Suspensão nativa dos envios automáticos desta conversa após falha de entrega Meta 130403. Não bloqueia mensagens humanas.';
COMMENT ON COLUMN public.conversas.envios_automaticos_bloqueio_codigo
  IS 'Código Meta que originou a suspensão da automação nesta conversa.';
COMMENT ON COLUMN public.conversas.envios_automaticos_bloqueio_mensagem_id
  IS 'Mensagem que primeiro revelou o erro de entrega na conversa.';

-- Reconciliar falhas 130403 recentes já registradas antes do deploy,
-- inclusive a conversa de Jorge Avellar, sem aplicar bloqueio global.
WITH falhas AS (
  SELECT DISTINCT ON (m.empresa_id, m.conversa_id)
    m.empresa_id, m.conversa_id, m.id, m.updated_at
  FROM public.mensagens m
  WHERE m.conversa_id IS NOT NULL
    AND m.status_envio = 'falha'
    AND m.metadata_json #>> '{whatsapp_status,codigo_erro_meta}' = '130403'
    AND m.updated_at > now() - interval '7 days'
  ORDER BY m.empresa_id, m.conversa_id, m.updated_at ASC
)
UPDATE public.conversas c
SET envios_automaticos_bloqueados_em = f.updated_at,
    envios_automaticos_bloqueio_codigo = 130403,
    envios_automaticos_bloqueio_mensagem_id = f.id
FROM falhas f
WHERE c.id = f.conversa_id AND c.empresa_id = f.empresa_id
  AND c.envios_automaticos_bloqueados_em IS NULL;
