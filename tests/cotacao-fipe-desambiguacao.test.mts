import assert from "node:assert/strict";
import test from "node:test";
import {modelosCompativeisFipe} from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";
import {perguntaUnicaVersoesFipe,respostaTrazDistincaoFipe,escolhasNumeradasFipe,interpretarRespostaOpcoesFipe} from "../src/lib/cotacoes-veiculares/orientacao-versoes.ts";

const civic=[
  {code:"si",name:"Civic Coupe Si 2.4 16V 206cv Mec. 2p"},
  {code:"lxr",name:"Civic Sedan LXR 2.0 Flexone 16V Aut. 4p"},
  {code:"lxs-aut",name:"Civic Sedan LXS 1.8/1.8 Flex 16V Aut. 4p"},
  {code:"lxs-mec",name:"Civic Sedan LXS 1.8/1.8 Flex 16V Mec. 4p"},
];
test("múltiplos acabamentos fazem uma pergunta clara",()=>{
  const p=perguntaUnicaVersoesFipe(civic,"2015","ambiguidade");
  assert.equal((p.match(/\?/g)||[]).length,1);
  assert.match(p,/LXS/);
  assert.match(p,/LXR/);
});
test("LXS 2015 pergunta apenas o câmbio",()=>{
  const opcoes=modelosCompativeisFipe(civic,"Civic LXS");
  assert.deepEqual(opcoes.map(x=>x.code),["lxs-aut","lxs-mec"]);
  const pergunta=perguntaUnicaVersoesFipe(opcoes,"2015","ambiguidade");
  assert.match(pergunta,/1 - /);
  assert.match(pergunta,/2 - /);
  assert.match(pergunta,/automático/);
  assert.match(pergunta,/manual/);
});
test("não inventar um LXS 2.0",()=>{
  assert.deepEqual(modelosCompativeisFipe(civic,"Civic LXS 2.0"),[]);
  const p=perguntaUnicaVersoesFipe(civic.slice(1,3),"2015","incompatibilidade");
  assert.equal((p.match(/\?/g)||[]).length,1);
  assert.match(p,/não coincidem/);
});
test("retomar apenas quando cliente distingue versões",()=>{
  const opcoes=civic.slice(1,3).map(x=>x.name);
  assert.equal(respostaTrazDistincaoFipe("LXR",opcoes),true);
  assert.equal(respostaTrazDistincaoFipe("1.8",opcoes),true);
  assert.equal(respostaTrazDistincaoFipe("Isso mesmo",opcoes),false);
  assert.equal(respostaTrazDistincaoFipe("Automático",opcoes),false);
});
test("reconhecer sedã e Auto genericamente",()=>{
  const opcoes=[{code:"a",name:"Exemplo Sedan GL 1.6 Aut. 4p"},{code:"m",name:"Exemplo Sedan GL 1.6 Mec. 4p"}];
  assert.deepEqual(modelosCompativeisFipe(opcoes,"Exemplo sedã GL 1.6 auto").map(x=>x.code),["a"]);
});


test("Astra 2010 apresenta Advantage como acabamento e distingue carroceria",()=>{
  const itens=[
    {code:"h-aut",name:"Astra Advant. 2.0 MPFI 8V FlexP. 5p Aut."},
    {code:"h",name:"Astra Advantage 2.0 MPFI 8V FlexPower 5p"},
    {code:"s",name:"Astra Sed. Advant. 2.0 8V MPFI FlexP. 4p"},
    {code:"s-aut",name:"Astra Sed.Advan. 2.0 8V MPFI FlexP. Aut."},
  ];
  const pergunta=perguntaUnicaVersoesFipe(itens,"2010","ambiguidade");
  assert.match(pergunta,/Astra Advantage/);
  assert.match(pergunta,/Astra Sedan Advantage/);
  assert.doesNotMatch(pergunta,/Advant\.|Advan\./);
  assert.equal((pergunta.match(/\?/g)||[]).length,1);
  assert.equal(respostaTrazDistincaoFipe("sedan",itens.map(i=>i.name)),true);
});

