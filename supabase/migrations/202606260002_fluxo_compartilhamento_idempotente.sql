CREATE OR REPLACE FUNCTION public.obter_ou_criar_automacao_fluxo_compartilhamento(
  p_codigo text,
  p_empresa_origem_id uuid,
  p_fluxo_origem_id uuid,
  p_nome_fluxo text,
  p_snapshot_json jsonb,
  p_criado_por uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compartilhamento public.automacao_fluxo_compartilhamentos%ROWTYPE;
  v_criado boolean := false;
BEGIN
  IF NULLIF(BTRIM(p_codigo), '') IS NULL THEN
    RAISE EXCEPTION 'codigo obrigatorio para compartilhar fluxo';
  END IF;

  IF p_empresa_origem_id IS NULL THEN
    RAISE EXCEPTION 'empresa_origem_id obrigatorio para compartilhar fluxo';
  END IF;

  IF p_fluxo_origem_id IS NULL THEN
    RAISE EXCEPTION 'fluxo_origem_id obrigatorio para compartilhar fluxo';
  END IF;

  IF NULLIF(BTRIM(p_nome_fluxo), '') IS NULL THEN
    RAISE EXCEPTION 'nome_fluxo obrigatorio para compartilhar fluxo';
  END IF;

  IF p_snapshot_json IS NULL THEN
    RAISE EXCEPTION 'snapshot_json obrigatorio para compartilhar fluxo';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_empresa_origem_id::text),
    hashtext(p_fluxo_origem_id::text)
  );

  SELECT *
    INTO v_compartilhamento
    FROM public.automacao_fluxo_compartilhamentos
   WHERE empresa_origem_id = p_empresa_origem_id
     AND fluxo_origem_id = p_fluxo_origem_id
     AND ativo
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.automacao_fluxo_compartilhamentos
       SET nome_fluxo = p_nome_fluxo,
           snapshot_json = p_snapshot_json,
           updated_at = now()
     WHERE id = v_compartilhamento.id
     RETURNING * INTO v_compartilhamento;
  ELSE
    INSERT INTO public.automacao_fluxo_compartilhamentos (
      codigo,
      empresa_origem_id,
      fluxo_origem_id,
      nome_fluxo,
      snapshot_json,
      criado_por
    )
    VALUES (
      BTRIM(p_codigo),
      p_empresa_origem_id,
      p_fluxo_origem_id,
      p_nome_fluxo,
      p_snapshot_json,
      p_criado_por
    )
    RETURNING * INTO v_compartilhamento;

    v_criado := true;
  END IF;

  RETURN jsonb_build_object(
    'criado', v_criado,
    'compartilhamento', to_jsonb(v_compartilhamento)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obter_ou_criar_automacao_fluxo_compartilhamento(
  text,
  uuid,
  uuid,
  text,
  jsonb,
  uuid
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.obter_ou_criar_automacao_fluxo_compartilhamento(
      text,
      uuid,
      uuid,
      text,
      jsonb,
      uuid
    ) TO service_role;
  END IF;
END;
$$;
