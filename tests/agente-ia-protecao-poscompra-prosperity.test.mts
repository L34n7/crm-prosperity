import assert from "node:assert/strict";
import test from "node:test";
import { protegerRespostaPosCompraProsperity } from "../src/lib/agentes-ia/protecao-poscompra-prosperity.ts";
const LEONARDO="512da872-07df-49b6-87fe-dfec84c271c6";
const outro="00000000-0000-0000-0000-000000000001";
const erro=["Sim! Você acessa pelo checkout: https://crmprosperity.com/comecar?ref=EMERSONLUI8FA7B4AF2A44F7C3"];

test("caso real: após comprar, nunca enviar link de cadastro como login",()=>{
  const saida=protegerRespostaPosCompraProsperity({
    agenteId:LEONARDO,ultimaMensagemCliente:"Pronto, como faço agora pra acessar?",mensagens:erro,
  });
  assert.match(saida.join(" "),/crmprosperity\.com\/login/);
  assert.doesNotMatch(saida.join(" "),/crmprosperity\.com\/comecar/);
});
test("usuário já logado recebe orientação de configuração",()=>{
  const saida=protegerRespostaPosCompraProsperity({
    agenteId:LEONARDO,ultimaMensagemCliente:"Já fiz login, por onde configuro?",mensagens:erro,
  });
  assert.match(saida.join(" "),/crmprosperity\.com\/configurar-ambiente/);
});
test("respostas corretas do próprio agente são preservadas",()=>{
  const correto=["Entre em https://crmprosperity.com/login"];
  assert.deepEqual(protegerRespostaPosCompraProsperity({agenteId:LEONARDO,
    ultimaMensagemCliente:"Pronto, como faço agora pra acessar?",mensagens:correto}),correto);
});
test("checkout continua disponível na etapa de compra e em outros agentes",()=>{
  assert.deepEqual(protegerRespostaPosCompraProsperity({agenteId:LEONARDO,
    ultimaMensagemCliente:"Quero contratar agora",mensagens:erro}),erro);
  assert.deepEqual(protegerRespostaPosCompraProsperity({agenteId:outro,
    ultimaMensagemCliente:"Pronto, como faço agora pra acessar?",mensagens:erro}),erro);
});
