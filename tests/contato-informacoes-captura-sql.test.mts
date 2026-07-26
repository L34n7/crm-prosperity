import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260726054733_contato_informacoes_captura.sql",
  import.meta.url
);
const indexesMigrationUrl = new URL(
  "../supabase/migrations/20260726055900_contato_informacoes_captura_indices.sql",
  import.meta.url
);

test("migração cria a estrutura, origem e auditoria das capturas", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const trecho of [
    "create table if not exists public.contato_informacoes_captura",
    "empresa_id uuid not null references public.empresas",
    "contato_id uuid not null references public.contatos",
    "fluxo_id uuid references public.automacao_fluxos",
    "no_id uuid references public.automacao_nos",
    "execucao_id uuid references public.automacao_execucoes",
    "variavel_origem text",
    "capturado_em timestamptz",
    "atualizado_em timestamptz",
    "criado_por uuid references public.usuarios",
    "atualizado_por uuid references public.usuarios",
    "excluido_em timestamptz",
    "excluido_por uuid references public.usuarios",
    "metadata_json jsonb",
  ]) {
    assert.match(sql, new RegExp(trecho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("migração mantém sequência estável e bloqueia duplicidades ativas", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /contato_informacoes_captura_sequencia_unique/);
  assert.match(sql, /coalesce\(max\(informacao\.sequencia\), -1\) \+ 1/);
  assert.match(sql, /where informacao\.empresa_id = new\.empresa_id/);
  assert.match(sql, /contato_informacoes_captura_valor_ativo_unique/);
  assert.match(sql, /valor_normalizado[\s\S]*where ativo = true/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test("migração protege a tabela com RLS por empresa", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /alter table public\.contato_informacoes_captura enable row level security/
  );
  assert.match(sql, /to authenticated[\s\S]*using \([\s\S]*usuario_empresa_id_atual/);
  assert.match(
    sql,
    /revoke all on table public\.contato_informacoes_captura[\s\S]*anon, authenticated/
  );
  assert.match(
    sql,
    /grant all on table public\.contato_informacoes_captura[\s\S]*to service_role/
  );
});

test("migração complementar indexa as chaves estrangeiras operacionais", async () => {
  const sql = await readFile(indexesMigrationUrl, "utf8");

  for (const indice of [
    "contato_informacoes_captura_contato_idx",
    "contato_informacoes_captura_no_idx",
    "contato_informacoes_captura_execucao_idx",
    "contato_informacoes_captura_criado_por_idx",
    "contato_informacoes_captura_atualizado_por_idx",
    "contato_informacoes_captura_excluido_por_idx",
  ]) {
    assert.match(sql, new RegExp(indice));
  }
});
