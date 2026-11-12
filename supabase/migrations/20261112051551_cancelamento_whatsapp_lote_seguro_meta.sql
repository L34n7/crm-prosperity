-- Cancelamento de campanhas em lote, sem listas de IDs no PostgREST.
-- A reserva da Meta e liberada apenas pelos IDs associados a campanha,
-- evitando alterar reservas de outras campanhas para o mesmo telefone.
CREATE OR REPLACE FUNCTION public.cancelar_itens_whatsapp_campanha_seguro(
  p_campanha_id uuid,
  p_empresa_id uuid,
  p_motivo text DEFAULT NULL,
  p_metadata_json jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (itens_cancelados integer, reservas_liberadas integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $func$
DECLARE
  v_campanha public.whatsapp_disparo_campanhas%ROWTYPE;
  v_agora timestamptz := now();
  v_itens integer := 0;
  v_reservas integer := 0;
  v_motivo text;
BEGIN
  IF p_campanha_id IS NULL OR p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Campanha e empresa sao obrigatorias.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_campanha
  FROM public.whatsapp_disparo_campanhas c
  WHERE c.id=p_campanha_id AND c.empresa_id=p_empresa_id
  FOR UPDATE;

  IF NOT FOUND OR v_campanha.status IS DISTINCT FROM 'cancelada' THEN
    RAISE EXCEPTION 'A campanha nao foi encontrada ou nao esta cancelada.'
      USING ERRCODE='P0002';
  END IF;

  v_motivo := COALESCE(NULLIF(btrim(p_motivo),''),'Campanha cancelada antes do envio.');

  UPDATE public.whatsapp_disparo_itens i
  SET status='cancelado',
      erro=v_motivo,
      locked_at=NULL,
      processed_at=COALESCE(i.processed_at,v_agora),
      updated_at=v_agora,
      metadata_json=COALESCE(i.metadata_json,'{}'::jsonb)
        || COALESCE(p_metadata_json,'{}'::jsonb)
        || jsonb_build_object(
          'cancelamento_campanha_seguro',true,
          'cancelamento_em_lote_em',v_agora,
          'motivo_cancelamento',v_motivo
        )
  WHERE i.campanha_id=p_campanha_id
    AND i.empresa_id=p_empresa_id
    AND i.status IN ('pendente','processando')
    AND i.message_id IS NULL;

  GET DIAGNOSTICS v_itens=ROW_COUNT;

  UPDATE public.whatsapp_meta_conversas_iniciadas r
  SET status='cancelado',
      liberado_em=v_agora,
      updated_at=v_agora,
      metadata_json=COALESCE(r.metadata_json,'{}'::jsonb)
        || jsonb_build_object(
          'campanha_disparo_id',p_campanha_id,
          'motivo_liberacao','campanha_cancelada',
          'reserva_liberada_em',v_agora
        )
  WHERE r.id=ANY(COALESCE(v_campanha.limite_meta_reserva_ids,ARRAY[]::uuid[]))
    AND r.empresa_id=p_empresa_id
    AND r.status='reservado'
    AND r.message_id IS NULL;

  GET DIAGNOSTICS v_reservas=ROW_COUNT;
  RETURN QUERY SELECT v_itens,v_reservas;
END;
$func$;

REVOKE ALL ON FUNCTION public.cancelar_itens_whatsapp_campanha_seguro(uuid,uuid,text,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_itens_whatsapp_campanha_seguro(uuid,uuid,text,jsonb)
TO service_role;

-- O cancelamento em lote ja libera as reservas exatas pelo ID da campanha.
-- Impede o trigger legado de procurar uma reserva de OUTRA campanha pelo telefone.
DROP TRIGGER IF EXISTS trg_sincronizar_whatsapp_meta_reserva_item_update
ON public.whatsapp_disparo_itens;

CREATE TRIGGER trg_sincronizar_whatsapp_meta_reserva_item_update
AFTER UPDATE OF status, erro_codigo_meta, metadata_json, processed_at
ON public.whatsapp_disparo_itens
FOR EACH ROW
WHEN (
  NEW.status IS DISTINCT FROM 'cancelado'
  OR OLD.status NOT IN ('pendente','processando')
  OR NEW.metadata_json->>'cancelamento_campanha_seguro' IS DISTINCT FROM 'true'
)
EXECUTE FUNCTION public.sincronizar_whatsapp_meta_reserva_por_item();

NOTIFY pgrst, 'reload schema';
