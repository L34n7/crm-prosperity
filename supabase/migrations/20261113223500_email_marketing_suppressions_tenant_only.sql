-- Não aplicar bloqueios globais de uma conta Resend a empresas com credenciais próprias.
-- A Resend é a fonte de verdade por tenant, com espelho em email_suppressions.
DO $migration$
DECLARE
  funcao record;
  definicao text;
  atualizada text;
BEGIN
  FOR funcao IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('email_marketing_analisar_audiencia', 'email_marketing_preparar_destinatarios')
  LOOP
    definicao := pg_get_functiondef(funcao.oid);
    atualizada := replace(
      definicao,
      '(s.empresa_id is null or s.empresa_id = p_empresa_id)',
      '(s.empresa_id = p_empresa_id)'
    );
    IF atualizada = definicao THEN
      RAISE EXCEPTION 'A função % não contém a condição de supressão esperada', funcao.proname;
    END IF;
    EXECUTE atualizada;
  END LOOP;
END;
$migration$;
