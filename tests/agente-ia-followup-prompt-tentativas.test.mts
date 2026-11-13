import test from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOWUP_INATIVIDADE_PADRAO,
  MAX_TENTATIVAS_FOLLOWUP,
  MAX_CARACTERES_PROMPT_FOLLOWUP,
  normalizarFollowupInatividade,
  erroValidacaoFollowupInatividade,
  instrucaoPersonalizadaFollowup,
} from "../src/lib/agentes-ia/followup-config.ts";

test("seis tentativas com intervalos crescentes dentro da janela de 24h",()=>{
  const c=normalizarFollowupInatividade({ativo:true,tentativas:6});
  assert.equal(MAX_TENTATIVAS_FOLLOWUP,6);
  assert.equal(c.etapas.length,6);
  assert.deepEqual(c.intervalos_minutos,[30,180,720,960,1200,1380]);
  assert.equal(erroValidacaoFollowupInatividade(c),null);
});

test("clientes existentes preservam a configuração e os intervalos",()=>{
  const c=normalizarFollowupInatividade({ativo:true,tentativas:2,etapas:[
    {tipo:"ia",intervalo_valor:2,intervalo_unidade:"horas"},
    {tipo:"ia",intervalo_valor:6,intervalo_unidade:"horas"},
  ]});
  assert.equal(c.tentativas,2);
  assert.deepEqual(c.intervalos_minutos.slice(0,2),[120,360]);
  assert.equal(c.etapas[0].prompt_adicional,"");
  assert.equal(FOLLOWUP_INATIVIDADE_PADRAO.tentativas,2);
});

test("prompt opcional pode personalizar apenas a segunda tentativa IA",()=>{
  const p="Seja provocativo, destaque oportunidades perdidas por atraso na resposta e convide para continuar.";
  const c=normalizarFollowupInatividade({ativo:true,tentativas:2,etapas:[
    {tipo:"ia",intervalo_valor:1,intervalo_unidade:"horas",prompt_adicional:""},
    {tipo:"ia",intervalo_valor:2,intervalo_unidade:"horas",prompt_adicional:p},
  ]});
  assert.equal(c.etapas[1].prompt_adicional,p);
  assert.match(instrucaoPersonalizadaFollowup(c.etapas[1],2),/2ª TENTATIVA/);
  assert.match(instrucaoPersonalizadaFollowup(c.etapas[1],2),/Seja provocativo/);
  assert.equal(instrucaoPersonalizadaFollowup(c.etapas[0],1),"");
  assert.equal(instrucaoPersonalizadaFollowup({...c.etapas[1],tipo:"texto"},2),"");
  assert.equal(instrucaoPersonalizadaFollowup({...c.etapas[1],tipo:"audio"},2),"");
});

test("limite máximo, validação de ordem e persistência ao mudar quantidade",()=>{
  const c=normalizarFollowupInatividade({ativo:true,tentativas:20,etapas:[
    {tipo:"ia",intervalo_valor:1,intervalo_unidade:"horas",prompt_adicional:"X".repeat(5000)},
    {tipo:"ia",intervalo_valor:2,intervalo_unidade:"horas"},
    {tipo:"ia",intervalo_valor:2,intervalo_unidade:"horas"},
  ]});
  assert.equal(c.tentativas,6);
  assert.equal(c.etapas[0].prompt_adicional.length,MAX_CARACTERES_PROMPT_FOLLOWUP);
  assert.match(erroValidacaoFollowupInatividade(c)||"",/depois da tentativa anterior/);
  const restored=normalizarFollowupInatividade({...normalizarFollowupInatividade({...c,tentativas:2}),tentativas:6});
  assert.equal(restored.etapas[0].prompt_adicional.length,MAX_CARACTERES_PROMPT_FOLLOWUP);
});