CREATE TABLE IF NOT EXISTS public.contato_atribuicoes_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  mensagem_id uuid REFERENCES public.mensagens(id) ON DELETE SET NULL,
  integracao_whatsapp_id uuid REFERENCES public.integracoes_whatsapp(id) ON DELETE SET NULL,
  mensagem_externa_id text,
  ctwa_clid text,
  source_id text,
  source_url text,
  source_type text,
  headline text,
  body text,
  media_type text,
  image_url text,
  video_url text,
  thumbnail_url text,
  conversation_origin_type text,
  pricing_type text,
  pricing_category text,
  pricing_model text,
  pricing_billable boolean,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contato_atribuicoes_meta_empresa_ctwa_unique
  ON public.contato_atribuicoes_meta (empresa_id, ctwa_clid)
  WHERE ctwa_clid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contato_atribuicoes_meta_empresa_mensagem_unique
  ON public.contato_atribuicoes_meta (empresa_id, mensagem_externa_id)
  WHERE ctwa_clid IS NULL AND mensagem_externa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contato_atribuicoes_meta_empresa_created_idx
  ON public.contato_atribuicoes_meta (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contato_atribuicoes_meta_contato_idx
  ON public.contato_atribuicoes_meta (contato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contato_atribuicoes_meta_conversa_idx
  ON public.contato_atribuicoes_meta (conversa_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.contato_atribuicoes_meta_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contato_atribuicoes_meta_updated_at ON public.contato_atribuicoes_meta;
CREATE TRIGGER contato_atribuicoes_meta_updated_at
BEFORE UPDATE ON public.contato_atribuicoes_meta
FOR EACH ROW EXECUTE FUNCTION public.contato_atribuicoes_meta_updated_at();
