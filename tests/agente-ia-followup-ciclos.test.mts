import assert from "node:assert/strict";
import test from "node:test";
import { podeIniciarCicloFollowup, mensagemPermiteAcompanhamento, contatoPediuPausaExplicita, calcularProximaExecucaoFollowupMs } from "../src/lib/agentes-ia/followup-ciclo.ts";
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
test("vou pensar continua elegível; pedidos explícitos de parada não",()=>{
 assert.equal(contatoPediuPausaExplicita("Vou pensar sobre o plano"),false);
 assert.equal(contatoPediuPausaExplicita("Vou avaliar e vejo"),false);
 assert.equal(contatoPediuPausaExplicita("Não quero mais mensagens"),true);
 assert.equal(contatoPediuPausaExplicita("Te chamo depois"),true);
});

test("pedido de não contato temporário também é respeitado",()=>{
 assert.equal(contatoPediuPausaExplicita("Por enquanto não"),true);
 assert.equal(contatoPediuPausaExplicita("Vou te chamar depois"),true);
});

test("atraso na tentativa não dispara as próximas etapas de uma vez",()=>{
 const inicio=Date.parse("2026-11-24T00:48:34Z");
 const horarioOriginal4=inicio+540*60_000;
 const tentativa3Recuperada=inicio+1190*60_000;
 const proximo=calcularProximaExecucaoFollowupMs({
   referenciaInatividadeMs:inicio, intervaloMinutos:540,
   intervaloAnteriorMinutos:300, ultimaTentativaEnviadaMs:tentativa3Recuperada,
 });
 assert.equal(proximo, tentativa3Recuperada+240*60_000);
 assert.ok(proximo>horarioOriginal4);
});
test("sequência no prazo preserva cumulativo e tentativa inicial não exige anterior",()=>{
 const inicio=Date.parse("2026-11-24T00:48:34Z");
 assert.equal(calcularProximaExecucaoFollowupMs({
   referenciaInatividadeMs:inicio, intervaloMinutos:120,
   intervaloAnteriorMinutos:30, ultimaTentativaEnviadaMs:inicio+29*60_000,
 }),inicio+120*60_000);
 assert.equal(calcularProximaExecucaoFollowupMs({
   referenciaInatividadeMs:inicio, intervaloMinutos:30,
   intervaloAnteriorMinutos:0, ultimaTentativaEnviadaMs:null,
 }),inicio+30*60_000);
});
