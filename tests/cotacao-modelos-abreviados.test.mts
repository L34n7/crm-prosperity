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
    {code:"e",name:"GL1800 Gold Wing"},
  ];
  assert.deepEqual(modelosCompativeisFipe(catalogo,"GL 1800 Gold Wing")
    .map(x=>x.code),["a"]);
  assert.deepEqual(modelosCompativeisFipe(
    [{code:"e",name:"GL1800 Gold Wing"}],"GL 1800 Gold Wing"
  ).map(x=>x.code),["e"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"X adv 750")
    .map(x=>x.code),["c"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"X-ADV 2018")
    .map(x=>x.code),[]);
});

test("nomes de motos com espaços, letras e cilindradas mantêm identidade",()=>{
  const catalogo=[
    {code:"x",name:"X-ADV"},
    {code:"x150",name:"X-ADV 150"},
    {code:"adv150",name:"ADV 150"},
    {code:"cbr650r",name:"CBR 650 R ABS"},
    {code:"cbr650f",name:"CBR 650F ABS"},
    {code:"cbr500r",name:"CBR 500 R"},
    {code:"gl1800",name:"GL1800 Gold Wing"},
    {code:"gl1500",name:"GL 1500 Gold Wing"},
  ];
  assert.deepEqual(modelosCompativeisFipe(catalogo,"X-ADV 750")
    .map(v=>v.code),["x"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"XADV750")
    .map(v=>v.code),["x"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"CBR 650R")
    .map(v=>v.code),["cbr650r"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"CBR650R")
    .map(v=>v.code),["cbr650r"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"GL 1800 Gold Wing")
    .map(v=>v.code),["gl1800"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"GL1800 Gold Wing")
    .map(v=>v.code),["gl1800"]);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"CBR 650F")
    .map(v=>v.code),["cbr650f"]);
});

test("não misturar cilindradas ou versões contraditórias",()=>{
  const catalogo=[
    {code:"a",name:"X-ADV 150"},
    {code:"b",name:"ADV 750"},
    {code:"c",name:"CBR 650 F"},
    {code:"d",name:"GL 1500 Gold Wing"},
    {code:"e",name:"CBR 500 R"},
    {code:"f",name:"Astra GLS 2.0"},
  ];
  for(const modelo of ["X-ADV 750","CBR 650R","GL1800 Gold Wing"])
    assert.deepEqual(modelosCompativeisFipe(catalogo,modelo),[],modelo);
  assert.deepEqual(modelosCompativeisFipe(catalogo,"Astra GSI 2.0"),[]);
});
