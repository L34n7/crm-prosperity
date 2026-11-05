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
