ALTER TABLE public.contato_atribuicoes_meta
  ADD COLUMN IF NOT EXISTS rastreamento_origem_id uuid REFERENCES public.rastreamento_origens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rastreamento_campanha_id uuid REFERENCES public.rastreamento_campanhas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contato_atribuicoes_meta_rastreamento_campanha_idx
  ON public.contato_atribuicoes_meta (rastreamento_campanha_id, created_at DESC);
