-- A migration 005 envolveu a funcao original para excluir definitivamente os
-- registros que permanecessem inativos. Restaura a implementacao original:
-- ao salvar, registros ausentes ficam com ativo = false e o historico mantem
-- suas referencias. Uma limpeza futura devera usar retencao e verificar
-- execucoes e agendamentos ativos antes de apagar qualquer configuracao.

DROP FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
);

ALTER FUNCTION public.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
)
RENAME TO salvar_estrutura_automacao_fluxo_atomica;

REVOKE ALL ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
      uuid,
      uuid,
      uuid,
      jsonb,
      jsonb,
      timestamptz
    ) TO service_role;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.salvar_estrutura_automacao_fluxo_atomica(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  timestamptz
) IS
  'Salva nos e conexoes de um fluxo em uma unica transacao e preserva como inativos os registros removidos da estrutura.';

NOTIFY pgrst, 'reload schema';
