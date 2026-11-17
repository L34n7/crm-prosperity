import assert from "node:assert/strict";
import test from "node:test";
import {
  selecionarMensagensRecebidasDistintas,
  type MensagemRecebidaAutomacao,
} from "../src/lib/agentes-ia/mensagens-recebidas-distintas.ts";

const conversa = "conversa-henrique";
const texto = "Olá! Tenho interesse em conhecer os produtos ou serviços. Pode me passar mais informações?";

function mensagem(id: string, overrides: Partial<MensagemRecebidaAutomacao> = {}): MensagemRecebidaAutomacao {
  return {
    id, conversa_id: conversa, remetente_tipo: "contato", mensagem_externa_id: `wamid.${id}`,
    conteudo: texto, tipo_mensagem: "texto", created_at: "2026-11-17T14:43:00Z", ...overrides,
  };
}

test("uma única mensagem recebida conta apenas uma vez", () => {
  assert.equal(selecionarMensagensRecebidasDistintas([mensagem("1")], conversa, 10).length, 1);
});

test("caso Henrique: dois webhooks do mesmo wamid não criam uma repetição", () => {
  const recebidas = [
    mensagem("recuperada", { mensagem_externa_id: "wamid.henrique", tipo_mensagem: "unsupported" }),
    mensagem("original", { mensagem_externa_id: "wamid.henrique", conteudo: "Olá! Posso ter mais informações sobre isso?" }),
  ];
  const unicas = selecionarMensagensRecebidasDistintas(recebidas, conversa, 10);
  assert.equal(unicas.length, 1);
  assert.equal(unicas[0].id, "original");
});

test("não considera mensagens de outras conversas nem saídas do bot ou atendente", () => {
  const recebidas = [
    mensagem("1"),
    mensagem("2", { conversa_id: "outra-conversa" }),
    mensagem("3", { remetente_tipo: "bot" }),
    mensagem("4", { remetente_tipo: "usuario" }),
  ];
  assert.deepEqual(selecionarMensagensRecebidasDistintas(recebidas, conversa, 10).map((m) => m.id), ["1"]);
});

test("duas mensagens reais do mesmo contato, mesmo conteúdo, permanecem distintas", () => {
  assert.equal(selecionarMensagensRecebidasDistintas([mensagem("1"), mensagem("2")], conversa, 10).length, 2);
});

test("sem wamid usa o ID interno; sem texto no primeiro evento prefere versão recuperada", () => {
  const semWamid = [mensagem("1", { mensagem_externa_id: null }), mensagem("2", { mensagem_externa_id: null })];
  assert.equal(selecionarMensagensRecebidasDistintas(semWamid, conversa, 10).length, 2);
  const revisoes = [mensagem("1", { conteudo: null }), mensagem("2", { mensagem_externa_id: "wamid.1" })];
  assert.equal(selecionarMensagensRecebidasDistintas(revisoes, conversa, 10)[0].id, "2");
});

test("conta só as mais recentes até o limite, mesmo com entregas repetidas", () => {
  const msgs = [
    mensagem("1", { created_at: "2026-11-17T14:43:00Z" }),
    mensagem("2", { created_at: "2026-11-17T14:43:02Z" }),
    mensagem("reentrega", { mensagem_externa_id: "wamid.2", created_at: "2026-11-17T14:43:03Z" }),
  ];
  assert.deepEqual(selecionarMensagensRecebidasDistintas(msgs, conversa, 1).map((m) => m.id), ["reentrega"]);
});
