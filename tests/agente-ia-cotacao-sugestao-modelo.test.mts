import assert from "node:assert/strict";
import test from "node:test";
import {modeloSugeridoConfirmadoCotacao} from "../src/lib/agentes-ia/modelo-sugerido-cotacao.ts";
import {modeloComDadosConfirmados,validarDadosNovosCotacao} from "../src/lib/agentes-ia/pedido-cotacao.ts";

const historico=[
  {role:"user" as const,content:"Quero simular"},
  {role:"assistant" as const,content:"Qual modelo?"},
  {role:"user" as const,content:"Pelio"},
  {role:"assistant" as const,content:"Você quis dizer Fiat Palio? Qual é o ano-modelo e o uso?"},
];
test("Pelio sugerido como Palio e ano/uso respondidos continuam cotação",()=>{
  const sugestao=modeloSugeridoConfirmadoCotacao(historico,"2010 flex pra particular");
  assert.equal(sugestao,"Palio");
  const mensagens=["Quero simular","Pelio","2010 flex pra particular",sugestao!];
  const modelo=modeloComDadosConfirmados(mensagens,sugestao!);
  assert.equal(modelo,"Palio");
  assert.equal(validarDadosNovosCotacao(mensagens,modelo,"2010","particular"),null);
});
test("sem resposta confirmatória não assumir uma sugestão do agente",()=>{
  assert.equal(modeloSugeridoConfirmadoCotacao(historico,"Outra coisa"),null);
  assert.equal(modeloSugeridoConfirmadoCotacao(historico,"Não, é outro modelo"),null);
  assert.equal(modeloSugeridoConfirmadoCotacao(historico,"2010 pra aplicativo"),"Palio");
  assert.equal(modeloSugeridoConfirmadoCotacao(historico,"Uno 2010 particular"),null);
  assert.equal(modeloSugeridoConfirmadoCotacao(historico,"Pelio 2010 particular"),"Palio");
});
test("modelo sugerido muito diferente do digitado nunca é validado",()=>{
  const entrada=historico.map(item=>({...item}));
  entrada[3]={role:"assistant",content:"Você quis dizer Fiat Fusca? Qual ano?"};
  assert.equal(modeloSugeridoConfirmadoCotacao(entrada,"2010 particular"),null);
});
test("não herdar sugestão de proposta anterior sem confirmação contextual",()=>{
  const semSugestao=[
    {role:"user" as const,content:"Quero cotar meu Uno"},
    {role:"assistant" as const,content:"Qual é o ano-modelo?"},
  ];
  assert.equal(modeloSugeridoConfirmadoCotacao(semSugestao,"2010 particular"),null);
});
