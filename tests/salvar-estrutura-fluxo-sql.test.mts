import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function lerMigration(nome: string) {
  return readFileSync(
    new URL(`../supabase/migrations/${nome}`, import.meta.url),
    "utf8"
  );
}

const migrationBase = lerMigration(
  "202606270002_salvar_estrutura_fluxo_atomica.sql"
);
const migrationLimpezaDescontinuada = lerMigration(
  "202607140006_limpar_nos_conexoes_inativos_ate_dia_13.sql"
);
const migrationRestauracao = lerMigration(
  "202607140007_restaurar_soft_delete_estrutura_fluxos.sql"
);

test("o salvamento base desativa ausentes e reativa a estrutura recebida", () => {
  assert.match(
    migrationBase,
    /UPDATE public\.automacao_conexoes[\s\S]+SET ativo = false/
  );
  assert.match(
    migrationBase,
    /UPDATE public\.automacao_nos[\s\S]+SET ativo = false/
  );
  assert.equal(
    Array.from(migrationBase.matchAll(/ativo = true/g)).length >= 2,
    true
  );
});

test("a migration 006 nao exclui dados historicos", () => {
  assert.doesNotMatch(
    migrationLimpezaDescontinuada,
    /DELETE\s+FROM\s+public\.automacao_(nos|conexoes)/i
  );
  assert.match(
    migrationLimpezaDescontinuada,
    /Limpeza de nos e conexoes inativos ignorada/
  );
});

test("a migration 007 remove o wrapper e restaura a funcao original", () => {
  const remocaoWrapper = migrationRestauracao.indexOf(
    "DROP FUNCTION public.salvar_estrutura_automacao_fluxo_atomica("
  );
  const restauracaoOriginal = migrationRestauracao.indexOf(
    "ALTER FUNCTION public.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza("
  );

  assert.ok(remocaoWrapper >= 0);
  assert.ok(restauracaoOriginal > remocaoWrapper);
  assert.match(
    migrationRestauracao,
    /RENAME TO salvar_estrutura_automacao_fluxo_atomica;/
  );
  assert.doesNotMatch(
    migrationRestauracao,
    /DELETE\s+FROM\s+public\.automacao_(nos|conexoes)/i
  );
});

test("a funcao restaurada continua acessivel ao service role", () => {
  assert.match(
    migrationRestauracao,
    /GRANT EXECUTE ON FUNCTION public\.salvar_estrutura_automacao_fluxo_atomica[\s\S]+TO service_role;/
  );
  assert.match(migrationRestauracao, /NOTIFY pgrst, 'reload schema';/);
});
