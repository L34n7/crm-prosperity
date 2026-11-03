-- Cada veículo/ano consultado passa a carregar a motorização identificada na própria FIPE.
ALTER TABLE public.cotacao_veicular_catalogo_fipe
  ADD COLUMN IF NOT EXISTS energia text;

UPDATE public.cotacao_veicular_catalogo_fipe
SET energia=CASE
  WHEN translate(lower(combustivel || ' ' || modelo),'áàâãéêíóôõúüç','aaaaeeiooouuc')
    ~ '(hibrid|hybrid|phev|mhev|hev)' THEN 'hibrido'
  WHEN translate(lower(combustivel || ' ' || modelo),'áàâãéêíóôõúüç','aaaaeeiooouuc')
    ~ '(eletric|electric|eletricidade|electricity|bev)' THEN 'eletrico'
  WHEN translate(lower(combustivel),'áàâãéêíóôõúüç','aaaaeeiooouuc')
    ~ '(gasolina|diesel|etanol|alcool|flex|gnv|gas natural|bicombustivel)' THEN 'combustao'
  ELSE NULL
END
WHERE energia IS NULL;

DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.cotacao_veicular_catalogo_fipe WHERE energia IS NULL)
 THEN RAISE EXCEPTION 'Ha veiculos com motorizacao FIPE nao identificada. Revisar antes de exigir NOT NULL.';
 END IF;
END $check$;
ALTER TABLE public.cotacao_veicular_catalogo_fipe ALTER COLUMN energia SET NOT NULL;
ALTER TABLE public.cotacao_veicular_catalogo_fipe
  ADD CONSTRAINT cotacao_veicular_catalogo_fipe_energia_check
  CHECK (energia IN ('combustao','hibrido','eletrico'));
