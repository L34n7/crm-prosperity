import assert from "node:assert/strict";
import test from "node:test";
import {
  textoWhatsappComQuebras,recuperarRespostaEstruturada,textoPareceEstruturaInterna,
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
