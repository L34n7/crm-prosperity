import assert from "node:assert/strict";
import test from "node:test";
import {
  clientePediuTesteDoCrm,
  contarPedidosDistintosTeste,
  pareceOfertaDoTrial,
  protegerOfertaTesteLeonardo,
  LEONARDO_PROSPERITY_ID,
  type MensagemRecebidaParaTeste,
} from "../src/lib/agentes-ia/protecao-teste-prosperity.ts";

const LINK = "https://crmprosperity.com/comecar?oferta=trial4d&ref=EMERSONLUI8FA7B4AF2A44F7C3";
function msg(id: string, conteudo: string, ext = "wamid."+id): MensagemRecebidaParaTeste {
  return { id, mensagem_externa_id: ext, conteudo };
}
const PEDIDOS = [
  msg("a", "Como eu faço um teste?"),
  msg("b", "Queria esse daí se eu gostar"),
  msg("c", "Posso testar o CRM antes de pagar?"),
  msg("d", "Mesmo assim quero fazer um teste"),
];
function proteger(mensagens: string[], recebidas: MensagemRecebidaParaTeste[], ultima: string, agenteId=LEONARDO_PROSPERITY_ID) {
  return protegerOfertaTesteLeonardo({agenteId, mensagens, mensagensRecebidas: recebidas, ultimaMensagemDoContato: ultima});
}

test("caso real do contato: primeiro pedido nao libera trial; frase de interesse nao soma",()=>{
  assert.equal(contarPedidosDistintosTeste(PEDIDOS.slice(0,2)),1);
  const saida=proteger(["O teste de 4 dias está disponível no Básico.", "Acesse: "+LINK],PEDIDOS.slice(0,2),"Como eu faço um teste?");
  assert.equal(saida.length,1);
  assert.ok(!saida.join(" ").includes("trial4d"));
  assert.ok(!saida.join(" ").includes("4 dias"));
});

test("segundo pedido explicito ainda nao libera o link",()=>{
  const entrada=PEDIDOS.slice(0,3);
  const saida=proteger([LINK],entrada,"Posso testar o CRM antes de pagar?");
  assert.ok(!saida.join(" ").includes("trial4d"));
});

test("terceiro pedido em mensagem distinta libera a oferta do Básico",()=>{
  const entrada=PEDIDOS;
  assert.equal(contarPedidosDistintosTeste(entrada),3);
  assert.deepEqual(proteger(["O plano Básico tem teste de 4 dias.",LINK],entrada,String(entrada[3].conteudo || "")),["O plano Básico tem teste de 4 dias.",LINK]);
});

test("mensagens duplicadas com mesmo wamid contam uma vez",()=>{
  const recebidas=[msg("x","Quero fazer um teste","wamid.repetido"),msg("y","Quero fazer um teste","wamid.repetido"),msg("z","Posso testar o CRM?")];
  assert.equal(contarPedidosDistintosTeste(recebidas),2);
  assert.ok(!proteger([LINK],recebidas,"Posso testar o CRM?").join("").includes("trial4d"));
});

test("followup nao oferece trial, mesmo que existam tres pedidos anteriores",()=>{
  assert.ok(!proteger([LINK],PEDIDOS,"").join("").includes("trial4d"));
});

test("nao contar referencia a teste tecnico nem so mencao casual",()=>{
  for(const texto of ["Queria esse daí se eu gostar","Como funciona o teste de disparos?","Quero testar o template","Já fiz o teste e deu erro","Não quero testar agora","Quero ver a demonstração","Tem vídeo do sistema?"]){
    assert.equal(clientePediuTesteDoCrm(texto),false,texto);
  }
  for(const texto of ["Como eu faço um teste","Posso testar?","Gostaria de experimentar o CRM","Me manda o link do teste","Tem teste gratuito?","Quero testar o CRM por 4 dias"]){
    assert.equal(clientePediuTesteDoCrm(texto),true,texto);
  }
});

test("nao bloquear demonstracao ou checkout normal, nem alterar outro agente",()=>{
  const normal=["Aqui está o vídeo de teste de disparos: https://www.youtube.com/watch?v=mTdZoPeCe3I","Para contratar: https://crmprosperity.com/comecar?ref=EMERSONLUI8FA7B4AF2A44F7C3"];
  assert.ok(normal.every(x=>!pareceOfertaDoTrial(x)));
  assert.deepEqual(proteger(normal,[], ""),normal);
  assert.deepEqual(proteger([LINK],[],"","outro-agente"),[LINK]);
});
