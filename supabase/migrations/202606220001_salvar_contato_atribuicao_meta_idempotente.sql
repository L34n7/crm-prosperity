CREATE OR REPLACE FUNCTION public.salvar_contato_atribuicao_meta(p_dados jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dados jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_empresa_id uuid;
  v_ctwa_clid text;
  v_mensagem_externa_id text;
  v_id uuid;
  v_updated_at timestamptz;
BEGIN
  v_empresa_id := (v_dados->>'empresa_id')::uuid;
  v_ctwa_clid := NULLIF(BTRIM(v_dados->>'ctwa_clid'), '');
  v_mensagem_externa_id := NULLIF(BTRIM(v_dados->>'mensagem_externa_id'), '');
  v_updated_at := COALESCE(NULLIF(v_dados->>'updated_at', '')::timestamptz, now());

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatorio para salvar atribuicao Meta';
  END IF;

  IF v_ctwa_clid IS NULL AND v_mensagem_externa_id IS NULL THEN
    RAISE EXCEPTION 'ctwa_clid ou mensagem_externa_id obrigatorio para salvar atribuicao Meta';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_empresa_id::text),
    hashtext(COALESCE(v_mensagem_externa_id, v_ctwa_clid))
  );

  IF v_ctwa_clid IS NOT NULL THEN
    SELECT id
      INTO v_id
      FROM public.contato_atribuicoes_meta
     WHERE empresa_id = v_empresa_id
       AND ctwa_clid = v_ctwa_clid
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_id IS NULL AND v_mensagem_externa_id IS NOT NULL THEN
    SELECT id
      INTO v_id
      FROM public.contato_atribuicoes_meta
     WHERE empresa_id = v_empresa_id
       AND mensagem_externa_id = v_mensagem_externa_id
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    BEGIN
      INSERT INTO public.contato_atribuicoes_meta (
        empresa_id,
        contato_id,
        conversa_id,
        mensagem_id,
        integracao_whatsapp_id,
        mensagem_externa_id,
        rastreamento_origem_id,
        rastreamento_campanha_id,
        ctwa_clid,
        source_id,
        source_url,
        source_type,
        headline,
        body,
        media_type,
        image_url,
        video_url,
        thumbnail_url,
        conversation_origin_type,
        pricing_type,
        pricing_category,
        pricing_model,
        pricing_billable,
        payload_json,
        updated_at
      )
      VALUES (
        v_empresa_id,
        CASE WHEN v_dados ? 'contato_id' THEN NULLIF(v_dados->>'contato_id', '')::uuid ELSE NULL END,
        CASE WHEN v_dados ? 'conversa_id' THEN NULLIF(v_dados->>'conversa_id', '')::uuid ELSE NULL END,
        CASE WHEN v_dados ? 'mensagem_id' THEN NULLIF(v_dados->>'mensagem_id', '')::uuid ELSE NULL END,
        CASE WHEN v_dados ? 'integracao_whatsapp_id' THEN NULLIF(v_dados->>'integracao_whatsapp_id', '')::uuid ELSE NULL END,
        v_mensagem_externa_id,
        CASE WHEN v_dados ? 'rastreamento_origem_id' THEN NULLIF(v_dados->>'rastreamento_origem_id', '')::uuid ELSE NULL END,
        CASE WHEN v_dados ? 'rastreamento_campanha_id' THEN NULLIF(v_dados->>'rastreamento_campanha_id', '')::uuid ELSE NULL END,
        v_ctwa_clid,
        v_dados->>'source_id',
        v_dados->>'source_url',
        v_dados->>'source_type',
        v_dados->>'headline',
        v_dados->>'body',
        v_dados->>'media_type',
        v_dados->>'image_url',
        v_dados->>'video_url',
        v_dados->>'thumbnail_url',
        v_dados->>'conversation_origin_type',
        v_dados->>'pricing_type',
        v_dados->>'pricing_category',
        v_dados->>'pricing_model',
        CASE WHEN v_dados ? 'pricing_billable' THEN (v_dados->>'pricing_billable')::boolean ELSE NULL END,
        COALESCE(v_dados->'payload_json', '{}'::jsonb),
        v_updated_at
      )
      RETURNING id INTO v_id;

      RETURN v_id;
    EXCEPTION WHEN unique_violation THEN
      v_id := NULL;

      IF v_ctwa_clid IS NOT NULL THEN
        SELECT id
          INTO v_id
          FROM public.contato_atribuicoes_meta
         WHERE empresa_id = v_empresa_id
           AND ctwa_clid = v_ctwa_clid
         ORDER BY updated_at DESC
         LIMIT 1
         FOR UPDATE;
      END IF;

      IF v_id IS NULL AND v_mensagem_externa_id IS NOT NULL THEN
        SELECT id
          INTO v_id
          FROM public.contato_atribuicoes_meta
         WHERE empresa_id = v_empresa_id
           AND mensagem_externa_id = v_mensagem_externa_id
         ORDER BY updated_at DESC
         LIMIT 1
         FOR UPDATE;
      END IF;
    END;
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'nao foi possivel localizar atribuicao Meta conflitada';
  END IF;

  UPDATE public.contato_atribuicoes_meta
     SET contato_id = CASE WHEN v_dados ? 'contato_id' THEN NULLIF(v_dados->>'contato_id', '')::uuid ELSE contato_id END,
         conversa_id = CASE WHEN v_dados ? 'conversa_id' THEN NULLIF(v_dados->>'conversa_id', '')::uuid ELSE conversa_id END,
         mensagem_id = CASE WHEN v_dados ? 'mensagem_id' THEN NULLIF(v_dados->>'mensagem_id', '')::uuid ELSE mensagem_id END,
         integracao_whatsapp_id = CASE WHEN v_dados ? 'integracao_whatsapp_id' THEN NULLIF(v_dados->>'integracao_whatsapp_id', '')::uuid ELSE integracao_whatsapp_id END,
         mensagem_externa_id = CASE WHEN v_dados ? 'mensagem_externa_id' THEN v_mensagem_externa_id ELSE mensagem_externa_id END,
         rastreamento_origem_id = CASE WHEN v_dados ? 'rastreamento_origem_id' THEN NULLIF(v_dados->>'rastreamento_origem_id', '')::uuid ELSE rastreamento_origem_id END,
         rastreamento_campanha_id = CASE WHEN v_dados ? 'rastreamento_campanha_id' THEN NULLIF(v_dados->>'rastreamento_campanha_id', '')::uuid ELSE rastreamento_campanha_id END,
         ctwa_clid = CASE WHEN v_dados ? 'ctwa_clid' THEN v_ctwa_clid ELSE ctwa_clid END,
         source_id = CASE WHEN v_dados ? 'source_id' THEN v_dados->>'source_id' ELSE source_id END,
         source_url = CASE WHEN v_dados ? 'source_url' THEN v_dados->>'source_url' ELSE source_url END,
         source_type = CASE WHEN v_dados ? 'source_type' THEN v_dados->>'source_type' ELSE source_type END,
         headline = CASE WHEN v_dados ? 'headline' THEN v_dados->>'headline' ELSE headline END,
         body = CASE WHEN v_dados ? 'body' THEN v_dados->>'body' ELSE body END,
         media_type = CASE WHEN v_dados ? 'media_type' THEN v_dados->>'media_type' ELSE media_type END,
         image_url = CASE WHEN v_dados ? 'image_url' THEN v_dados->>'image_url' ELSE image_url END,
         video_url = CASE WHEN v_dados ? 'video_url' THEN v_dados->>'video_url' ELSE video_url END,
         thumbnail_url = CASE WHEN v_dados ? 'thumbnail_url' THEN v_dados->>'thumbnail_url' ELSE thumbnail_url END,
         conversation_origin_type = CASE WHEN v_dados ? 'conversation_origin_type' THEN v_dados->>'conversation_origin_type' ELSE conversation_origin_type END,
         pricing_type = CASE WHEN v_dados ? 'pricing_type' THEN v_dados->>'pricing_type' ELSE pricing_type END,
         pricing_category = CASE WHEN v_dados ? 'pricing_category' THEN v_dados->>'pricing_category' ELSE pricing_category END,
         pricing_model = CASE WHEN v_dados ? 'pricing_model' THEN v_dados->>'pricing_model' ELSE pricing_model END,
         pricing_billable = CASE WHEN v_dados ? 'pricing_billable' THEN (v_dados->>'pricing_billable')::boolean ELSE pricing_billable END,
         payload_json = COALESCE(payload_json, '{}'::jsonb) || COALESCE(v_dados->'payload_json', '{}'::jsonb),
         updated_at = v_updated_at
   WHERE id = v_id
   RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_contato_atribuicao_meta(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.salvar_contato_atribuicao_meta(jsonb) TO service_role;
  END IF;
END;
$$;
