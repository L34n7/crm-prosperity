-- Acelera a busca feita por /api/whatsapp/media/[mediaId].
-- Sem este indice, cada midia renderizada no historico varre mensagens por JSON.

CREATE INDEX IF NOT EXISTS mensagens_metadata_media_id_idx
  ON public.mensagens ((metadata_json ->> 'media_id'));

NOTIFY pgrst, 'reload schema';
