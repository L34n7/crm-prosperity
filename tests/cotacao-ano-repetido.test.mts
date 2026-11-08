import assert from "node:assert/strict";
import test from "node:test";
import {
  consolidarDadosCotacao, DADOS_COTACAO_VAZIOS,
  mensagensDoPedidoCotacao, validarDadosNovosCotacao,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";

const historicoPedido=[
  "Quero fazer uma cotação",
  "Como funciona o seguro",
  "Xre 300",
  "2000",
  "2010",
];

test("XRE 300: após ano inválido 2000 e correção 2010, uso particular gera prosseguimento",()=>{
  const persistidasAntigas=[
    "Vamos fazer outra cotação","Cbr 650r","2020",
    "Boa tarde","Quero fazer uma cotação",
    "Como funciona o seguro","Xre 300","2000","2010",
  ];
  const mensagens=mensagensDoPedidoCotacao({
    historico:historicoPedido,
    persistidas:persistidasAntigas,
    atual:"Particular",
  });
  assert.deepEqual(mensagens,[...historicoPedido,"Particular"]);
  const dados=consolidarDadosCotacao(mensagens,DADOS_COTACAO_VAZIOS);
  assert.deepEqual(dados,{
    modelo:"xre 300",ano_modelo:"2010",uso:"particular",
  });
  assert.equal(validarDadosNovosCotacao(mensagens,
    "XRE 300","2010","particular",true),null);
});

test("repetir o mesmo ano não reabre a pergunta e não altera o modelo",()=>{
  const historico=[...historicoPedido,"Particular"];
  const mensagens=mensagensDoPedidoCotacao({
    historico,persistidas:["Xre 300","2020","2000","2010","Particular"],
    atual:"2010",
  });
  assert.equal(mensagens.filter(item=>item==="2010").length,1);
  assert.equal(mensagens.at(-1),"2010");
  const dados=consolidarDadosCotacao(mensagens,DADOS_COTACAO_VAZIOS);
  assert.equal(dados.modelo,"xre 300");
  assert.equal(dados.ano_modelo,"2010");
  assert.equal(dados.uso,"particular");
  assert.equal(validarDadosNovosCotacao(
    mensagens,"XRE 300","2010","particular",true),null);
});

test("correção posterior de 2010 para 2023 prevalece sobre o ano anterior",()=>{
  const mensagens=mensagensDoPedidoCotacao({
    historico:[...historicoPedido,"Particular","Já disse"],
    persistidas:["2020","Cbr 650r","2010","Particular"],
    atual:"2023",
  });
  const dados=consolidarDadosCotacao(mensagens,DADOS_COTACAO_VAZIOS);
  assert.equal(dados.modelo,"xre 300");
  assert.equal(dados.ano_modelo,"2023");
  assert.equal(dados.uso,"particular");
  assert.equal(validarDadosNovosCotacao(
    mensagens,"XRE 300","2023","particular",true),null);
  assert.equal(validarDadosNovosCotacao(
    mensagens,"XRE 300","2010","particular",true),
    "Qual é o ano-modelo do novo veículo?");
});

test("perguntas gerais e reclamações não são gravadas como modelos",()=>{
  const dados=consolidarDadosCotacao([
    "Quero fazer uma cotação",
    "Como funciona o seguro",
    "Boa tarde","Já disse",
  ],DADOS_COTACAO_VAZIOS);
  assert.equal(dados.modelo,null);
  assert.equal(dados.ano_modelo,null);
});

test("fallback de histórico paginado preserva dados do pedido em andamento",()=>{
  const persistidas=["Xre 300","2000","2010","Particular"];
  const mensagens=mensagensDoPedidoCotacao({
    historico:[],persistidas,atual:"Já disse",
  });
  const dados=consolidarDadosCotacao(mensagens,DADOS_COTACAO_VAZIOS);
  assert.equal(dados.modelo,"xre 300");
  assert.equal(dados.ano_modelo,"2010");
  assert.equal(dados.uso,"particular");
  assert.equal(validarDadosNovosCotacao(
    mensagens,"XRE 300","2010","particular",true),null);
});
