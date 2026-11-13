import assert from "node:assert/strict";
import test from "node:test";
import { podeIniciarCicloFollowup, mensagemPermiteAcompanhamento } from "../src/lib/agentes-ia/followup-ciclo.ts";
test("pitch sem pergunta pode rearmar follow-up a cada nova resposta do cliente",()=>{
 const b={respostaEnviada:true,acaoCriticaExecutada:false,ultimaMensagemContatoId:"primeira",numeroDestino:"5511999999999",mensagensSaida:["Veja o checkout e comece pelo plano Básico."]};
 assert.equal(mensagemPermiteAcompanhamento(b.mensagensSaida[0]),true);
 assert.equal(podeIniciarCicloFollowup(b),true);
 assert.equal(podeIniciarCicloFollowup({...b,ultimaMensagemContatoId:"segunda"}),true);
});
test("não armar se transferência, sem envio ou sem contato",()=>{
 const b={respostaEnviada:true,acaoCriticaExecutada:false,ultimaMensagemContatoId:"a",numeroDestino:"5511999999999",mensagensSaida:["Vamos avançar."]};
 assert.equal(podeIniciarCicloFollowup({...b,transferidoHumano:true}),false);
 assert.equal(podeIniciarCicloFollowup({...b,acaoCriticaExecutada:true}),false);
 assert.equal(podeIniciarCicloFollowup({...b,respostaEnviada:false}),false);
 assert.equal(podeIniciarCicloFollowup({...b,ultimaMensagemContatoId:""}),false);
 assert.equal(podeIniciarCicloFollowup({...b,mensagensSaida:[]}),false);
});