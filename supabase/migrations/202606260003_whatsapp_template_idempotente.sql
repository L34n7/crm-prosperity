CREATE OR REPLACE FUNCTION public.salvar_whatsapp_template_idempotente(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_waba_id text,
  p_meta_template_id text,
  p_nome text,
  p_categoria text,
  p_idioma text,
  p_status text,
  p_payload jsonb,
  p_resposta_meta jsonb,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template public.whatsapp_templates%ROWTYPE;
  v_criado boolean := false;
  v_nome text := NULLIF(BTRIM(p_nome), '');
  v_idioma text := NULLIF(BTRIM(p_idioma), '');
  v_meta_template_id text := NULLIF(BTRIM(p_meta_template_id), '');
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatorio para salvar template WhatsApp';
  END IF;

  IF p_integracao_whatsapp_id IS NULL THEN
    RAISE EXCEPTION 'integracao_whatsapp_id obrigatorio para salvar template WhatsApp';
  END IF;

  IF NULLIF(BTRIM(p_waba_id), '') IS NULL THEN
    RAISE EXCEPTION 'waba_id obrigatorio para salvar template WhatsApp';
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'nome obrigatorio para salvar template WhatsApp';
  END IF;

  IF v_idioma IS NULL THEN
    RAISE EXCEPTION 'idioma obrigatorio para salvar template WhatsApp';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_empresa_id::text),
    hashtext(v_nome || ':' || v_idioma)
  );

  IF v_meta_template_id IS NOT NULL THEN
    SELECT *
      INTO v_template
      FROM public.whatsapp_templates
     WHERE empresa_id = p_empresa_id
       AND integracao_whatsapp_id = p_integracao_whatsapp_id
       AND meta_template_id = v_meta_template_id
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_template.id IS NULL THEN
    SELECT *
      INTO v_template
      FROM public.whatsapp_templates
     WHERE empresa_id = p_empresa_id
       AND nome = v_nome
       AND idioma = v_idioma
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_template.id IS NOT NULL THEN
    UPDATE public.whatsapp_templates
       SET integracao_whatsapp_id = p_integracao_whatsapp_id,
           waba_id = BTRIM(p_waba_id),
           meta_template_id = COALESCE(v_meta_template_id, meta_template_id),
           nome = v_nome,
           categoria = COALESCE(NULLIF(BTRIM(p_categoria), ''), categoria),
           idioma = v_idioma,
           status = COALESCE(NULLIF(BTRIM(p_status), ''), status),
           payload = COALESCE(p_payload, '{}'::jsonb),
           resposta_meta = COALESCE(p_resposta_meta, '{}'::jsonb),
           updated_by = p_usuario_id,
           updated_at = now()
     WHERE id = v_template.id
     RETURNING * INTO v_template;
  ELSE
    INSERT INTO public.whatsapp_templates (
      empresa_id,
      integracao_whatsapp_id,
      waba_id,
      meta_template_id,
      nome,
      categoria,
      idioma,
      status,
      payload,
      resposta_meta,
      created_by,
      updated_by
    )
    VALUES (
      p_empresa_id,
      p_integracao_whatsapp_id,
      BTRIM(p_waba_id),
      v_meta_template_id,
      v_nome,
      COALESCE(NULLIF(BTRIM(p_categoria), ''), 'UTILITY'),
      v_idioma,
      COALESCE(NULLIF(BTRIM(p_status), ''), 'desconhecido'),
      COALESCE(p_payload, '{}'::jsonb),
      COALESCE(p_resposta_meta, '{}'::jsonb),
      p_usuario_id,
      p_usuario_id
    )
    RETURNING * INTO v_template;

    v_criado := true;
  END IF;

  RETURN jsonb_build_object(
    'criado', v_criado,
    'template', to_jsonb(v_template)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_whatsapp_template_idempotente(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.salvar_whatsapp_template_idempotente(
      uuid,
      uuid,
      text,
      text,
      text,
      text,
      text,
      text,
      jsonb,
      jsonb,
      uuid
    ) TO service_role;
  END IF;
END;
$$;
