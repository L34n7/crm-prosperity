import assert from "node:assert/strict";
import test from "node:test";
import {
  regrasGeraisBackend,regrasPorFerramentaNegocio,
} from "../src/lib/agentes-ia/prompts-backend.ts";
import {
  mencionouNovoVeiculoAposCotacao,consolidarDadosCotacao,
  DADOS_COTACAO_VAZIOS,validarDadosNovosCotacao,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";
import {
  modelosCompativeisFipe,modelosDaMesmaFamiliaFipe,
} from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";

test("prompt geral nao mistura instrucoes de ferramentas especializadas",()=>{
  const geral=regrasGeraisBackend().join(" ");
  assert.match(geral,/PT-BR/);
  assert.doesNotMatch(geral,/FIPE|cota(?:ção|cao)|realizar_venda|estoque/i);
  const cotacao=regrasPorFerramentaNegocio(
    new Set(["gerar_cotacao_veicular"]),true,
  ).join(" ");
  assert.match(cotacao,/FIPE|cota(?:ção|cao)/i);
  assert.doesNotMatch(cotacao,/realizar_venda/);
  const foraContexto=regrasPorFerramentaNegocio(
    new Set(["gerar_cotacao_veicular"]),false,
  ).join(" ");
  assert.doesNotMatch(foraContexto,/FIPE|cota(?:ção|cao)/i);
  const estoque=regrasPorFerramentaNegocio(
    new Set(["consultar_produtos_estoque"]),true,
  ).join(" ");
  assert.match(estoque,/estoque/i);
  assert.doesNotMatch(estoque,/FIPE|realizar_venda/i);
  const imobiliario=regrasPorFerramentaNegocio(
    new Set(["consultar_imoveis"]),true,
  ).join(" ");
  assert.match(imobiliario,/Imóveis/);
  assert.doesNotMatch(imobiliario,/FIPE|estoque/i);
});

test("apos proposta, modelo isolado abre um novo pedido sem frase explicita",()=>{
  for(const mensagem of [
    "Soortage","Sportage 2015","Kia Sportage","A3","BMW 320","Fiorino",
  ])assert.equal(mencionouNovoVeiculoAposCotacao(mensagem),true,mensagem);
  for(const mensagem of [
    "2015","Particular","Comercial","Ok","Já disse","Legal","Sport",
    "Qual o valor da franquia?","Quanto custa o seguro?",
    "Legal, agora quero fazer outra cotação",
    "Quero saber como funciona o seguro",
  ])assert.equal(mencionouNovoVeiculoAposCotacao(mensagem),false,mensagem);
});

test("Soortage 2015 particular e correção posterior de grafia mantêm dados",()=>{
  const mensagens=["Soortage","2015","Particular"];
  const inicial=consolidarDadosCotacao(mensagens,DADOS_COTACAO_VAZIOS);
  assert.deepEqual(inicial,{
    modelo:"soortage",ano_modelo:"2015",uso:"particular",
  });
  assert.equal(validarDadosNovosCotacao(
    mensagens,"Sportage","2015","particular",true,
  ),null);
  const revisado=consolidarDadosCotacao(
    [...mensagens,"Sportage 2015","Kia sportage"],DADOS_COTACAO_VAZIOS,
  );
  assert.deepEqual(revisado,{
    modelo:"sportage",ano_modelo:"2015",uso:"particular",
  });
});

test("falar de nova cotacao nao grava palavra social como nome de veiculo",()=>{
  const atual=consolidarDadosCotacao([
    "Legal, agora quero fazer outra cotação","Audio a3","2013","Audi a3",
  ],DADOS_COTACAO_VAZIOS);
  assert.equal(atual.modelo,"a3");
  assert.equal(atual.ano_modelo,"2013");
  assert.equal(atual.uso,null);
});

test("a familia A3 nao pode oferecer A1, A6 nem A7",()=>{
  const catalogo=[
    {code:"a1",name:"A1 Sport 1.4 TFSI"},
    {code:"a3s",name:"A3 Sport 1.8 TFSI"},
    {code:"a3b",name:"A3 Sportback 2.0 TFSI"},
    {code:"a6",name:"A6 Sportback 3.0 TFSI"},
    {code:"a7",name:"A7 Sportback 3.0 TFSI"},
    {code:"q5",name:"Q5 2.0 TFSI"},
  ];
  assert.deepEqual(modelosCompativeisFipe(catalogo,"A3")
    .map(v=>v.code),["a3s","a3b"]);
  assert.deepEqual(modelosDaMesmaFamiliaFipe(catalogo,"A3 Sportback")
    .map(v=>v.code),["a3s","a3b"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"A3 Sportback")
    .map(v=>v.code),["a3b"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"A1")
    .map(v=>v.code),["a1"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"Q5")
    .map(v=>v.code),["q5"]);
});
