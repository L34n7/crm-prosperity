import assert from "node:assert/strict";
import test from "node:test";
import {querCompararPlanos,querCompararUso} from "../src/lib/agentes-ia/comparacao-intencao.ts";
import {compararValoresPlanos} from "../src/lib/agentes-ia/comparacao-planos.ts";
import {compararValoresUso} from "../src/lib/agentes-ia/comparacao-uso.ts";

const planos=[
  {plano:"premium",plano_nome:"Plano Premium",mensalidade_base_centavos:45565},
  {plano:"completo",plano_nome:"Plano Completo",mensalidade_base_centavos:42901},
];
test("comparação lê todos os planos e diferença real, nunca apenas Premium",()=>{
  assert.equal(querCompararPlanos("qual a diferença entre os planos?"),true);
  assert.equal(querCompararPlanos("qual a diferença em valor?"),true);
  const texto=compararValoresPlanos("Hilux",2015,"particular",planos);
  assert.match(texto,/R\$\s?455,65/);
  assert.match(texto,/R\$\s?429,01/);
  assert.match(texto,/R\$\s?26,64/);
});
test("pergunta conceitual sobre uso não faz nova cotação sem pedir preço",()=>{
  assert.equal(querCompararPlanos("qual a diferença entre uso particular e aplicativo"),false);
  assert.equal(querCompararUso("qual a diferença entre uso particular e aplicativo",""),null);
  assert.equal(querCompararUso("quero cotar outro veículo aplicativo",""),null);
});
test("pedido de preços e sim após autorização reutilizam o mesmo carro",()=>{
  assert.equal(querCompararUso("se for aplicativo vai ter quanto de mudança no preço?",""),"aplicativo");
  assert.equal(querCompararUso("sim","Para saber a diferença exata, preciso gerar nova cotação para uso em aplicativo. Posso fazer essa simulação?"),"aplicativo");
  assert.equal(querCompararUso("sim","Sua cotação foi enviada."),null);
});
test("comparativo de usos usa valores calculados sem inventar preços",()=>{
  const novo=[
    {plano:"premium",plano_nome:"Plano Premium",mensalidade_base_centavos:50000},
    {plano:"completo",plano_nome:"Plano Completo",mensalidade_base_centavos:47000},
  ];
  const texto=compararValoresUso("Hilux",2015,"particular",planos,"aplicativo",novo);
  assert.match(texto,/R\$\s?455,65/);
  assert.match(texto,/R\$\s?500,00/);
  assert.match(texto,/R\$\s?44,35/);
  assert.match(texto,/R\$\s?40,99/);
});
