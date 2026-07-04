-- Processa o histórico do WhatsApp Coexistence com backpressure.
-- O webhook apenas persiste os itens; workers pequenos fazem a importação.

ALTER TABLE public.whatsapp_coex_sync_jobs
  ADD COLUMN IF NOT EXISTS meta_concluido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS itens_recebidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itens_processados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itens_com_erro integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processamento_progresso integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worker_qstash_message_id text,
  ADD COLUMN IF NOT EXISTS worker_agendado_em timestamptz,
  ADD COLUMN IF NOT EXISTS worker_erro text;

ALTER TABLE public.whatsapp_coex_sync_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_coex_sync_jobs_itens_check,
  DROP CONSTRAINT IF EXISTS whatsapp_coex_sync_jobs_processamento_check;

ALTER TABLE public.whatsapp_coex_sync_jobs
  ADD CONSTRAINT whatsapp_coex_sync_jobs_itens_check CHECK (
    itens_recebidos >= 0
    AND itens_processados >= 0
    AND itens_com_erro >= 0
  ),
  ADD CONSTRAINT whatsapp_coex_sync_jobs_processamento_check CHECK (
    processamento_progresso >= 0
    AND processamento_progresso <= 100
  );

CREATE TABLE IF NOT EXISTS public.whatsapp_coex_historico_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  integracao_whatsapp_id uuid NOT NULL
    REFERENCES public.integracoes_whatsapp(id) ON DELETE CASCADE,
  mensagem_externa_id text NOT NULL,
  telefone_contato text NOT NULL,
  direcao text NOT NULL CHECK (direcao IN ('inbound', 'outbound')),
  fase integer,
  chunk_order integer,
  progresso_meta integer CHECK (
    progresso_meta IS NULL
    OR (progresso_meta >= 0 AND progresso_meta <= 100)
  ),
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (
    status IN ('pendente', 'processando', 'processado', 'erro')
  ),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  erro text,
  locked_at timestamptz,
  processado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integracao_whatsapp_id, mensagem_externa_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_coex_historico_fila_idx
  ON public.whatsapp_coex_historico_itens (
    integracao_whatsapp_id,
    status,
    created_at
  );

CREATE INDEX IF NOT EXISTS whatsapp_coex_historico_locks_idx
  ON public.whatsapp_coex_historico_itens (locked_at)
  WHERE status = 'processando';

ALTER TABLE public.whatsapp_coex_historico_itens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.whatsapp_coex_claim_historico_itens(
  p_integracao_id uuid,
  p_limite integer DEFAULT 50,
  p_max_tentativas integer DEFAULT 5,
  p_lock_timeout_minutos integer DEFAULT 5
)
RETURNS SETOF public.whatsapp_coex_historico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite integer := GREATEST(1, LEAST(COALESCE(p_limite, 50), 200));
  v_max_tentativas integer :=
    GREATEST(1, LEAST(COALESCE(p_max_tentativas, 5), 20));
  v_timeout integer :=
    GREATEST(1, LEAST(COALESCE(p_lock_timeout_minutos, 5), 60));
BEGIN
  UPDATE public.whatsapp_coex_historico_itens
  SET
    status = 'erro',
    erro = COALESCE(
      erro,
      'Lock de processamento expirado; item liberado para nova tentativa.'
    ),
    locked_at = NULL,
    updated_at = now()
  WHERE
    integracao_whatsapp_id = p_integracao_id
    AND status = 'processando'
    AND locked_at < now() - make_interval(mins => v_timeout);

  RETURN QUERY
  WITH candidatos AS (
    SELECT item.id
    FROM public.whatsapp_coex_historico_itens item
    WHERE
      item.integracao_whatsapp_id = p_integracao_id
      AND item.status IN ('pendente', 'erro')
      AND item.tentativas < v_max_tentativas
    ORDER BY item.created_at ASC, item.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limite
  ),
  atualizados AS (
    UPDATE public.whatsapp_coex_historico_itens item
    SET
      status = 'processando',
      tentativas = item.tentativas + 1,
      erro = NULL,
      locked_at = now(),
      updated_at = now()
    FROM candidatos
    WHERE item.id = candidatos.id
    RETURNING item.*
  )
  SELECT *
  FROM atualizados
  ORDER BY created_at ASC, id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_coex_claim_historico_itens(
  uuid,
  integer,
  integer,
  integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.whatsapp_coex_claim_historico_itens(
  uuid,
  integer,
  integer,
  integer
) TO service_role;
