DO $$
DECLARE
  v_descricao_meta text := 'Campanha criada automaticamente a partir de anuncio Click-to-WhatsApp da Meta.';
BEGIN
  CREATE TEMP TABLE tmp_campanhas_meta_duplicadas ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      id,
      first_value(id) OVER (
        PARTITION BY
          empresa_id,
          origem_id,
          COALESCE(integracao_whatsapp_id, '00000000-0000-0000-0000-000000000000'::uuid),
          lower(nome)
        ORDER BY created_at ASC, id ASC
      ) AS campanha_principal_id,
      row_number() OVER (
        PARTITION BY
          empresa_id,
          origem_id,
          COALESCE(integracao_whatsapp_id, '00000000-0000-0000-0000-000000000000'::uuid),
          lower(nome)
        ORDER BY created_at ASC, id ASC
      ) AS ordem
    FROM public.rastreamento_campanhas
    WHERE descricao = v_descricao_meta
  )
  SELECT id, campanha_principal_id
  FROM ranked
  WHERE ordem > 1;

  UPDATE public.contatos contato
  SET rastreamento_campanha_id = duplicada.campanha_principal_id
  FROM tmp_campanhas_meta_duplicadas duplicada
  WHERE contato.rastreamento_campanha_id = duplicada.id;

  UPDATE public.conversas conversa
  SET rastreamento_campanha_id = duplicada.campanha_principal_id
  FROM tmp_campanhas_meta_duplicadas duplicada
  WHERE conversa.rastreamento_campanha_id = duplicada.id;

  UPDATE public.rastreamento_eventos evento
  SET campanha_id = duplicada.campanha_principal_id
  FROM tmp_campanhas_meta_duplicadas duplicada
  WHERE evento.campanha_id = duplicada.id;

  UPDATE public.rastreamento_cliques clique
  SET campanha_id = duplicada.campanha_principal_id
  FROM tmp_campanhas_meta_duplicadas duplicada
  WHERE clique.campanha_id = duplicada.id;

  UPDATE public.rastreamento_links link
  SET campanha_id = duplicada.campanha_principal_id
  FROM tmp_campanhas_meta_duplicadas duplicada
  WHERE link.campanha_id = duplicada.id;

  IF to_regclass('public.contato_atribuicoes_meta') IS NOT NULL THEN
    UPDATE public.contato_atribuicoes_meta atribuicao
    SET rastreamento_campanha_id = duplicada.campanha_principal_id
    FROM tmp_campanhas_meta_duplicadas duplicada
    WHERE atribuicao.rastreamento_campanha_id = duplicada.id;
  END IF;

  DELETE FROM public.rastreamento_campanhas campanha
  USING tmp_campanhas_meta_duplicadas duplicada
  WHERE campanha.id = duplicada.id;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rastreamento_campanhas_meta_auto_nome_unique
  ON public.rastreamento_campanhas (
    empresa_id,
    origem_id,
    COALESCE(integracao_whatsapp_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(nome)
  )
  WHERE descricao = 'Campanha criada automaticamente a partir de anuncio Click-to-WhatsApp da Meta.';
