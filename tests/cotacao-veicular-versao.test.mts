import assert from "node:assert/strict";
import test from "node:test";
import { modelosCompativeisFipe } from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";
import {
  clienteCorrigiuVersaoCotacao,
  motorizacaoCorrigidaCotacao,
  aplicarMotorizacaoCorrigida,
  versaoCorrigidaFoiInformada,
  cambioInformadoCotacao,
  aplicarCambioInformado,
  mensagemSocialSemDadosCotacao,
} from "../src/lib/agentes-ia/correcao-cotacao.ts";

const onix = [
  {code:"a",name:"ONIX HATCH LTZ 1.4 8V FlexPower 5p Aut."},
  {code:"m",name:"ONIX HATCH LTZ 1.4 8V FlexPower 5p Mec."},
  {code:"lt",name:"ONIX HATCH LT 1.4 8V FlexPower 5p Aut."},
  {code:"joy",name:"ONIX HATCH Joy 1.0 8V Flex 5p Mec."},
];

test("Onix LTZ 1.4 automatico nunca seleciona a versao manual", () => {
  assert.deepEqual(
    modelosCompativeisFipe(onix,"Onix LTZ 1.4 automático").map((v)=>v.code),
    ["a"],
  );
  assert.deepEqual(
    modelosCompativeisFipe(onix,"Onix LTZ 1.4 Aut.").map((v)=>v.code),
    ["a"],
  );
});
test("Onix LTZ 1.4 manual nunca seleciona a versao automatica", () => {
  assert.deepEqual(
    modelosCompativeisFipe(onix,"Onix LTZ 1.4 manual").map((v)=>v.code),
    ["m"],
  );
  assert.deepEqual(
    modelosCompativeisFipe(onix,"Onix LTZ 1.4 Mec.").map((v)=>v.code),
    ["m"],
  );
});
test("quando cambio nao informado, preserva a ambiguidade FIPE", () => {
  assert.deepEqual(
    modelosCompativeisFipe(onix,"Onix LTZ 1.4").map((v)=>v.code),
    ["a","m"],
  );
});
test("motorizacao diferente nao seleciona uma versao por aproximacao", () => {
  const tiguan = [
    {code:"20",name:"TIGUAN 2.0 TSI 16V 200cv Tiptronic 5p"},
    {code:"14",name:"TIGUAN 1.4 TSI 16V 150cv Aut. 5p"},
  ];
  assert.deepEqual(modelosCompativeisFipe(tiguan,"Tiguan 1.4").map((v)=>v.code),["14"]);
  assert.deepEqual(modelosCompativeisFipe(tiguan,"Tiguan 2.0").map((v)=>v.code),["20"]);
  assert.deepEqual(modelosCompativeisFipe([tiguan[0]],"Tiguan 1.4"),[]);
});
test("detecta correcao da Tiguan e preserva novo motor entre mensagens", () => {
  const mensagens = [
    "Quero fazer outra cotação",
    "Tiguan 2016",
    "Particular",
    "Não é esse modelo",
    "1.4",
    "Pode enviar",
  ];
  assert.equal(clienteCorrigiuVersaoCotacao("Não é esse modelo"),true);
  assert.equal(motorizacaoCorrigidaCotacao(mensagens),"1.4");
  assert.equal(versaoCorrigidaFoiInformada(mensagens),true);
  assert.equal(aplicarMotorizacaoCorrigida("Tiguan 2.0","1.4"),"Tiguan 1.4");
  assert.equal(aplicarMotorizacaoCorrigida("Tiguan","1.4"),"Tiguan 1.4");
});
test("rejeicao sem versao corrigida nao permite cotacao presumida", () => {
  assert.equal(versaoCorrigidaFoiInformada(["Tiguan 2016","Não é esse modelo"]),false);
  assert.equal(clienteCorrigiuVersaoCotacao("Qual a diferença do Premium?"),false);
  assert.equal(clienteCorrigiuVersaoCotacao("Quero contratar o Completo"),false);
});


