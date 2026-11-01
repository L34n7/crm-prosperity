import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidarInteressesIdentificadosIa } from "../src/lib/agentes-ia/interesses-identificados.ts";

const id = "conversa-autorizada";
const autorizadas = new Set([id]);

test("apresenta interesses do estado histórico sem exigir captura permanente", () => {
  const resultado = consolidarInteressesIdentificadosIa([
    { conversa_id: id, updated_at: "2026-10-20T12:00:00Z", estado_json: { interesses: ["WhatsApp oficial", "  Disparos  "] } },
  ], [], autorizadas);
  assert.equal(resultado.length, 2);
  assert.ok(resultado.every(item => item.origem === "historico" && item.conversa_id === id));
  assert.ok(resultado.every(item => item.tipo_data === "atualizacao_estado"));
});

test("prefere a captura permanente e deduplica texto com acentos e caixa", () => {
  const estados = [{ conversa_id: id, updated_at: "2026-10-19T12:00:00Z", estado_json: { interesses: ["Automação comercial"] } }];
  const capturas = [{ id: "1", valor: "interesse/preferências coletado pelo Agente IA: automacao comercial", capturado_em: "2026-10-20T12:00:00Z", metadata_json: { conversa_id: id } }];
  const resultado = consolidarInteressesIdentificadosIa(estados, capturas, autorizadas);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].origem, "captura");
  assert.equal(resultado[0].texto, "automacao comercial");
});

test("não revela estados nem vínculos de conversas fora do contato autorizado", () => {
  const resultado = consolidarInteressesIdentificadosIa([
    { conversa_id: "conversa-de-outra-empresa", updated_at: null, estado_json: { interesses: ["Privado"] } },
    { conversa_id: id, updated_at: null, estado_json: { interesses: ["Permitido"] } },
  ], [{ id: "2", valor: "Preferência pessoal", capturado_em: null, metadata_json: { conversa_id: "conversa-de-outra-empresa" } }], autorizadas);
  assert.equal(resultado.length, 2);
  assert.ok(resultado.every(item => item.texto !== "Privado"));
  assert.equal(resultado.find(item => item.origem === "captura")?.conversa_id, null);
});

test("ignora entradas malformadas e não duplica repetição no mesmo estado", () => {
  const resultado = consolidarInteressesIdentificadosIa([
    { conversa_id: id, updated_at: "2026-10-21T12:00:00Z", estado_json: { interesses: ["CRM", " crm ", null, 101, "", "  "] } },
    { conversa_id: id, updated_at: "2026-10-20T12:00:00Z", estado_json: { interesses: "não é lista" } },
  ], [], autorizadas);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].texto, "CRM");
});
