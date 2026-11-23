import assert from "node:assert/strict";
import test from "node:test";
import {
  identificarPedidoTransferenciaHumana,
  reconhecerReiteracaoDirecao,
  reiteracaoCurtaDirecao,
} from "../src/lib/agentes-ia/intencao-transferencia-humana.ts";

test("caso Jorge: quero falar com o CEO transfere imediatamente", () => {
  const pedido = identificarPedidoTransferenciaHumana("*QUERO FALAR COM O CEO!!!*");
  assert.equal(pedido?.destino, "direcao");
  assert.equal(pedido?.motivo, "pedido_direto");
});
test("CEO sozinho exige solicitação explícita recente do mesmo contato", () => {
  assert.equal(identificarPedidoTransferenciaHumana("*CEO!!!*"), null);
  assert.equal(reiteracaoCurtaDirecao("*CEO!!!*"), true);
  assert.equal(
    reconhecerReiteracaoDirecao("*CEO!!!*", ["QUERO FALAR COM O CEO!!!"])?.motivo,
    "pedido_reiterado"
  );
  assert.equal(reconhecerReiteracaoDirecao("CEO!!!", ["Eu sou CEO da empresa"]), null);
});
test("todos os cargos pedidos em uma conversa causam encaminhamento", () => {
  for (const t of [
    "Quero falar com o diretor", "Preciso falar com o proprietário",
    "Me encaminha para o gerente, por favor", "Posso conversar com o responsável?",
    "Quero atendimento humano", "Falar com um atendente",
    "Quero falar com uma pessoa de verdade", "Pode me transferir para o suporte",
    "Quero falar com o dono", "Quero falar com o CEO",
  ]) assert.ok(identificarPedidoTransferenciaHumana(t), t);
});
test("recusa explícita à IA solicita humano", () => {
  for(const t of ["NÃO QUERO FALAR COM (IA)!!!!", "Não quero atendimento por robô",
    "Prefiro uma pessoa de verdade"]) {
    assert.equal(identificarPedidoTransferenciaHumana(t)?.destino, "atendimento", t);
  }
});
test("não transferir por menções ou recusas", () => {
  for (const t of [
    "Quem é o CEO da empresa?", "Meu gerente me enviou o link",
    "O CEO aprovou o orçamento", "Não quero falar com o CEO",
    "Não quero ser transferido", "Pode continuar com a IA",
    "Quero saber preço, não precisa transferir",
    "O que significa atendimento humano?",
    "Você conhece o diretor?", "Como configurar gerente de equipe?",
    "Tem vídeo do CEO?", "Pode me passar os valores?",
    "O que significa atendimento humano?", "Não quero atendimento humano",
    "Me passa os valores pro gerente", "Sou o CEO, quero saber preços",
  ]) assert.equal(identificarPedidoTransferenciaHumana(t), null, t);
});
test("pedidos simples e com cortesia são reconhecidos (regressão Igor 23/11)", () => {
  for(const t of [
    "Me transfere", "Pode me transferir?", "Atendente", "Humano",
    "(atendimento humano, por favor)", "Atendimento humano, pfv",
    "Atendimento humano por gentileza", "Oi, atendimento humano por favor",
    "Sobre aluguel de BM, atendimento humano, por favor",
    "Gostaria de atendimento humano, por favor", "Preciso de um atendente",
    "Bom dia, quero falar com um atendente, por favor",
    "Quero um atendente por favor", "Pode me transferir para o gerente?",
  ]) assert.ok(identificarPedidoTransferenciaHumana(t), t);
});

test("não considerar dúvidas sobre atendimento ou pedidos negativos", () => {
  for(const t of [
    "O que significa atendimento humano, por favor?",
    "Como funciona atendimento humano por favor?",
    "Vocês oferecem atendimento humano, por favor?",
    "Não quero atendimento humano por favor",
    "Não me transfira por favor",
    "O que significa atendente?",
    "Qual a diferença entre bot e atendimento humano por favor",
  ]) assert.equal(identificarPedidoTransferenciaHumana(t),null,t);
});