test("Vectra GLS Challenge 2.2 manual 2000 encontra nome FIPE sem câmbio explícito", () => {
  const vectra=[
    {code:"gl-milenium", name:"Vectra GL 2.2 MPFI Milenium"},
    {code:"gls-challenge",name:"Vectra GLS/ Challenge 2.2 MPFI 16V"},
    {code:"gls-express",name:"Vectra GLS/Expres.2.2/ 2.0 e 2.0 CD 8V"},
  ];
  assert.deepEqual(
    modelosCompativeisFipe(vectra,"Vectra GLS/Challenge 2.2 manual").map((v)=>v.code),
    ["gls-challenge"],
  );
  assert.deepEqual(
    modelosCompativeisFipe(vectra,"Vectra GLS Challenge 2.2 automático").map((v)=>v.code),
    ["gls-challenge"],
  );
  // Descrição FIPE omissa quanto ao câmbio não comprova qual é o câmbio.
  assert.deepEqual(
    modelosCompativeisFipe(vectra,"Vectra GLS Challenge 2.0 manual"),
    [],
  );
});

test("quando há opção explícita de câmbio, ela prevalece sobre a opção sem informação", () => {
  const variantes=[
    {code:"aut",name:"ONIX LTZ 1.4 Aut."},
    {code:"mec",name:"ONIX LTZ 1.4 Mec."},
    {code:"sem",name:"ONIX LTZ 1.4"},
  ];
  assert.deepEqual(modelosCompativeisFipe(variantes,"Onix LTZ 1.4 automático").map((v)=>v.code),["aut"]);
  assert.deepEqual(modelosCompativeisFipe(variantes,"Onix LTZ 1.4 manual").map((v)=>v.code),["mec"]);
});

test("última correção de câmbio do cliente prevalece na nova consulta", () => {
  const mensagens=[
    "Vou fazer outra cotação", "Vectra", "Ops é 2000",
    "Não é esse modelo", "Challenge", "Automático", "Manual",
    "2.2 uai", "Gls/challenge 2.2",
  ];
  assert.equal(cambioInformadoCotacao(mensagens),"manual");
  assert.equal(aplicarCambioInformado("Vectra GLS/Challenge 2.2 automático","manual"),
    "Vectra GLS/Challenge 2.2 manual");
  assert.equal(versaoCorrigidaFoiInformada(mensagens),true);
  assert.equal(motorizacaoCorrigidaCotacao(mensagens),"2.2");
  assert.equal(aplicarMotorizacaoCorrigida("Vectra GLS Challenge 2.0","2.2"),
    "Vectra GLS Challenge 2.2");
});

test("saudação sem dados não reativa cotação pendente", () => {
  for (const mensagem of ["Oii", "Oi!", "Olá", "Bom dia 😊", "Tudo bem?", "Obrigado", "Ok"]) {
    assert.equal(mensagemSocialSemDadosCotacao(mensagem),true,mensagem);
  }
  for (const mensagem of [
    "Quero cotar outro Vectra", "Gls/challenge 2.2", "Manual",
    "É o 2.2", "Pode enviar a cotação", "Não é esse modelo",
  ]) {
    assert.equal(mensagemSocialSemDadosCotacao(mensagem),false,mensagem);
  }
});


test("abreviações FIPE Advantage são equivalentes sem presumir câmbio",()=>{
  const itens=[
    {code:"h-aut",name:"Astra Advant. 2.0 MPFI 8V FlexP. 5p Aut."},
    {code:"h",name:"Astra Advantage 2.0 MPFI 8V FlexPower 5p"},
    {code:"s",name:"Astra Sed. Advant. 2.0 8V MPFI FlexP. 4p"},
    {code:"s-aut",name:"Astra Sed.Advan. 2.0 8V MPFI FlexP. Aut."},
  ];
  assert.deepEqual(modelosCompativeisFipe(itens,"Astra Sedan Advantage").map(v=>v.code),["s","s-aut"]);
  assert.deepEqual(modelosCompativeisFipe(itens,"Astra Advantage").map(v=>v.code),["h-aut","h","s","s-aut"]);
  assert.deepEqual(modelosCompativeisFipe(itens,"Astra Sedan Advantage automático").map(v=>v.code),["s-aut"]);
});
