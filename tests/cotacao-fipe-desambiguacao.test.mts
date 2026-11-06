import assert from "node:assert/strict";
import test from "node:test";
import {modelosCompativeisFipe} from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";
import {perguntaUnicaVersoesFipe,respostaTrazDistincaoFipe} from "../src/lib/cotacoes-veiculares/orientacao-versoes.ts";

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
  assert.match(perguntaUnicaVersoesFipe(opcoes,"2015","ambiguidade"),/automático ou manual/);
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
