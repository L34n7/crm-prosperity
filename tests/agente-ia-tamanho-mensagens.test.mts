import assert from "node:assert/strict";
import test from "node:test";
import {
  OPCOES_TAMANHO_MENSAGENS,
  normalizarTamanhoMensagens,
  faixaTamanhoMensagens,
  instrucaoTamanhoMensagens,
  ajustarBaloesGerados,
  ajustarFollowupGerado,
} from "../src/lib/agentes-ia/tamanho-mensagens.ts";

test("cinco faixas em ordem e valor legado usa média", () => {
  assert.deepEqual(OPCOES_TAMANHO_MENSAGENS.map((opcao) => opcao.valor), [
    "curta", "media_curta", "media", "media_longa", "longa",
  ]);
  assert.equal(normalizarTamanhoMensagens(null), "media");
  assert.equal(normalizarTamanhoMensagens("nao_existe"), "media");
  assert.equal(faixaTamanhoMensagens("longa").maximo, 900);
});

test("a instrução vale para respostas e follow-up e não exige mínimo", () => {
  const conversa = instrucaoTamanhoMensagens("curta");
  const followup = instrucaoTamanhoMensagens("curta", true);
  assert.match(conversa, /40 a 150 caracteres/);
  assert.match(conversa, /ferramentas/);
  assert.match(followup, /ÚNICO balão/);
  assert.match(followup, /O mínimo é apenas referência/);
});

test("balão curto original não é modificado", () => {
  const mensagem = "Sim, é possível importar seus contatos.";
  assert.deepEqual(ajustarBaloesGerados([mensagem], "curta"), [mensagem]);
});

test("divide mensagem gerada em frases sem cortar conteúdo", () => {
  const mensagem = [
    "Você pode organizar sua equipe por setores e personalizar os atendimentos.",
    "O agente também responde dúvidas e identifica oportunidades para o comercial.",
    "Quando necessário, o atendente assume a conversa sem perder o contexto.",
  ].join(" ");
  const saida = ajustarBaloesGerados([mensagem], "curta");
  assert.ok(saida.length >= 2 && saida.length <= 3);
  assert.ok(saida.every((item) => item.length <= 150));
  assert.equal(saida.join(" "), mensagem);
});

test("não corta URLs e não descarta conteúdo se três balões não bastarem", () => {
  const grande = ("Uma explicação completa do processo de atendimento. ").repeat(25).trim();
  assert.deepEqual(ajustarBaloesGerados([grande], "curta", 3), [grande]);
  const link = "https://crmprosperity.com/comecar?ref=" + "A".repeat(160);
  const comLink = "Acesse agora: " + link;
  assert.deepEqual(ajustarBaloesGerados([comLink], "curta"), [comLink]);
});

test("o limite do follow-up muda conforme o agente; texto curto é mantido", () => {
  const texto = "Posso te mostrar como organizar os seus atendimentos?";
  assert.equal(ajustarFollowupGerado(texto, "curta", "Outro"), texto);
  const longa = "Conheça nossas soluções. ".repeat(30);
  assert.equal(ajustarFollowupGerado(longa, "curta", "Vamos continuar?"), "Vamos continuar?");
  assert.equal(ajustarFollowupGerado(longa, "longa", "Vamos continuar?"), longa.trim());
});

test("link de checkout é preservado por inteiro no follow-up curto", () => {
  const link = "https://crmprosperity.com/comecar?ref=EMERSONLUI8FA7B4AF2A44F7C3";
  const original = "O CRM ajuda a centralizar seus leads. ".repeat(12) + link;
  const saida = ajustarFollowupGerado(original, "curta", "Quer continuar com a contratação?");
  assert.ok(saida.includes(link));
  assert.ok(saida.length <= 150);
});
