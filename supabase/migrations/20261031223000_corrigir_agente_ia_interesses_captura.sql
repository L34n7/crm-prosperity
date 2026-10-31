-- Corrige o registro de interesses do agente de IA no cadastro do contato.
-- A tabela contato_informacoes_captura não possui coluna conversa_id: a origem
-- da conversa é conservada em metadata_json, sem modificar sua estrutura.
-- Valor_normalizado é obrigatório e sustenta o índice de deduplicação.
CREATE OR REPLACE FUNCTION public.agente_ia_registrar_interesse_preferencia(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_conversa_id uuid,
  p_texto text
)
RETURNS TABLE(registro_id uuid, numero integer, texto_registrado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_contato_id uuid;
  v_texto text;
  v_valor text;
  v_normalizado text;
  v_id uuid;
  v_numero integer;
  v_existente text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agente_ia_ferramentas f
    WHERE f.empresa_id = p_empresa_id
      AND f.agente_id = p_agente_id
      AND f.tipo = 'registrar_interesse_preferencia'
      AND f.ativo = true
  ) THEN
    RETURN;
  END IF;

  v_texto := regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g');
  v_texto := regexp_replace(
    v_texto,
    '^interesse/preferências coletado pelo Agente IA\s*[:\-]?\s*',
    '', 'i'
  );
  v_texto := left(trim(v_texto), 180);
  IF v_texto = '' THEN RETURN; END IF;

  -- Confere tanto a empresa quanto o agente antes de usar o contato.
  SELECT c.contato_id INTO v_contato_id
  FROM public.conversas c
  JOIN public.agentes_ia a ON a.id = p_agente_id
    AND a.empresa_id = p_empresa_id
  WHERE c.id = p_conversa_id AND c.empresa_id = p_empresa_id
  LIMIT 1;

  IF v_contato_id IS NULL THEN
    RAISE EXCEPTION 'Conversa, contato ou agente inválido para a empresa.';
  END IF;

  v_valor := 'interesse/preferências coletado pelo Agente IA: ' || v_texto;
  v_normalizado := lower(regexp_replace(trim(v_valor), '\s+', ' ', 'g'));

  -- Mesmo lock que o trigger usa para qualquer captura de tipo texto.
  -- Evita disputa com outras inserções e mantém sequência estável.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_empresa_id::text || ':' || v_contato_id::text || ':texto', 0
  ));

  SELECT cic.id, cic.sequencia, cic.valor
  INTO v_id, v_numero, v_existente
  FROM public.contato_informacoes_captura cic
  WHERE cic.empresa_id = p_empresa_id
    AND cic.contato_id = v_contato_id
    AND cic.tipo = 'texto'
    AND cic.ativo = true
    AND cic.valor_normalizado = v_normalizado
  ORDER BY cic.capturado_em DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_numero, v_existente;
    RETURN;
  END IF;

  INSERT INTO public.contato_informacoes_captura (
    empresa_id, contato_id, tipo, nome_campo, sequencia, valor,
    valor_normalizado, variavel_origem, ativo, metadata_json
  )
  VALUES (
    p_empresa_id, v_contato_id, 'texto', 'Observação', NULL, v_valor,
    v_normalizado, 'agente_ia_interesse_preferencia', true,
    jsonb_build_object(
      'origem', 'agente_ia',
      'agente_id', p_agente_id,
      'conversa_id', p_conversa_id,
      'tipo_registro', 'interesse_preferencia'
    )
  )
  RETURNING id, sequencia, valor INTO v_id, v_numero, v_existente;

  RETURN QUERY SELECT v_id, v_numero, v_existente;
END;
$function$;

-- Mantém a função de gravação exclusiva para o backend.
REVOKE ALL ON FUNCTION public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text)
  TO service_role;
