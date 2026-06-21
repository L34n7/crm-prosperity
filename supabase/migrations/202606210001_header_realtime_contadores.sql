CREATE OR REPLACE FUNCTION public.usuario_sistema_id_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.usuarios
  WHERE auth_user_id = auth.uid()
    AND status = 'ativo'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.usuario_empresa_id_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id
  FROM public.usuarios
  WHERE auth_user_id = auth.uid()
    AND status = 'ativo'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.usuario_sistema_id_atual() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usuario_empresa_id_atual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_sistema_id_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_empresa_id_atual() TO authenticated;

ALTER TABLE public.automacao_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversa_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS header_realtime_automacao_agendamentos_select
  ON public.automacao_agendamentos;

CREATE POLICY header_realtime_automacao_agendamentos_select
  ON public.automacao_agendamentos
  FOR SELECT
  TO authenticated
  USING (empresa_id = public.usuario_empresa_id_atual());

DROP POLICY IF EXISTS header_realtime_conversa_leituras_select
  ON public.conversa_leituras;

CREATE POLICY header_realtime_conversa_leituras_select
  ON public.conversa_leituras
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.usuario_empresa_id_atual()
    AND usuario_id = public.usuario_sistema_id_atual()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'automacao_agendamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.automacao_agendamentos;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversa_leituras'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.conversa_leituras;
  END IF;
END $$;
