import assert from "node:assert/strict";
import test from "node:test";
import {
  textoWhatsappComQuebras,recuperarRespostaEstruturada,textoPareceEstruturaInterna,protegerMensagensSaida,textoEhMarcadorInternoAgente,
} from "../src/lib/agentes-ia/resposta-estruturada.ts";

test("lista FIPE com quebras de linha chega intacta ao texto do WhatsApp",()=>{
  const texto="Encontrei mais de uma versão.\n\n1 - Fire 2p\n2 - Flex 2p\n\nQual delas?";
  assert.equal(textoWhatsappComQuebras(texto),texto);
  assert.equal(textoWhatsappComQuebras("  Título \r\n \r\n 1 - A\r\n2 - B  "),"Título\n\n1 - A\n2 - B");
});
test("JSON concatenado é recuperado sem expor memoria_delta",()=>{
  const primeiro={
    mensagens:["Entendi. Qual versão e motorização corretas do seu Astra?"],
    memoria_delta:{estagio:"qualificação",fatos:["Veículo corrigido"]},
  };
  const duplicado=JSON.stringify(primeiro)+JSON.stringify(primeiro);
  assert.deepEqual(recuperarRespostaEstruturada(duplicado),primeiro);
  assert.equal(textoPareceEstruturaInterna(duplicado),true);
});
test("resposta estruturada normal continua válida, inclusive com escape de aspas",()=>{
  const dado={mensagens:['A versão é "Advantage".\nPode confirmar?']};
  assert.deepEqual(recuperarRespostaEstruturada(JSON.stringify(dado)),dado);
});
test("JSON malformado jamais deve ir para o cliente como fallback",()=>{
  const texto='{"mensagens":["Veja a versão"],"memoria_delta":{';
  assert.equal(recuperarRespostaEstruturada(texto),null);
  assert.equal(textoPareceEstruturaInterna(texto),true);
  assert.equal(textoPareceEstruturaInterna("Perfeito, qual é o ano?"),false);
});


test("SaverCar: dois objetos JSON concatenados viram apenas as duas mensagens formatadas",()=>{
  const output={
    mensagens:[
      "Eu sou Andreia, assistência inteligente da Bia, uma ajuda extra enquanto ela não chega ☺️",
      "Não consigo consultar descontos aplicados a uma proposta específica. A equipe poderá verificar essa informação.",
    ],
    memoria_delta:{tipo_negocio:null,estagio:null,proxima_acao:null,
      dores:[],interesses:[],objecoes:[],fatos:[]},
  };
  const texto=JSON.stringify(output)+JSON.stringify(output);
  assert.deepEqual(protegerMensagensSaida([texto]),output.mensagens);
  assert.deepEqual(recuperarRespostaEstruturada(texto),output);
});
test("a proteção de saída também funciona se outro caminho passar JSON inteiro como mensagem",()=>{
  const payload=JSON.stringify({mensagens:["Primeira mensagem","Segunda mensagem"],memoria_delta:{}});
  assert.deepEqual(protegerMensagensSaida([payload]),["Primeira mensagem","Segunda mensagem"]);
  assert.deepEqual(protegerMensagensSaida(["Resposta normal.","Outra resposta."]),
    ["Resposta normal.","Outra resposta."]);
});
test("payload truncado jamais vai ao WhatsApp",()=>{
  const truncado='{"mensagens":["Bom dia"],"memoria_delta":{';
  const resultado=protegerMensagensSaida([truncado]);
  assert.equal(resultado.length,1);
  assert.doesNotMatch(resultado[0],/memoria_delta|mensagens/);
  assert.match(resultado[0],/repetir a última pergunta/i);
});
test("o teto de mensagens se aplica mesmo a um payload concatenado",()=>{
  const json=JSON.stringify({mensagens:["A","B","C","D"],memoria_delta:{}});
  assert.deepEqual(protegerMensagensSaida([json],2),["A","B"]);
});

test("regressão de produção: memoria_delta_mensagem não sai como terceiro balão",()=>{
  const resposta=[
    "Perfeito — a IA pode trabalhar objeções do seu negócio.",
    "Qual objeção aparece com mais frequência: preço, confiança ou vou pensar?",
    "memoria_delta_mensagem",
  ];
  assert.deepEqual(protegerMensagensSaida(resposta),resposta.slice(0,2));
  assert.equal(textoEhMarcadorInternoAgente("memoria_delta_mensagem"),true);
  assert.equal(textoPareceEstruturaInterna("memoria_delta_mensagem"),true);
});
test("marcador interno isolado não é enviado, sem censurar frases legítimas",()=>{
  assert.deepEqual(protegerMensagensSaida(["memoria_delta_mensagem"]),[]);
  assert.deepEqual(protegerMensagensSaida(["memoria_delta","estado_estruturado","delta_memoria_mensagem"]),[]);
  assert.deepEqual(protegerMensagensSaida(["Nossa memória registra informações relevantes.","Vou explicar o que significa memoria_delta."]),
    ["Nossa memória registra informações relevantes.","Vou explicar o que significa memoria_delta."]);
});
test("marcador interno dentro de JSON válido também é removido",()=>{
  const resposta=JSON.stringify({mensagens:["Primeira mensagem.","memoria_delta_mensagem","Última mensagem."],memoria_delta:{estagio:"interessado"}});
  assert.deepEqual(protegerMensagensSaida([resposta]),["Primeira mensagem.","Última mensagem."]);
});
