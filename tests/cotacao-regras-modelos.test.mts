import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizarChaveModelo,selecionarRegraModelo,CATEGORIAS_POR_TIPO_MODELO,
  familiasModelosDoCatalogoFipe,
  type RegraModeloCotacao,
} from "../src/lib/cotacoes-veiculares/regras-modelos.ts";
import {categoriaBaseEfetivaFipe} from "../src/lib/cotacoes-veiculares/classificacao-automatica.ts";

const regras:RegraModeloCotacao[]=[
  {tipo_fipe:"cars",marca:"Chevrolet",modelo:"Spin",categoria:"van_utilitario"},
  {tipo_fipe:"cars",marca:"Fiat",modelo:"Fiorino",categoria:"van_utilitario"},
];

test("família comercial Spin vale para todas as versões e anos, incluindo marca FIPE composta",()=>{
  for(const modelo of ["SPIN LT 1.8","SPIN ACTIV 1.8 8V","Spin LTZ 7 lugares","SPIN"]){
    const regra=selecionarRegraModelo(regras,{
      tipo_fipe:"cars",marca:"GM - Chevrolet",modelo,
    });
    assert.equal(regra?.categoria,"van_utilitario",modelo);
  }
  assert.equal(selecionarRegraModelo(regras,{
    tipo_fipe:"cars",marca:"Chevrolet",modelo:"SPINNER",
  }),null);
});

test("Fiorino da FIPE é classificada por família, sem fixar ano ou motorização",()=>{
  const regra=selecionarRegraModelo(regras,{
    tipo_fipe:"cars",marca:"Fiat",
    modelo:"Fiorino Furg.1.5/1.3/1.3 Fire/1.3 F.Flex",
  });
  assert.equal(regra?.categoria,"van_utilitario");
  assert.equal(selecionarRegraModelo(regras,{
    tipo_fipe:"cars",marca:"Ford",modelo:"Fiorino Furgão",
  }),null);
});

test("não afeta outros modelos nem outras categorias FIPE",()=>{
  assert.equal(selecionarRegraModelo(regras,{
    tipo_fipe:"cars",marca:"Fiat",modelo:"Uno Mille",
  }),null);
  assert.equal(selecionarRegraModelo(regras,{
    tipo_fipe:"motorcycles",marca:"Fiat",modelo:"Fiorino",
  }),null);
  assert.ok(CATEGORIAS_POR_TIPO_MODELO.cars.includes("van_utilitario"));
  assert.ok(!CATEGORIAS_POR_TIPO_MODELO.motorcycles.includes("van_utilitario"));
});

test("regra de família mais específica precede outra da mesma marca",()=>{
  const regra=selecionarRegraModelo([
    ...regras,{tipo_fipe:"cars",marca:"Chevrolet",modelo:"Spin Activ",
      categoria:"especiais"},
  ],{tipo_fipe:"cars",marca:"GM - Chevrolet",modelo:"SPIN ACTIV 1.8"});
  assert.equal(regra?.categoria,"especiais");
});

test("a categoria específica por código FIPE continua prioritária",()=>{
  const manual=categoriaBaseEfetivaFipe({
    categoriaClassificacao:"especiais",
    origemClassificacao:"manual",categoriaCatalogo:"auto_leves",
  });
  assert.equal(manual,"especiais");
  const automatica=categoriaBaseEfetivaFipe({
    categoriaClassificacao:"auto_leves",
    origemClassificacao:"automatica",categoriaCatalogo:"auto_leves",
  });
  assert.equal(automatica,"auto_leves");
  assert.equal(normalizarChaveModelo("Fiórino - Furgão"),"fiorino furgao");
});

test("FIPE: marca escolhida apresenta famílias reais, sem exigir versão ou ano",()=>{
  const familias=familiasModelosDoCatalogoFipe([
    {code:"1",name:"SPIN LT 1.8"},
    {code:"2",name:"SPIN LTZ 1.8"},
    {code:"3",name:"SPIN ACTIV"},
    {code:"4",name:"ONIX 1.0"},
  ]);
  const spin=familias.find(v=>normalizarChaveModelo(v.nome)==="spin");
  const onix=familias.find(v=>normalizarChaveModelo(v.nome)==="onix");
  assert.equal(spin?.quantidadeVersoes,3);
  assert.equal(spin?.nome,"Spin");
  assert.equal(onix?.quantidadeVersoes,1);
  assert.equal(familias.length,2);
  const regra=selecionarRegraModelo([
    {tipo_fipe:"cars",marca:"GM - Chevrolet",modelo:spin!.nome,
      categoria:"van_utilitario"},
  ],{tipo_fipe:"cars",marca:"GM - Chevrolet",modelo:"SPIN LTZ 1.8"});
  assert.equal(regra?.categoria,"van_utilitario");
});

test("FIPE: Fiorino e modelos compostos são pesquisáveis por família",()=>{
  const familias=familiasModelosDoCatalogoFipe([
    {code:"1",name:"FIORINO Furg.1.5/1.3/1.3 Fire/1.3 F.Flex"},
    {code:"2",name:"FIORINO Endurance 1.4"},
    {code:"3",name:"C 180 Classic"},
    {code:"4",name:"C 200 Avantgarde"},
  ]);
  assert.equal(familias.find(v=>normalizarChaveModelo(v.nome)==="fiorino")
    ?.quantidadeVersoes,2);
  assert.ok(familias.some(v=>normalizarChaveModelo(v.nome)==="c 180"));
  assert.ok(familias.some(v=>normalizarChaveModelo(v.nome)==="c 200"));
  assert.equal(familias.some(v=>v.nome==="C"),false);
});
