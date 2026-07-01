-- Mantem a classificacao dos eventos manuais no mesmo formato usado pelos
-- eventos automaticos dos fluxos.

UPDATE public.rastreamento_eventos
SET metadata_json =
  COALESCE(metadata_json, '{}'::jsonb)
  || jsonb_build_object(
    'resultado_fluxo',
    CASE
      WHEN tipo IN (
        'venda_realizada',
        'agendamento_criado',
        'agendamento_confirmado'
      ) THEN 'positivo'
      WHEN tipo = 'venda_perdida' THEN 'negativo'
      WHEN tipo = 'lead_qualificado' THEN 'neutro'
    END
  )
WHERE origem_registro = 'manual'
  AND tipo IN (
    'venda_realizada',
    'venda_perdida',
    'lead_qualificado',
    'agendamento_criado',
    'agendamento_confirmado'
  )
  AND COALESCE(metadata_json->>'resultado_fluxo', '') IS DISTINCT FROM
    CASE
      WHEN tipo IN (
        'venda_realizada',
        'agendamento_criado',
        'agendamento_confirmado'
      ) THEN 'positivo'
      WHEN tipo = 'venda_perdida' THEN 'negativo'
      WHEN tipo = 'lead_qualificado' THEN 'neutro'
    END;
