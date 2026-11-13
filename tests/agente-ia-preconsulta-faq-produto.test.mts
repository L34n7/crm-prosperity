import assert from "node:assert/strict";
import test from "node:test";
import { consultaFaqProduto } from "../src/lib/agentes-ia/preconsulta-faq-produto.ts";

test("pergunta real de suporte 24hr exige consulta, sem eco como resposta",()=>{
  assert.equal(consultaFaqProduto("Oii tem suporte 24hr?"),"Oii tem suporte 24hr?");
  assert.equal(consultaFaqProduto("O suporte funciona 24 horas por dia?"),"O suporte funciona 24 horas por dia?");
});
test("FAQ comercial de maior risco consulta a base específica",()=>{
  for(const pergunta of [
    "E se os tokens acabarem?",
    "Posso continuar com meu número atual no WhatsApp Business?",
    "WhatsApp com risco de bloqueio?",
    "Como funciona a janela de 24 horas?",
    "Quanto custa o número adicional?",
    "Quantos usuários e setores posso ter?",
    "Posso fazer follow-up automático?",
    "Quais as opções de Google Calendar?",
    "Tem white label para revender?",
    "Tem integração com n8n ou API externa?",
    "Qual política LGPD e de retenção?",
    "Preciso saber programar para usar?",
    "Como funciona o cancelamento?",
    "Tem email marketing?",
  ]) assert.equal(consultaFaqProduto(pergunta),pergunta,pergunta);
});
test("saudação simples e continuação curta não exigem pré-consulta",()=>{
  for(const msg of ["Oi","Oii","Bom dia","Pode ser","Sim","Vou avaliar e retorno","Quero conhecer"]) {
    assert.equal(consultaFaqProduto(msg),null,msg);
  }
});
test("respeita frase original, acentos e limite da consulta",()=>{
  const pergunta="Meu número atual está no WhatsApp Business, posso continuar usando no celular?";
  assert.equal(consultaFaqProduto(pergunta),pergunta);
  assert.equal(consultaFaqProduto("Preciso de suporte "+"X".repeat(250))?.length,140);
});
