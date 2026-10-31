import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20261031223000_corrigir_agente_ia_interesses_captura.sql",
  import.meta.url
);

test("captura do interesse usa as colunas válidas e persiste vínculo da conversa no JSON", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.agente_ia_registrar_interesse_preferencia/);
  assert.match(sql, /INSERT INTO public\.contato_informacoes_captura\s*\(\s*empresa_id, contato_id, tipo, nome_campo, sequencia, valor,\s*valor_normalizado,/);
  assert.doesNotMatch(sql, /INSERT INTO public\.contato_informacoes_captura\s*\([^)]*\bconversa_id\b/);
  assert.match(sql, /'conversa_id', p_conversa_id/);
  assert.match(sql, /'tipo_registro', 'interesse_preferencia'/);
});

test("a captura continua idempotente, sincronizada e limitada à empresa", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /c\.empresa_id = p_empresa_id/);
  assert.match(sql, /a\.empresa_id = p_empresa_id/);
  assert.match(sql, /v_normalizado := lower\(regexp_replace/);
  assert.match(sql, /cic\.valor_normalizado = v_normalizado/);
  assert.match(sql, /cic\.ativo = true/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /RETURN QUERY SELECT v_id, v_numero, v_existente/);
});

test("somente o backend pode chamar a função privilegiada", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.agente_ia_registrar_interesse_preferencia[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.agente_ia_registrar_interesse_preferencia[\s\S]*TO service_role/);
});
