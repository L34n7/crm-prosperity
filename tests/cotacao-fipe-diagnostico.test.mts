import assert from "node:assert/strict";
import test from "node:test";
import {modelosCompativeisFipe}
  from "../src/lib/cotacoes-veiculares/modelos-compatibilidade.ts";
import {agruparModelosPorAnoFipe}
  from "../src/lib/cotacoes-veiculares/modelos-ano.ts";
import {diagnosticarIdentificacaoFipe,ErroIdentificacaoModeloFipe}
  from "../src/lib/cotacoes-veiculares/erros-identificacao.ts";

test("modelo existente com ano incompatível não é ausência de marca",()=>{
  const modelos=[
    {code:"1800",name:"GL1800 Gold Wing"},
    {code:"1500",name:"GL1500 Gold Wing"},
  ];
  const candidatos=modelosCompativeisFipe(modelos,"GL 1800 Gold Wing");
  assert.deepEqual(candidatos.map(x=>x.code),["1800"]);
  const validos=agruparModelosPorAnoFipe(candidatos,[{
    ano:{code:"1988-1",name:"1988 Gasolina"},
    modelos:[modelos[1]],
  }]);
  assert.equal(validos.length,0);
  const falha=diagnosticarIdentificacaoFipe({
    modelo:"GL 1800 Gold Wing",anoModelo:"1988",
    possuiModeloNaMarca:candidatos.length>0,
  });
  assert.ok(falha instanceof ErroIdentificacaoModeloFipe);
  assert.equal(falha.codigo,"FIPE_ANO_MODELO_NAO_ENCONTRADO");
  assert.match(falha.perguntaCliente,/ano-modelo/i);
});

test("motos com grafias distintas podem chegar à validação de ano FIPE",()=>{
  const modelos=[
    {code:"x",name:"X-ADV"},
    {code:"r",name:"CBR 650 R ABS"},
  ];
  for(const {consulta,codigo,ano} of [
    {consulta:"X-ADV 750",codigo:"x",ano:"2018-1"},
    {consulta:"CBR650R",codigo:"r",ano:"2020-1"},
  ]){
    const candidatos=modelosCompativeisFipe(modelos,consulta);
    assert.deepEqual(candidatos.map(x=>x.code),[codigo],consulta);
    const validos=agruparModelosPorAnoFipe(candidatos,[{
      ano:{code:ano,name:ano.slice(0,4)+" Gasolina"},
      modelos:modelos.filter(m=>m.code===codigo),
    }]);
    assert.equal(validos.length,1,consulta);
  }
});

test("modelo não localizado tem erro próprio e não aciona falha técnica",()=>{
  const candidatos=modelosCompativeisFipe([
    {code:"1",name:"CBR 500 R"},{code:"2",name:"CBR 650 F"},
  ],"CBR 650R");
  assert.equal(candidatos.length,0);
  const falha=diagnosticarIdentificacaoFipe({
    modelo:"CBR 650R",anoModelo:"2020",possuiModeloNaMarca:false,
  });
  assert.equal(falha.codigo,"FIPE_MODELO_NAO_ENCONTRADO");
  assert.match(falha.perguntaCliente,/modelo/i);
  assert.doesNotMatch(falha.message,/indisponivel|timeout/i);
});
