import assert from "node:assert/strict";
import test from "node:test";
import {normalizarReferenciasFipe,referenciaDaVersaoFipe,versaoConfirmadaNestePedido}
  from "../src/lib/agentes-ia/referencias-fipe.ts";
import {consolidarDadosCotacao,validarDadosNovosCotacao}
  from "../src/lib/agentes-ia/pedido-cotacao.ts";

test("opção FIPE mantém código e tipo da consulta original",()=>{
  const referencias=normalizarReferenciasFipe([
    {name:"VM 270 6x2 2p",code:"1234",tipo:"trucks"},
    {name:"VM 270 6x4 2p",code:"5678",tipo:"trucks"},
    {name:"Outro",code:"../22",tipo:"cars"},
    {name:"Outro 2",code:"15",tipo:"unknown"},
  ]);
  assert.equal(referencias.length,2);
  assert.equal(referenciaDaVersaoFipe(referencias,"VM 270 6x4 2p")?.code,"5678");
  assert.equal(referenciaDaVersaoFipe(referencias,"VM 270 6x4 2p")?.tipo,"trucks");
  assert.equal(referenciaDaVersaoFipe(referencias,"VM 270 4x2 2p"),null);
});

test("acabamento isolado não identifica um veículo novo",()=>{
  const estado=consolidarDadosCotacao(["2000","2.0 gl"],{
    modelo:null,ano_modelo:"2000",uso:null,
  });
  assert.equal(estado.modelo,null);
  assert.equal(validarDadosNovosCotacao(["2000","2.0 gl"],
    "2.0 GL","2000","",true),"Qual é o modelo do novo veículo?");
});

test("falha técnica FIPE difere de ano sem versão",async()=>{
  const {classificarFalhaCotacao}=await import(
    "../src/lib/agentes-ia/cotacao-erros-publicos.ts"
  );
  for(const erro of [
    "Consulta FIPE indisponível: HTTP 429 (cars/brands).",
    "Consulta FIPE indisponível: timeout",
    "Consulta de anos FIPE ficou temporariamente indisponível",
  ])assert.equal(classificarFalhaCotacao(erro).tipo,"consulta",erro);
  assert.equal(classificarFalhaCotacao(
    "Nenhuma versão localizada para o ano-modelo 2010"
  ).tipo,"versao");
});

test("escolha de versão permanece confirmada ao solicitar uso",()=>{
  const opcoes=["DUSTER OUTDOOR 1.6 Mec.","DUSTER DYNAMIQUE 2.0 Aut."];
  assert.equal(versaoConfirmadaNestePedido(opcoes[0],opcoes,opcoes),
    opcoes[0]);
  assert.equal(versaoConfirmadaNestePedido(opcoes[0],opcoes,[]),
    opcoes[0]);
  assert.equal(versaoConfirmadaNestePedido("VERSAO REJEITADA",opcoes,opcoes),
    null);
  assert.equal(versaoConfirmadaNestePedido(null,opcoes,opcoes),null);
});
