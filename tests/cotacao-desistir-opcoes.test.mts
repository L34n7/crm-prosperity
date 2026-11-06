import assert from "node:assert/strict";
import test from "node:test";
import {
  clienteRejeitouVersoesFipe, novoModeloForaDaLista,
} from "../src/lib/agentes-ia/reorientacao-versoes-cotacao.ts";
import {
  clienteCancelouCotacao, consolidarDadosCotacao,
  validarDadosNovosCotacao,DADOS_COTACAO_VAZIOS, acabamentoIsoladoCotacao,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";

const opcoesErradas=[
  "S10 Pick-Up LTZ 2.8 TDI 4x4 CD Dies.Aut",
  "COBALT LTZ 1.4 8V FlexPower/EconoFlex 4p",
  "ONIX HATCH LTZ 1.0 12V TB Flex 5p Aut.",
  "TRACKER LTZ 1.2 Turbo 12V Flex Aut.",
];
test("nenhuma opção da FIPE: não insistir na lista de carros de outras famílias",()=>{
  for(const msg of ["Nenhuma dessas","Não tem aí","Não quero esse","Não aparece"]){
    assert.equal(clienteRejeitouVersoesFipe(msg),true,msg);
    assert.equal(novoModeloForaDaLista(msg,opcoesErradas),null,msg);
  }
  assert.equal(clienteRejeitouVersoesFipe("LTZ"),false);
});
test("identificação explícita de outro modelo permite sair da lista errada",()=>{
  for(const msg of ["Cruze","Meu carro é um Cruze","Meu caro é um cruze"]){
    assert.equal(novoModeloForaDaLista(msg,opcoesErradas),"cruze",msg);
  }
  for(const msg of ["LTZ","Particular","16V","2020","automático"]){
    assert.equal(novoModeloForaDaLista(msg,opcoesErradas),null,msg);
  }
});
test("desistir é diferente de rejeitar opções; não reabrir automaticamente",()=>{
  assert.equal(clienteCancelouCotacao("Não quero mais"),true);
  assert.equal(clienteCancelouCotacao("Desisto"),true);
  assert.equal(clienteCancelouCotacao("Não quero esse"),false);
});
test("uso no dia a dia não pode virar nome de modelo; modelo informado depois prevalece",()=>{
  const msgs=[
    "Quero fazer outra cotação",
    "Eu uso esse carro no dia a dia",
    "Vou usar no dia a dia",
    "LTZ",
    "2020",
    "Particular uai",
    "Cruze",
  ];
  const dados=consolidarDadosCotacao(msgs);
  assert.equal(dados.modelo,"cruze");
  assert.equal(dados.ano_modelo,"2020");
  assert.equal(dados.uso,"particular");
  const velho=consolidarDadosCotacao(["Meu carro é um Cruze"],{
    ...DADOS_COTACAO_VAZIOS,modelo:"dia dia",ano_modelo:"2020",uso:"particular",
  });
  assert.equal(velho.modelo,"cruze");
});
test("LTZ sozinho não autoriza cotar um Chevrolet diferente",()=>{
 const msgs=["Quero fazer outra cotação","LTZ","2020","Particular"];
 assert.equal(
  validarDadosNovosCotacao(msgs,"LTZ","2020","particular"),
  "Qual é o modelo do novo veículo?",
 );
 assert.equal(
  validarDadosNovosCotacao([...msgs,"Cruze"],"Cruze LTZ","2020","particular"),
  null,
 );
});

test("acabamento só complementa a família do carro explicitamente citada",()=>{
 for(const v of ["LTZ","GLS","XLT","LX"])assert.equal(acabamentoIsoladoCotacao(v),true,v);
 for(const v of ["Cruze","dia a dia","Particular","2020"])assert.equal(acabamentoIsoladoCotacao(v),false,v);
});
