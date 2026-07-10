-- Reforca a importacao de historico do WhatsApp Coexistence.
-- - permite tipos de mensagem que o app ja sabe renderizar;
-- - marca conversas importadas como historico/somente leitura;
-- - diferencia itens ignorados de erros reais na fila;
-- - garante as chaves usadas pelos upserts do codigo.

ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS historico_importado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS historico_importado_em timestamptz,
  ADD COLUMN IF NOT EXISTS historico_request_id text;

UPDATE public.conversas
SET
  historico_importado = true,
  historico_importado_em = COALESCE(historico_importado_em, created_at)
WHERE origem_atendimento = 'historico_coexistence'
  AND historico_importado IS DISTINCT FROM true;

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS tipo_original_meta text;

UPDATE public.mensagens
SET mensagem_externa_id = NULL
WHERE mensagem_externa_id IS NOT NULL
  AND BTRIM(mensagem_externa_id) = '';

UPDATE public.mensagens
SET tipo_original_meta = metadata_json ->> 'tipo_original_whatsapp'
WHERE tipo_original_meta IS NULL
  AND metadata_json ? 'tipo_original_whatsapp';

ALTER TABLE public.mensagens
  DROP CONSTRAINT IF EXISTS mensagens_tipo_mensagem_check;

ALTER TABLE public.mensagens
  ADD CONSTRAINT mensagens_tipo_mensagem_check CHECK (
    tipo_mensagem IN (
      'audio',
      'botao',
      'imagem',
      'template',
      'texto',
      'video',
      'documento',
      'contato',
      'localizacao',
      'lista',
      'unsupported'
    )
  );

ALTER TABLE public.whatsapp_coex_sync_jobs
  ADD COLUMN IF NOT EXISTS itens_ignorados integer NOT NULL DEFAULT 0;

ALTER TABLE public.whatsapp_coex_sync_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_coex_sync_jobs_itens_check;

ALTER TABLE public.whatsapp_coex_sync_jobs
  ADD CONSTRAINT whatsapp_coex_sync_jobs_itens_check CHECK (
    itens_recebidos >= 0
    AND itens_processados >= 0
    AND itens_com_erro >= 0
    AND itens_ignorados >= 0
  );

ALTER TABLE public.whatsapp_coex_historico_itens
  DROP CONSTRAINT IF EXISTS whatsapp_coex_historico_itens_status_check;

ALTER TABLE public.whatsapp_coex_historico_itens
  ADD CONSTRAINT whatsapp_coex_historico_itens_status_check CHECK (
    status IN ('pendente', 'processando', 'processado', 'erro', 'ignorado')
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contatos
    GROUP BY empresa_id, telefone
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Nao foi possivel criar contatos_empresa_telefone_unq: existem contatos duplicados por empresa_id/telefone.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mensagens
    WHERE mensagem_externa_id IS NOT NULL
    GROUP BY mensagem_externa_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Nao foi possivel criar mensagens_externa_unq: existem mensagens duplicadas por mensagem_externa_id.';
  END IF;
END
$$;

WITH leituras_duplicadas AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversa_id, usuario_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS ordem
  FROM public.conversa_leituras
)
DELETE FROM public.conversa_leituras leitura
USING leituras_duplicadas duplicada
WHERE leitura.id = duplicada.id
  AND duplicada.ordem > 1;

CREATE UNIQUE INDEX IF NOT EXISTS contatos_empresa_telefone_unq
  ON public.contatos (empresa_id, telefone);

CREATE UNIQUE INDEX IF NOT EXISTS conversa_leituras_conversa_usuario_unq
  ON public.conversa_leituras (conversa_id, usuario_id);

CREATE UNIQUE INDEX IF NOT EXISTS mensagens_externa_unq
  ON public.mensagens (mensagem_externa_id);

NOTIFY pgrst, 'reload schema';
