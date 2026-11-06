import assert from "node:assert/strict";
import test from "node:test";
import {
  clientePediuCotacaoVeicular,
  clienteCancelouCotacao,
  consolidarDadosCotacao,
  dadosEssenciaisCotacaoConfirmados,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";

test("declaração de veículo inicia cotação mesmo sem a palavra cotação",()=>{
  assert.equal(clientePediuCotacaoVeicular("Eu tenho um vectra 2002"),true);
  assert.equal(clientePediuCotacaoVeicular("Tenho um Palio 2010"),true);
  const inicio=consolidarDadosCotacao(["Eu tenho um vectra 2002"]);
  assert.equal(inicio.modelo,"vectra");
  assert.equal(inicio.ano_modelo,"2002");
  assert.equal(inicio.uso,null);
  const completo=consolidarDadosCotacao(["Eu tenho um vectra 2002","Particular"],inicio);
  assert.equal(completo.uso,"particular");
  assert.equal(dadosEssenciaisCotacaoConfirmados(completo),true);
});
test("pergunta de preço continua habilitando cotação",()=>{
  assert.equal(clientePediuCotacaoVeicular("Quanto fica o seguro do meu vectra 2002"),true);
  assert.equal(clientePediuCotacaoVeicular("Quero fazer de outro carro"),true);
});
test("desistência cancela uma seleção pendente sem pedir nova versão",()=>{
  const mensagens=[
    "Não, deixa pra lá",
    "Não, deixa pra lá\nEu não uso esse carro",
    "Desisto da cotação",
    "Pode cancelar essa cotação",
    "Deixa quieto",
  ];
  for(const mensagem of mensagens){
    assert.equal(clienteCancelouCotacao(mensagem),true,mensagem);
    assert.equal(clientePediuCotacaoVeicular(mensagem),false,mensagem);
  }
});
test("correção de versão não é desistência",()=>{
  for(const mensagem of ["Não é essa versão, é outra","Não é automático","Quero cotar outro carro"]){
    assert.equal(clienteCancelouCotacao(mensagem),false,mensagem);
  }
});
