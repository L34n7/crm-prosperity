import assert from "node:assert/strict";
import test from "node:test";
import { modelosCompativeisFipe } from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";
import {
  clienteCorrigiuVersaoCotacao,
  motorizacaoCorrigidaCotacao,
  aplicarMotorizacaoCorrigida,
  versaoCorrigidaFoiInformada,
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
