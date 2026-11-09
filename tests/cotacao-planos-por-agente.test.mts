import assert from "node:assert/strict";
import test from "node:test";
import {
  codigosPlanosFerramentaCotacao,
  planosPermitidosFerramentaCotacao,
} from "../src/lib/cotacoes-veiculares/planos-ferramenta.ts";
import type {PlanoEmpresa} from "../src/lib/cotacoes-veiculares/catalogo.ts";

const planos:PlanoEmpresa[]=[
  {empresa_id:"empresa-1",codigo:"premium",nome:"Premium",ordem:1,ativo:true},
  {empresa_id:"empresa-1",codigo:"completo",nome:"Completo",ordem:2,ativo:true},
  {empresa_id:"empresa-1",codigo:"plus",nome:"Plus",ordem:3,ativo:true},
  {empresa_id:"empresa-1",codigo:"antigo",nome:"Desativado",ordem:4,ativo:false},
];

test("configuração legada oferece todos os planos ativos",()=>{
  for(const config of [{},{planos_cotacao_codigos:null}]){
    const codigos=codigosPlanosFerramentaCotacao(config);
    assert.equal(codigos,null);
    assert.deepEqual(
      planosPermitidosFerramentaCotacao(planos,codigos).map(p=>p.codigo),
      ["premium","completo","plus"],
    );
  }
});

test("empresa mantém 3 planos mas agente só pode cotar 1",()=>{
  const codes=codigosPlanosFerramentaCotacao({
    planos_cotacao_codigos:["premium"],
  });
  assert.deepEqual(
    planosPermitidosFerramentaCotacao(planos,codes).map(p=>p.codigo),
    ["premium"],
  );
  assert.equal(planos.filter(p=>p.ativo).length,3);
});

test("dois planos selecionados não incluem o terceiro",()=>{
  const codes=codigosPlanosFerramentaCotacao({
    planos_cotacao_codigos:["plus","completo"],
  });
  assert.deepEqual(
    planosPermitidosFerramentaCotacao(planos,codes).map(p=>p.codigo),
    ["completo","plus"],
  );
});

test("ausência de seleção inclui novos planos; seleção explícita continua restrita",()=>{
  const novos=[...planos,{
    empresa_id:"empresa-1",codigo:"especial",nome:"Especial",ordem:5,ativo:true,
  }];
  assert.equal(planosPermitidosFerramentaCotacao(novos,null).length,4);
  assert.deepEqual(
    planosPermitidosFerramentaCotacao(novos,["premium"]).map(p=>p.codigo),
    ["premium"],
  );
});

test("configuração vazia, duplicada e malformada jamais volta silenciosamente para todos",()=>{
  for(const entrada of [
    [],["premium","premium"],["premium",true],[""],["PREMIUM"],
    ["plano; DROP TABLE"],"premium",
  ]){
    assert.throws(
      ()=>codigosPlanosFerramentaCotacao({planos_cotacao_codigos:entrada}),
      /plano|duplicad/i,
    );
  }
});

test("plano de outra empresa, desativado ou excluído não é autorizado",()=>{
  for(const codigos of [
    ["antigo"],["nao_existe"],["premium","antigo"],["premium","plano_externo"],
  ])assert.throws(
    ()=>planosPermitidosFerramentaCotacao(planos,codigos),
    /ativo|exclu[ií]do/i,
  );
  assert.deepEqual(planosPermitidosFerramentaCotacao(planos,[]),[]);
});

test("planos ativos ausentes resultam em lista vazia e impedem gerar propostas",()=>{
  assert.deepEqual(
    planosPermitidosFerramentaCotacao(planos.filter(p=>!p.ativo),null),
    [],
  );
});
