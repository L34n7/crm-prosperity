import assert from "node:assert/strict";
import test from "node:test";
import {
  usoComparativoNoContexto,
  dadosCorrespondemCotacao,
  citouVeiculoDiferente,
} from "../src/lib/agentes-ia/comparacao-intencao.ts";

const historico=[
 {role:"assistant" as const,content:"A cotação da sua HB20 2015 foi gerada para uso particular."},
 {role:"user" as const,content:"qual a diferença entre uso particular e aplicativo"},
 {role:"assistant" as const,content:"Uso em aplicativo tem mais exposição e pode mudar o valor."},
 {role:"user" as const,content:"e quanto fica em valores ?"},
 {role:"assistant" as const,content:"Para o HB20 particular, preciso gerar uma nova cotação específica para aplicativo, pois o preço pode mudar."},
];
test("pedido de valores após explicação dos tipos de uso mantém contexto",()=>{
 const h=historico.slice(0,3);
 assert.equal(usoComparativoNoContexto("e quanto fica em valores ?",h),"aplicativo");
 assert.equal(usoComparativoNoContexto("qual a diferença entre uso particular e aplicativo",h),null);
});
test("pode gerar não inicia uma coleta nova quando a comparação já foi pedida",()=>{
 assert.equal(usoComparativoNoContexto("pode gerar",historico),"aplicativo");
 assert.equal(usoComparativoNoContexto("sim",historico),"aplicativo");
});
test("já falei acima recupera a comparação e o veículo anterior",()=>{
 const h=[...historico,
  {role:"user" as const,content:"pode gerar"},
  {role:"assistant" as const,content:"Para preparar a cotação, informe modelo, ano e uso."}];
 assert.equal(usoComparativoNoContexto("já falei acima",h),"aplicativo");
});
test("veículo informado completo ativa comparação e é validado contra a cotação",()=>{
 const m="HB20 Premium automático 2015 uso aplicativo";
 assert.equal(usoComparativoNoContexto(m,historico),"aplicativo");
 assert.equal(dadosCorrespondemCotacao(m,"Hyundai HB20 Premium 1.6 Flex 16V Aut.",2015),true);
 assert.equal(citouVeiculoDiferente(m,"Hyundai HB20 Premium 1.6 Flex 16V Aut.",2015),false);
});
test("não aproveitar dados de outro veículo nem ano-modelo diferente",()=>{
 assert.equal(citouVeiculoDiferente("Ranger 2015 uso aplicativo","Hyundai HB20 Premium 1.6 Flex 16V Aut.",2015),true);
 assert.equal(citouVeiculoDiferente("HB20 2016 uso aplicativo","Hyundai HB20 Premium 1.6 Flex 16V Aut.",2015),true);
 assert.equal(citouVeiculoDiferente("2015 uso aplicativo","Hyundai HB20 Premium 1.6 Flex 16V Aut.",2015),false);
 assert.equal(usoComparativoNoContexto("quero cotar outro carro para aplicativo",historico),null);
 assert.equal(usoComparativoNoContexto("quero cotar Ranger 2015 uso aplicativo",historico),null);
});
test("agradecimento depois de proposta entregue não repete cotação",()=>{
 const h=[...historico,{role:"assistant" as const,content:"Sua cotação foi gerada e enviada."}];
 assert.equal(usoComparativoNoContexto("ok",h),null);
});
