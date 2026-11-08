import assert from "node:assert/strict";
import test from "node:test";
import {modelosCompativeisFipe}
  from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";

test("abreviação numérica encontra candidatas FIPE, sem trocar a família",()=>{
  const catalogo=[
    {code:"1",name:"320iA 2.0 Turbo Flex 16V"},
    {code:"2",name:"320i 2.0 16V"},
    {code:"3",name:"320d 2.0 Diesel"},
    {code:"4",name:"321i 2.0 Turbo"},
    {code:"5",name:"3200 GT"},
    {code:"6",name:"330i 2.0 Turbo"},
  ];
  assert.deepEqual(modelosCompativeisFipe(catalogo,"320").map(x=>x.code),
    ["1","2","3"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"320i").map(x=>x.code),
    ["2"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"320d").map(x=>x.code),
    ["3"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"321").map(x=>x.code),
    ["4"]);
});

test("modelos de moto pouco comuns não se confundem com outros códigos",()=>{
  const catalogo=[
    {code:"a",name:"GL 1800 Gold Wing"},
    {code:"b",name:"GL 1500 Gold Wing"},
    {code:"c",name:"X-ADV 750"},
    {code:"d",name:"ADV 150"},
  ];
  assert.deepEqual(modelosCompativeisFipe(catalogo,"GL 1800 Gold Wing")
    .map(x=>x.code),["a"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"X adv 750")
    .map(x=>x.code),["c"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"X-ADV 2018")
    .map(x=>x.code),[]);
});
