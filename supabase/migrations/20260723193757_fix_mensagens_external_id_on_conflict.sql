-- O cliente Supabase/PostgREST gera ON CONFLICT (mensagem_externa_id)
-- para os upserts do histórico Coexistence. O índice anterior era parcial
-- (WHERE mensagem_externa_id IS NOT NULL), por isso o PostgreSQL não conseguia
-- inferi-lo como árbitro do ON CONFLICT e retornava 42P10.
--
-- Um índice UNIQUE comum continua permitindo múltiplos valores NULL no
-- PostgreSQL e passa a ser compatível com o upsert existente.

CREATE UNIQUE INDEX IF NOT EXISTS mensagens_externa_unica_on_conflict
  ON public.mensagens (mensagem_externa_id);

DROP INDEX IF EXISTS public.mensagens_externa_unica;

ALTER INDEX IF EXISTS public.mensagens_externa_unica_on_conflict
  RENAME TO mensagens_externa_unica;

COMMENT ON INDEX public.mensagens_externa_unica IS
  'Garante idempotência global por mensagem_externa_id e suporta ON CONFLICT do PostgREST; valores NULL podem se repetir.';
