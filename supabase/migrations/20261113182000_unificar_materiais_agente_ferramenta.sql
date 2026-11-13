-- Unifica materiais em Ferramentas > Enviar material. Os conhecimentos
-- permanecem como texto pesquisável; seus vínculos passam a existir na ferramenta.
-- Idempotente: após a transferência, materiais_json do conhecimento fica vazio.
DO $migracao$
DECLARE
  conhecimento record;
  material jsonb;
  item jsonb;
  materiais_atuais jsonb;
  materiais_novos jsonb;
  materiais_antes jsonb;
  atualizado jsonb;
  ids jsonb;
  pos integer;
  encontrou boolean;
BEGIN
  FOR conhecimento IN
    SELECT id,empresa_id,agente_id,materiais_json
    FROM public.agente_ia_conhecimentos
    WHERE jsonb_typeof(materiais_json)='array'
      AND jsonb_array_length(materiais_json)>0
    ORDER BY empresa_id,agente_id,id
    FOR UPDATE
  LOOP
    INSERT INTO public.agente_ia_ferramentas(
      empresa_id,agente_id,tipo,ativo,config_json
    ) VALUES(conhecimento.empresa_id,conhecimento.agente_id,
      'enviar_material',false,'{"materiais":[]}'::jsonb)
    ON CONFLICT(agente_id,tipo) DO NOTHING;

    SELECT COALESCE(config_json->'materiais','[]'::jsonb)
    INTO materiais_atuais FROM public.agente_ia_ferramentas
    WHERE empresa_id=conhecimento.empresa_id
      AND agente_id=conhecimento.agente_id
      AND tipo='enviar_material' FOR UPDATE;
    IF jsonb_typeof(materiais_atuais)<>'array'
      THEN materiais_atuais:='[]'::jsonb;
    END IF;
    materiais_antes:=materiais_atuais;

    FOR material IN SELECT value FROM jsonb_array_elements(conhecimento.materiais_json)
    LOOP
      IF material->>'midia_id' IS NULL
         OR NULLIF(btrim(material->>'quando_enviar'),'') IS NULL THEN
        CONTINUE;
      END IF;
      materiais_novos:='[]'::jsonb;
      encontrou:=false;
      FOR item IN SELECT value FROM jsonb_array_elements(materiais_atuais)
      LOOP
        IF item->>'midia_id'=material->>'midia_id' THEN
          ids:=coalesce(item->'conhecimento_ids','[]'::jsonb);
          IF jsonb_typeof(ids)<>'array' THEN ids:='[]'::jsonb; END IF;
          IF NOT ids @> jsonb_build_array(conhecimento.id::text) THEN
            ids:=ids||jsonb_build_array(conhecimento.id::text);
          END IF;
          atualizado:=jsonb_set(item,'{conhecimento_ids}',ids,true);
          materiais_novos:=materiais_novos||jsonb_build_array(atualizado);
          encontrou:=true;
        ELSE
          materiais_novos:=materiais_novos||jsonb_build_array(item);
        END IF;
      END LOOP;
      IF NOT encontrou THEN
        atualizado:=jsonb_set(material,'{conhecimento_ids}',
          jsonb_build_array(conhecimento.id::text),true);
        materiais_novos:=materiais_novos||jsonb_build_array(atualizado);
      END IF;
      materiais_atuais:=materiais_novos;
    END LOOP;

    IF jsonb_array_length(materiais_atuais)>40 THEN
      RAISE EXCEPTION 'Agente % excederia o limite de 40 materiais',
        conhecimento.agente_id;
    END IF;

    UPDATE public.agente_ia_ferramentas SET
      config_json=jsonb_set(coalesce(config_json,'{}'::jsonb),
        '{materiais}',materiais_atuais,true),
      updated_at=now()
    WHERE empresa_id=conhecimento.empresa_id
      AND agente_id=conhecimento.agente_id AND tipo='enviar_material';

    UPDATE public.agente_ia_conhecimentos
    SET materiais_json='[]'::jsonb,updated_at=now()
    WHERE id=conhecimento.id AND empresa_id=conhecimento.empresa_id
      AND agente_id=conhecimento.agente_id;
  END LOOP;
END;
$migracao$;
