import assert from "node:assert/strict";
import test from "node:test";
import {
  interpretarRespostaOpcoesFipe,respostaTrazDistincaoFipe,
} from "../src/lib/cotacoes-veiculares/orientacao-versoes.ts";

const xj6=["XJ6 F","XJ6 N/ABS"];

test("regressão do atendimento real: F, XJ6 F e Xj 6 f escolhem a versão F",()=>{
  for(const mensagem of [
    "F","f","Xj6 f","Xj 6 f","XJ6 f","XJ6 F",
    "XJ6-F","É a XJ6 F","1","opção 1",
  ]){
    const resultado=interpretarRespostaOpcoesFipe(mensagem,xj6);
    assert.equal(resultado.versaoSelecionada,"XJ6 F",mensagem);
    assert.deepEqual(resultado.opcoesRestantes,["XJ6 F"],mensagem);
    assert.equal(resultado.filtrou,true,mensagem);
    assert.equal(respostaTrazDistincaoFipe(mensagem,xj6),true,mensagem);
  }
});

test("N/ABS e segunda opção seguem selecionando somente o código real",()=>{
  for(const mensagem of ["N/abs","n","XJ6 N/ABS","2","segunda opção"]){
    const resultado=interpretarRespostaOpcoesFipe(mensagem,xj6);
    assert.equal(resultado.versaoSelecionada,"XJ6 N/ABS",mensagem);
    assert.deepEqual(resultado.opcoesRestantes,["XJ6 N/ABS"],mensagem);
  }
});

test("resposta sem distinção não autoriza cotação nem nova escolha automática",()=>{
  for(const mensagem of ["XJ6","xj 6","moto","Sim","É essa","Ambas","3"]){
    const resultado=interpretarRespostaOpcoesFipe(mensagem,xj6);
    assert.equal(resultado.versaoSelecionada,null,mensagem);
    assert.equal(resultado.filtrou,false,mensagem);
  }
});

test("letra só seleciona quando identifica uma única versão",()=>{
  const repetidas=["XJ6 F","XJ6 F ABS","XJ6 N/ABS"];
  const resposta=interpretarRespostaOpcoesFipe("F",repetidas);
  assert.equal(resposta.versaoSelecionada,null);
  assert.deepEqual(resposta.opcoesRestantes,repetidas.slice(0,2));
  assert.equal(resposta.filtrou,true);
  const unica=interpretarRespostaOpcoesFipe("ABS",repetidas);
  assert.equal(unica.versaoSelecionada,null);
  assert.equal(unica.filtrou,true);
});

test("letra não corresponde a trechos internos de nomes",()=>{
  const opcoes=["Exemplo F 650", "Exemplo Flex 650","Exemplo FS 650"];
  assert.equal(interpretarRespostaOpcoesFipe("F",opcoes).versaoSelecionada,opcoes[0]);
  assert.equal(interpretarRespostaOpcoesFipe("S",opcoes).versaoSelecionada,null);
  assert.equal(interpretarRespostaOpcoesFipe("a",opcoes).versaoSelecionada,null);
});

test("características contraditórias não escolhem uma versão por aproximação",()=>{
  for(const msg of ["XJ6 F N/ABS","F N","XJ6 F ABS"]){
    const resultado=interpretarRespostaOpcoesFipe(msg,xj6);
    assert.equal(resultado.versaoSelecionada,null,msg);
    assert.equal(resultado.filtrou,false,msg);
    assert.deepEqual(resultado.opcoesRestantes,xj6,msg);
  }
});

test("motor informado não se perde na correspondência de nome completo",()=>{
  const opcoes=["Astra 2.0 GLS","Astra 1.8 GLS"];
  assert.equal(interpretarRespostaOpcoesFipe("Astra 1.8 GLS",opcoes).versaoSelecionada,opcoes[1]);
  assert.equal(interpretarRespostaOpcoesFipe("Astra 2.0 GLS",opcoes).versaoSelecionada,opcoes[0]);
  assert.equal(interpretarRespostaOpcoesFipe("Astra GLS",opcoes).versaoSelecionada,null);
});
