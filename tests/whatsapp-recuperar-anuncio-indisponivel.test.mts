import assert from "node:assert/strict";
import test from "node:test";
import { recuperarInteresseMensagemIndisponivel as recuperar, MENSAGEM_INTERESSE_ANUNCIO } from "../src/lib/whatsapp/recuperar-mensagem-indisponivel-anuncio.ts";
const b={tipoMensagem:"unsupported",tipoUnsupported:"unknown",detalheUnsupported:"This message is currently unavailable.",possuiReferral:false,primeiraMensagemContato:true};
test("primeira entrada indisponível e referral de anúncio viram interesse",()=>{
  assert.equal(recuperar(b),MENSAGEM_INTERESSE_ANUNCIO);
  assert.equal(recuperar({...b,primeiraMensagemContato:false,possuiReferral:true}),MENSAGEM_INTERESSE_ANUNCIO);
});
test("não presumir interesse em álbum, lista, arquivos ou conversa já existente",()=>{
  for(const item of [
    {...b,primeiraMensagemContato:false},
    {...b,tipoUnsupported:"album"},
    {...b,tipoUnsupported:"list"},
    {...b,tipoMensagem:"audio"},
    {...b,tipoMensagem:"texto"},
    {...b,detalheUnsupported:"Message type is currently not supported."},
  ]) assert.equal(recuperar(item),null);
});
