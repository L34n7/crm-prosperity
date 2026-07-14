import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202607140005_limpar_nos_conexoes_inativos_ao_salvar.sql",
    import.meta.url
  ),
  "utf8"
);

const migrationLimpezaLegado = readFileSync(
  new URL(
    "../supabase/migrations/202607140006_limpar_nos_conexoes_inativos_ate_dia_13.sql",
    import.meta.url
  ),
  "utf8"
);

test("limpa os registros inativos dentro do salvamento atomico", () => {
  const chamadaSalvamento = migration.indexOf(
    "salvar_estrutura_automacao_fluxo_atomica_sem_limpeza("
  );
  const exclusaoConexoes = migration.indexOf(
    "DELETE FROM public.automacao_conexoes"
  );
  const exclusaoNos = migration.indexOf("DELETE FROM public.automacao_nos");

  assert.ok(chamadaSalvamento >= 0);
  assert.ok(exclusaoConexoes > chamadaSalvamento);
  assert.ok(exclusaoNos > exclusaoConexoes);
});

test("restringe a limpeza aos inativos da empresa e do fluxo salvos", () => {
  const filtrosEsperados = /WHERE empresa_id = p_empresa_id\s+AND fluxo_id = p_fluxo_id\s+AND ativo = false/g;

  assert.equal(Array.from(migration.matchAll(filtrosEsperados)).length, 2);
});

test("mantem a funcao interna inacessivel ao service role", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.salvar_estrutura_automacao_fluxo_atomica_sem_limpeza[\s\S]+FROM service_role;/
  );
});

test("limpa o legado inativo ate o fim do dia 13 em Sao Paulo", () => {
  assert.match(
    migrationLimpezaLegado,
    /2026-07-14 00:00:00 America\/Sao_Paulo/
  );
  assert.equal(
    Array.from(
      migrationLimpezaLegado.matchAll(/\.ativo IS FALSE/g)
    ).length,
    2
  );
  assert.equal(
    Array.from(
      migrationLimpezaLegado.matchAll(
        /COALESCE\([^\n]+\.updated_at, [^\n]+\.created_at\) < v_limite/g
      )
    ).length,
    2
  );
});

test("remove conexoes antigas antes dos nos e preserva nos ainda referenciados", () => {
  const exclusaoConexoes = migrationLimpezaLegado.indexOf(
    "DELETE FROM public.automacao_conexoes"
  );
  const exclusaoNos = migrationLimpezaLegado.indexOf(
    "DELETE FROM public.automacao_nos"
  );

  assert.ok(exclusaoConexoes >= 0);
  assert.ok(exclusaoNos > exclusaoConexoes);
  assert.match(migrationLimpezaLegado, /AND NOT EXISTS \(/);
  assert.match(migrationLimpezaLegado, /no_origem_id = no\.id/);
  assert.match(migrationLimpezaLegado, /no_destino_id = no\.id/);
});