test("Fusion Titanium 2019 preserva Híbrido e AWD como alternativas distintas",()=>{
  const itens=[
    {code:"hybrid",name:"Fusion Titanium 2.0 145cv Aut. (Híbrido)"},
    {code:"awd",name:"Fusion Titanium 2.0 GTDI Eco. Awd Aut."},
  ];
  const nomes=itens.map(v=>v.name);
  const pergunta=perguntaUnicaVersoesFipe(itens,"2019","ambiguidade");
  assert.match(pergunta,/Híbrido/);
  assert.match(pergunta,/AWD/);
  assert.equal((pergunta.match(/\?/g)||[]).length,1);
  assert.equal(respostaTrazDistincaoFipe("hibrido",nomes),true);
  assert.equal(respostaTrazDistincaoFipe("AWD",nomes),true);
  for(const comum of ["Titanium 2.0","automático","Fusion Titanium 2.0 automático","é essa mesma"]){
    assert.equal(respostaTrazDistincaoFipe(comum,nomes),false,comum);
  }
});


const unoMille=[
  {code:"2p",name:"Uno Mille 1.0 Fire/ F.Flex/ ECONOMY 2p"},
  {code:"4p",name:"Uno Mille 1.0 Fire/ F.Flex/ ECONOMY 4p"},
];
test("Uno 2005 apresenta seis nomes com números, sem inventar códigos FIPE",()=>{
  const pergunta=perguntaUnicaVersoesFipe(unoMille,"2005","ambiguidade");
  assert.match(pergunta,/1 - 1\.0 Fire 2p/);
  assert.match(pergunta,/2 - F\.Flex 2p/);
  assert.match(pergunta,/3 - ECONOMY 2p/);
  assert.match(pergunta,/4 - 1\.0 Fire 4p/);
  assert.match(pergunta,/5 - F\.Flex 4p/);
  assert.match(pergunta,/6 - ECONOMY 4p/);
  assert.equal((pergunta.match(/\?/g)||[]).length,1);
  const escolhas=escolhasNumeradasFipe(unoMille.map(v=>v.name));
  assert.equal(escolhas.length,6);
  assert.equal(escolhas[1].nomeFipe,unoMille[0].name);
  assert.equal(escolhas[4].nomeFipe,unoMille[1].name);
});
test("responder numero 2 cota a descrição oficial de duas portas",()=>{
  const resposta=interpretarRespostaOpcoesFipe("2",unoMille.map(v=>v.name));
  assert.equal(resposta.versaoSelecionada,unoMille[0].name);
  assert.deepEqual(resposta.opcoesRestantes,[unoMille[0].name]);
  assert.equal(interpretarRespostaOpcoesFipe("opção 5",unoMille.map(v=>v.name)).versaoSelecionada,unoMille[1].name);
});
test("responder 2 portas elimina as opções de 4 portas e conclui a versão FIPE",()=>{
  const resposta=interpretarRespostaOpcoesFipe("2 portas",unoMille.map(v=>v.name));
  assert.equal(resposta.versaoSelecionada,unoMille[0].name);
  assert.equal(resposta.filtrou,true);
  assert.deepEqual(resposta.opcoesRestantes,[unoMille[0].name]);
  assert.equal(interpretarRespostaOpcoesFipe("4 portas",unoMille.map(v=>v.name)).versaoSelecionada,unoMille[1].name);
  assert.equal(interpretarRespostaOpcoesFipe("2p",unoMille.map(v=>v.name)).versaoSelecionada,unoMille[0].name);
});
test("resposta por nome e característica sem seleção prematura",()=>{
  const all=unoMille.map(v=>v.name);
  assert.equal(interpretarRespostaOpcoesFipe("F.Flex 2p",all).versaoSelecionada,unoMille[0].name);
  assert.equal(interpretarRespostaOpcoesFipe("F.Flex",all).versaoSelecionada,null);
  assert.equal(interpretarRespostaOpcoesFipe("7",all).versaoSelecionada,null);
});
test("com mais de uma versão 2p, filtro remove 4p e reapresenta somente candidatas válidas",()=>{
  const opcoes=[
    "Uno Mille Fire 1.0 2p","Uno Mille Economy 1.0 2p",
    "Uno Mille Fire 1.0 4p","Uno Mille Economy 1.0 4p",
  ];
  const filtrada=interpretarRespostaOpcoesFipe("2 portas",opcoes);
  assert.equal(filtrada.versaoSelecionada,null);
  assert.deepEqual(filtrada.opcoesRestantes,opcoes.slice(0,2));
  const pergunta=perguntaUnicaVersoesFipe(
    filtrada.opcoesRestantes.map((name,i)=>({name,code:String(i)})),"2005","ambiguidade");
  assert.doesNotMatch(pergunta,/4p/);
  assert.equal(interpretarRespostaOpcoesFipe("2",filtrada.opcoesRestantes).versaoSelecionada,opcoes[1]);
});
