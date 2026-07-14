-- Preserva a validacao e o upsert atomicos existentes e acrescenta a limpeza
-- definitiva dos blocos e conexoes que nao fazem mais parte da estrutura salva.
-- A funcao interna continua participando da mesma transacao da funcao publica.

ALTER FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
)
RENAME TO salvar_estrutura_automacao_fluxo_atomica_sem_limpeza;

REVOKE ALL ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza(
      uuid,
      uuid,
      uuid,
      jsonb,
      jsonb,
      timestamptz
    ) FROM service_role;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  p_empresa_id uuid,
  p_fluxo_id uuid,
  p_usuario_id uuid,
  p_nos jsonb,
  p_conexoes jsonb,
  p_atualizado_em timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resultado jsonb;
  v_conexoes_removidas integer := 0;
  v_nos_removidos integer := 0;
BEGIN
  v_resultado := public.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza(
    p_empresa_id,
    p_fluxo_id,
    p_usuario_id,
    p_nos,
    p_conexoes,
    p_atualizado_em
  );

  -- O salvamento base desativa tudo e reativa somente o que veio da tela.
  -- Remove primeiro as conexoes para liberar as referencias aos blocos.
  DELETE FROM public.automacao_conexoes
   WHERE empresa_id = p_empresa_id
     AND fluxo_id = p_fluxo_id
     AND ativo = false;

  GET DIAGNOSTICS v_conexoes_removidas = ROW_COUNT;

  DELETE FROM public.automacao_nos
   WHERE empresa_id = p_empresa_id
     AND fluxo_id = p_fluxo_id
     AND ativo = false;

  GET DIAGNOSTICS v_nos_removidos = ROW_COUNT;

  RETURN COALESCE(v_resultado, '{}'::jsonb) || jsonb_build_object(
    'conexoes_removidas', v_conexoes_removidas,
    'nos_removidos', v_nos_removidos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
      uuid,
      uuid,
      uuid,
      jsonb,
      jsonb,
      timestamptz
    ) TO service_role;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) IS
  'Implementacao interna do salvamento atomico. Use salvar_estrutura_automacao_fluxo_atomica.';

COMMENT ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) IS
  'Salva a estrutura em uma unica transacao e remove definitivamente nos e conexoes inativos.';
