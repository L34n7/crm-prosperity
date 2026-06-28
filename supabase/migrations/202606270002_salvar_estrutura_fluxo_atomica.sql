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
  v_nos jsonb := COALESCE(p_nos, '[]'::jsonb);
  v_conexoes jsonb := COALESCE(p_conexoes, '[]'::jsonb);
BEGIN
  IF p_empresa_id IS NULL OR p_fluxo_id IS NULL OR p_usuario_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Empresa, fluxo e usuario sao obrigatorios.';
  END IF;

  IF jsonb_typeof(v_nos) <> 'array' OR jsonb_typeof(v_conexoes) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Nos e conexoes devem ser enviados como listas.';
  END IF;

  -- O bloqueio da linha serializa salvamentos concorrentes do mesmo fluxo.
  PERFORM 1
    FROM public.automacao_fluxos
   WHERE id = p_fluxo_id
     AND empresa_id = p_empresa_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Fluxo nao encontrado para salvar a estrutura.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_nos,
        v_nos
      ) AS no
     WHERE no.id IS NULL
        OR NULLIF(BTRIM(no.tipo_no), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Existe um bloco sem ID ou tipo valido.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_nos,
        v_nos
      ) AS no
     GROUP BY no.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Existem blocos duplicados na estrutura.';
  END IF;

  IF (
    SELECT COUNT(*)
      FROM jsonb_populate_recordset(
        NULL::public.automacao_nos,
        v_nos
      ) AS no
     WHERE no.tipo_no = 'inicio'
  ) <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O fluxo deve possuir exatamente um bloco de inicio.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_nos,
        v_nos
      ) AS no
     WHERE no.tipo_no <> 'inicio'
       AND (
         COALESCE(no.delay_segundos, 0) < 0
         OR COALESCE(no.delay_segundos, 0) > 82800
       )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O delay dos blocos deve estar entre 0 e 82.800 segundos.';
  END IF;

  -- Impede que um ID conhecido de outra empresa ou fluxo seja sobrescrito.
  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_nos,
        v_nos
      ) AS no
      JOIN public.automacao_nos AS existente ON existente.id = no.id
     WHERE existente.empresa_id IS DISTINCT FROM p_empresa_id
        OR existente.fluxo_id IS DISTINCT FROM p_fluxo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Um bloco informado pertence a outro fluxo.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_conexoes,
        v_conexoes
      ) AS conexao
     WHERE conexao.id IS NULL
        OR conexao.no_origem_id IS NULL
        OR conexao.no_destino_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Existe uma conexao sem IDs validos.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_conexoes,
        v_conexoes
      ) AS conexao
     GROUP BY conexao.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Existem conexoes duplicadas na estrutura.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_conexoes,
        v_conexoes
      ) AS conexao
      JOIN public.automacao_conexoes AS existente
        ON existente.id = conexao.id
     WHERE existente.empresa_id IS DISTINCT FROM p_empresa_id
        OR existente.fluxo_id IS DISTINCT FROM p_fluxo_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Uma conexao informada pertence a outro fluxo.';
  END IF;

  -- Toda conexao da nova estrutura deve apontar para nos da mesma carga.
  IF EXISTS (
    SELECT 1
      FROM jsonb_populate_recordset(
        NULL::public.automacao_conexoes,
        v_conexoes
      ) AS conexao
     WHERE NOT EXISTS (
             SELECT 1
               FROM jsonb_populate_recordset(
                 NULL::public.automacao_nos,
                 v_nos
               ) AS no_origem
              WHERE no_origem.id = conexao.no_origem_id
           )
        OR NOT EXISTS (
             SELECT 1
               FROM jsonb_populate_recordset(
                 NULL::public.automacao_nos,
                 v_nos
               ) AS no_destino
              WHERE no_destino.id = conexao.no_destino_id
           )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Existe uma conexao apontando para um bloco ausente.';
  END IF;

  UPDATE public.automacao_conexoes
     SET ativo = false,
         updated_at = p_atualizado_em
   WHERE empresa_id = p_empresa_id
     AND fluxo_id = p_fluxo_id;

  UPDATE public.automacao_nos
     SET ativo = false,
         updated_at = p_atualizado_em
   WHERE empresa_id = p_empresa_id
     AND fluxo_id = p_fluxo_id;

  INSERT INTO public.automacao_nos (
    id,
    empresa_id,
    fluxo_id,
    tipo_no,
    titulo,
    descricao,
    posicao_x,
    posicao_y,
    configuracao_json,
    delay_segundos,
    ativo,
    updated_at
  )
  SELECT
    no.id,
    p_empresa_id,
    p_fluxo_id,
    no.tipo_no,
    COALESCE(NULLIF(BTRIM(no.titulo), ''), 'Bloco'),
    no.descricao,
    no.posicao_x,
    no.posicao_y,
    COALESCE(no.configuracao_json, '{}'::jsonb),
    CASE
      WHEN no.tipo_no = 'inicio' THEN NULL
      ELSE no.delay_segundos
    END,
    true,
    p_atualizado_em
  FROM jsonb_populate_recordset(
    NULL::public.automacao_nos,
    v_nos
  ) AS no
  ON CONFLICT (id) DO UPDATE
    SET empresa_id = EXCLUDED.empresa_id,
        fluxo_id = EXCLUDED.fluxo_id,
        tipo_no = EXCLUDED.tipo_no,
        titulo = EXCLUDED.titulo,
        descricao = EXCLUDED.descricao,
        posicao_x = EXCLUDED.posicao_x,
        posicao_y = EXCLUDED.posicao_y,
        configuracao_json = EXCLUDED.configuracao_json,
        delay_segundos = EXCLUDED.delay_segundos,
        ativo = true,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.automacao_conexoes (
    id,
    empresa_id,
    fluxo_id,
    no_origem_id,
    no_destino_id,
    condicao_json,
    rotulo,
    ordem,
    usar_ia,
    descricao_ia,
    ativo,
    updated_at
  )
  SELECT
    conexao.id,
    p_empresa_id,
    p_fluxo_id,
    conexao.no_origem_id,
    conexao.no_destino_id,
    COALESCE(conexao.condicao_json, '{}'::jsonb),
    conexao.rotulo,
    conexao.ordem,
    COALESCE(conexao.usar_ia, false),
    conexao.descricao_ia,
    true,
    p_atualizado_em
  FROM jsonb_populate_recordset(
    NULL::public.automacao_conexoes,
    v_conexoes
  ) AS conexao
  ON CONFLICT (id) DO UPDATE
    SET empresa_id = EXCLUDED.empresa_id,
        fluxo_id = EXCLUDED.fluxo_id,
        no_origem_id = EXCLUDED.no_origem_id,
        no_destino_id = EXCLUDED.no_destino_id,
        condicao_json = EXCLUDED.condicao_json,
        rotulo = EXCLUDED.rotulo,
        ordem = EXCLUDED.ordem,
        usar_ia = EXCLUDED.usar_ia,
        descricao_ia = EXCLUDED.descricao_ia,
        ativo = true,
        updated_at = EXCLUDED.updated_at;

  UPDATE public.automacao_fluxos
     SET updated_at = p_atualizado_em,
         atualizado_por = p_usuario_id
   WHERE id = p_fluxo_id
     AND empresa_id = p_empresa_id;

  RETURN jsonb_build_object(
    'nos', jsonb_array_length(v_nos),
    'conexoes', jsonb_array_length(v_conexoes),
    'atualizado_em', p_atualizado_em
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

COMMENT ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) IS
  'Salva nos e conexoes de um fluxo em uma unica transacao, com rollback integral em caso de erro.';
