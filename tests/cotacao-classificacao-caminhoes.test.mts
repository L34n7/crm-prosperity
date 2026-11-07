import assert from "node:assert/strict";
import test from "node:test";
import {categoriaAutomaticaCaminhao,tracaoIndicadaNaFipe}
  from "../src/lib/cotacoes-veiculares/classificacao-caminhoes.ts";
import {categoriaAutomaticaPorFipe,categoriaBaseEfetivaFipe}
  from "../src/lib/cotacoes-veiculares/classificacao-automatica.ts";

test("todo item do tipo FIPE trucks recebe o PADRÃO comercial pesado",()=>{
  for(const nome of [
    "FH-540 GLOBETROTTER 8X4 2p (diesel)(E5)",
    "11-180 Delivery 2p (diesel)(E5)",
    "Cargo 2429 6x2",
    "FH-540 4x2 2p (diesel)",
    "CAMINHAO 11.180",
    "Volkswagen Delivery",
    "",
  ]){
    assert.equal(categoriaAutomaticaCaminhao(nome),"caminhao_pesado",nome);
    assert.equal(categoriaAutomaticaPorFipe("trucks",nome),"caminhao_pesado",nome);
  }
});
test("tração exibida, sem inferir categoria leve ou pesada pelo número dos eixos",()=>{
  assert.equal(tracaoIndicadaNaFipe("FH-540 GLOBETROTTER 8X4 2p"),"8X4");
  assert.equal(tracaoIndicadaNaFipe("Cargo 6 x 2 diesel"),"6X2");
  assert.equal(tracaoIndicadaNaFipe("VW 11.180 Delivery"),null);
  assert.equal(tracaoIndicadaNaFipe("Motor 4.0 Diesel"),null);
});
test("FIPE: automóveis, motos, vans e veículos de passeio",()=>{
 const cenarios=[
  ["cars","TOYOTA COROLLA 2.0 FLEX","auto_leves"],
  ["cars","FORD RANGER 3.2 4X4 DIESEL","auto_leves"],
  ["cars","MERCEDES-BENZ SPRINTER 415","van_utilitario"],
  ["cars","VAN PASSAGEIROS 16L","van_utilitario"],
  ["cars","FURGÃO 2.3 DIESEL","van_utilitario"],
  ["cars","MICRO-ÔNIBUS","van_utilitario"],
  ["cars","NISSAN VERSA 1.6","auto_leves"],
  ["motorcycles","HONDA XR 250 TORNADO","motocicleta"],
  ["motorcycles","YAMAHA FACTOR","motocicleta"],
 ];
 for(const [tipo,modelo,esperada] of cenarios){
   assert.equal(categoriaAutomaticaPorFipe(tipo as "cars"|"motorcycles"|"trucks",modelo),
     esperada,modelo);
 }
});
test("classificação manual prevalece sobre categoria anterior do catálogo FIPE",()=>{
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:"caminhao_leve",origemClassificacao:"manual",
   categoriaCatalogo:"caminhao_pesado",
 }),"caminhao_leve");
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:"agregado",origemClassificacao:"manual",
   categoriaCatalogo:"caminhao_pesado",
 }),"agregado");
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:"especiais",origemClassificacao:"manual",
   categoriaCatalogo:"auto_leves",
 }),"especiais");
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:null,origemClassificacao:"manual",
   categoriaCatalogo:"caminhao_pesado",
 }),null);
});
test("sem classificação manual respeita categoria por ano, com fallback automático",()=>{
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:"caminhao_pesado",origemClassificacao:"automatica",
   categoriaCatalogo:null,
 }),"caminhao_pesado");
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:"auto_leves",origemClassificacao:"automatica",
   categoriaCatalogo:"van_utilitario",
 }),"van_utilitario");
 assert.equal(categoriaBaseEfetivaFipe({
   categoriaClassificacao:"motocicleta",origemClassificacao:"automatica",
   categoriaCatalogo:undefined,
 }),"motocicleta");
});
