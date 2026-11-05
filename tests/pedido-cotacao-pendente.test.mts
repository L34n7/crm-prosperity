import assert from "node:assert/strict";
import test from "node:test";
import {
  clientePediuCotacaoVeicular,
  confirmouProsseguirCotacao,
  validarDadosNovosCotacao,
  modeloComDadosConfirmados,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";

test("reconhece cotação solicitada para o carro de outra pessoa",()=>{
  assert.equal(clientePediuCotacaoVeicular("quero cotar o carro do meu tio"),true);
  assert.equal(clientePediuCotacaoVeicular("Quanto fica o seguro do meu civic"),true);
  assert.equal(clientePediuCotacaoVeicular("Quero outro"),true);
  assert.equal(clientePediuCotacaoVeicular("Quero cotar outro veículo"),true);
  assert.equal(clientePediuCotacaoVeicular("Qual o valor da cotação anterior?"),false);
  assert.equal(clientePediuCotacaoVeicular("Qual a diferença do plano completo?"),false);
});

test("pedido HR-V em mensagens separadas tem todos os dados necessários",()=>{
  const mensagens=["quero cotar o carro do meu tio","Hrv","2015","Particular"];
  assert.equal(validarDadosNovosCotacao(mensagens,"Honda HR-V","2015","particular"),null);
  assert.equal(modeloComDadosConfirmados(mensagens,"Honda HR-V EX 1.8 Aut."),"HR-V");
});

test("Quero outro não reutiliza veículo nem ano de proposta anterior",()=>{
  assert.equal(validarDadosNovosCotacao(["Quero outro"],"Honda Civic","2015","particular"),
    "Qual é o modelo do novo veículo?");
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox 2010"],"Honda Civic","2015","particular"),
    "Qual é o modelo do novo veículo?");
});

test("nova cotação pede apenas informação ainda não fornecida",()=>{
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox 2010"],"Fox","2010","particular"),
    "Qual é a finalidade de uso do novo veículo: particular, aplicativo, táxi ou comercial?");
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox","Particular"],"Fox","2010","particular"),
    "Qual é o ano-modelo do novo veículo?");
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox 2010","Particular"],"Fox","2010","particular"),null);
});

test("não incluir motorização e acabamento presumidos pelo modelo",()=>{
  assert.equal(modeloComDadosConfirmados(["Quero outro","Fox 2010","Particular"],
    "Volkswagen Fox 1.0 Mi Total Flex 8V 3p"),"Fox");
  assert.equal(modeloComDadosConfirmados(["Outra cotação","Ranger 2.8 4x4","2005","Particular"],
    "Ford Ranger 2.8 4x4 Diesel"),"Ranger 2.8 4x4");
});

test("permite confirmação de pedido ativo sem iniciar outro",()=>{
  assert.equal(confirmouProsseguirCotacao("Ok"),true);
  assert.equal(confirmouProsseguirCotacao("Pode gerar"),true);
  assert.equal(confirmouProsseguirCotacao("Pode cotar"),true);
  assert.equal(confirmouProsseguirCotacao("Quero outro"),false);
});

test("ano fabricação/modelo usa último ano",()=>{
  assert.equal(validarDadosNovosCotacao(["Quero cotar","Fox 2004/2005","Particular"],
    "Fox","2004/2005","particular"),null);
});
