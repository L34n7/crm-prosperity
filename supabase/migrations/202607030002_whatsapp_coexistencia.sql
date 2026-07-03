-- Permite manter o fluxo Cloud API exclusivo e adicionar o modo
-- WhatsApp Business App + Cloud API (Coexistence) na mesma estrutura.

ALTER TABLE public.integracoes_whatsapp
  ADD COLUMN IF NOT EXISTS modo_integracao text NOT NULL DEFAULT 'cloud_api',
  ADD COLUMN IF NOT EXISTS modo_integracao_escolhido_em timestamptz,
  ADD COLUMN IF NOT EXISTS coex_status text,
  ADD COLUMN IF NOT EXISTS is_on_biz_app boolean,
  ADD COLUMN IF NOT EXISTS platform_type text,
  ADD COLUMN IF NOT EXISTS coex_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS coex_sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS coex_sync_completed_at timestamptz;

UPDATE public.integracoes_whatsapp
SET modo_integracao = 'cloud_api'
WHERE modo_integracao IS NULL;

UPDATE public.integracoes_whatsapp
SET modo_integracao_escolhido_em = COALESCE(
  modo_integracao_escolhido_em,
  setup_completed_at,
  updated_at,
  created_at,
  now()
)
WHERE
  modo_integracao_escolhido_em IS NULL
  AND (
    waba_id IS NOT NULL
    OR phone_number_id IS NOT NULL
    OR onboarding_status = 'concluido'
    OR status = 'ativa'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'integracoes_whatsapp_modo_integracao_check'
  ) THEN
    ALTER TABLE public.integracoes_whatsapp
      ADD CONSTRAINT integracoes_whatsapp_modo_integracao_check
      CHECK (modo_integracao IN ('cloud_api', 'coexistence'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'integracoes_whatsapp_coex_status_check'
  ) THEN
    ALTER TABLE public.integracoes_whatsapp
      ADD CONSTRAINT integracoes_whatsapp_coex_status_check
      CHECK (
        coex_status IS NULL
        OR coex_status IN (
          'pendente',
          'onboarded',
          'sincronizando',
          'ativo',
          'erro',
          'desconectado'
        )
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.whatsapp_coex_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  integracao_whatsapp_id uuid NOT NULL
    REFERENCES public.integracoes_whatsapp(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('contacts', 'history')),
  status text NOT NULL DEFAULT 'pendente' CHECK (
    status IN (
      'pendente',
      'solicitado',
      'processando',
      'concluido',
      'recusado_usuario',
      'erro'
    )
  ),
  request_id text,
  progresso integer NOT NULL DEFAULT 0 CHECK (
    progresso >= 0 AND progresso <= 100
  ),
  fase integer,
  chunk_order integer,
  erro_codigo text,
  erro_mensagem text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  solicitado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integracao_whatsapp_id, tipo)
);

CREATE INDEX IF NOT EXISTS whatsapp_coex_sync_jobs_empresa_status_idx
  ON public.whatsapp_coex_sync_jobs (empresa_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_coex_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  integracao_whatsapp_id uuid NOT NULL
    REFERENCES public.integracoes_whatsapp(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
  telefone text NOT NULL,
  nome text,
  acao_ultima text NOT NULL DEFAULT 'add' CHECK (
    acao_ultima IN ('add', 'remove')
  ),
  removido_em timestamptz,
  meta_timestamp text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integracao_whatsapp_id, telefone)
);

CREATE INDEX IF NOT EXISTS whatsapp_coex_contatos_empresa_integracao_idx
  ON public.whatsapp_coex_contatos (
    empresa_id,
    integracao_whatsapp_id,
    updated_at DESC
  );

ALTER TABLE public.whatsapp_coex_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_coex_contatos ENABLE ROW LEVEL SECURITY;

-- O histórico importado é apenas backfill. Ele não representa uma nova
-- entrada de lead nem uma nova conversa ocorrida no momento da importação.
CREATE OR REPLACE FUNCTION public.rastreamento_evento_conversa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origem_atendimento = 'historico_coexistence' THEN
    RETURN NEW;
  END IF;

  PERFORM public.rastreamento_criar_evento(
    NEW.empresa_id,
    'conversa_iniciada',
    NEW.contato_id,
    NEW.id,
    NEW.rastreamento_origem_id,
    NEW.rastreamento_campanha_id,
    NEW.rastreamento_link_id,
    NEW.rastreamento_clique_id,
    NULL,
    NULL,
    'conversa',
    'conversa:' || NEW.id::text || ':iniciada'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rastreamento_evento_primeira_mensagem()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.metadata_json ->> 'coex_history', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.remetente_tipo = 'contato' OR NEW.origem = 'recebida' THEN
    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'primeira_mensagem_recebida',
      NULL,
      NEW.conversa_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'mensagem',
      'conversa:' || NEW.conversa_id::text || ':primeira_mensagem',
      jsonb_build_object('mensagem_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;
