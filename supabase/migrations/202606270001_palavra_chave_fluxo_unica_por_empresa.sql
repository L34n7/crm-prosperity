CREATE OR REPLACE FUNCTION public.validar_palavra_chave_fluxo_unica_por_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valor_normalizado text;
BEGIN
  IF NEW.tipo_gatilho IS DISTINCT FROM 'palavra_chave' THEN
    RETURN NEW;
  END IF;

  v_valor_normalizado := LOWER(BTRIM(COALESCE(NEW.valor, '')));

  IF v_valor_normalizado = '' THEN
    RETURN NEW;
  END IF;

  -- Serializa gravacoes da mesma palavra na mesma empresa para impedir
  -- duplicidades mesmo quando duas requisicoes chegam ao mesmo tempo.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.empresa_id::text || ':palavra_chave:' || v_valor_normalizado,
      0
    )
  );

  IF EXISTS (
    SELECT 1
      FROM public.automacao_gatilhos AS existente
     WHERE existente.empresa_id = NEW.empresa_id
       AND existente.tipo_gatilho = 'palavra_chave'
       AND LOWER(BTRIM(COALESCE(existente.valor, ''))) = v_valor_normalizado
       AND (TG_OP = 'INSERT' OR existente.id IS DISTINCT FROM NEW.id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'automacao_gatilhos_empresa_palavra_chave_unique',
      MESSAGE = format(
        'A palavra-chave "%s" ja esta cadastrada em um fluxo desta empresa.',
        BTRIM(NEW.valor)
      );
  END IF;

  NEW.valor := v_valor_normalizado;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_palavra_chave_fluxo_unica_por_empresa
  ON public.automacao_gatilhos;

CREATE TRIGGER validar_palavra_chave_fluxo_unica_por_empresa
BEFORE INSERT OR UPDATE OF empresa_id, tipo_gatilho, valor
ON public.automacao_gatilhos
FOR EACH ROW
EXECUTE FUNCTION public.validar_palavra_chave_fluxo_unica_por_empresa();

COMMENT ON FUNCTION public.validar_palavra_chave_fluxo_unica_por_empresa() IS
  'Impede que uma empresa reutilize a mesma palavra-chave em fluxos diferentes, independentemente do status do fluxo ou do gatilho.';
