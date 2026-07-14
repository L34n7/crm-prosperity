-- Limpeza unica do legado inativo ate 13/07/2026, inclusive, considerando
-- o horario de Sao Paulo. updated_at identifica quando o registro foi
-- efetivamente desativado; created_at e usado apenas como fallback.

DO $$
DECLARE
  v_limite timestamptz := '2026-07-14 00:00:00 America/Sao_Paulo'::timestamptz;
  v_conexoes_removidas integer := 0;
  v_nos_removidos integer := 0;
BEGIN
  DELETE FROM public.automacao_conexoes AS conexao
   WHERE conexao.ativo IS FALSE
     AND COALESCE(conexao.updated_at, conexao.created_at) < v_limite;

  GET DIAGNOSTICS v_conexoes_removidas = ROW_COUNT;

  DELETE FROM public.automacao_nos AS no
   WHERE no.ativo IS FALSE
     AND COALESCE(no.updated_at, no.created_at) < v_limite
     AND NOT EXISTS (
       SELECT 1
         FROM public.automacao_conexoes AS conexao_restante
        WHERE conexao_restante.no_origem_id = no.id
           OR conexao_restante.no_destino_id = no.id
     );

  GET DIAGNOSTICS v_nos_removidos = ROW_COUNT;

  RAISE NOTICE
    'Limpeza concluida: % conexoes e % nos inativos removidos.',
    v_conexoes_removidas,
    v_nos_removidos;
END;
$$;
