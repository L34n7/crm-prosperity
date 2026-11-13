ALTER TABLE public.email_marketing_integracoes
  ADD COLUMN IF NOT EXISTS supressoes_sincronizadas_em timestamptz;
