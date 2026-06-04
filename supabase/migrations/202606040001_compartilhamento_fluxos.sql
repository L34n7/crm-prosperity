CREATE TABLE IF NOT EXISTS public.automacao_fluxo_compartilhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  empresa_origem_id uuid NOT NULL,
  fluxo_origem_id uuid NOT NULL,
  nome_fluxo text NOT NULL,
  snapshot_json jsonb NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  total_importacoes integer NOT NULL DEFAULT 0,
  ultimo_importado_at timestamptz NULL,
  criado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automacao_fluxo_compartilhamentos_empresa_idx
  ON public.automacao_fluxo_compartilhamentos (empresa_origem_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_fluxo_compartilhamentos_fluxo_idx
  ON public.automacao_fluxo_compartilhamentos (fluxo_origem_id, created_at DESC);

ALTER TABLE public.automacao_fluxo_compartilhamentos ENABLE ROW LEVEL SECURITY;
