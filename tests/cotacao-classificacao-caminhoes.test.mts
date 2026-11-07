import assert from "node:assert/strict";
import test from "node:test";
import {categoriaAutomaticaCaminhao} from "../src/lib/cotacoes-veiculares/classificacao-caminhoes.ts";

test("FIPE com configuração multieixo inequivocamente pesada é categorizada",()=>{
 for(const nome of [
   "FH-540 GLOBETROTTER 8X4 2p (diesel)(E5)",
   "Caminhão basculante 8x2 2p",
   "Caminhão 10X4",
   "CAMINHAO 12 × 6",
 ]){
   assert.equal(categoriaAutomaticaCaminhao(nome),"caminhao_pesado",nome);
 }
});
test("marca, modelo, potência e valor FIPE não autorizam adivinhar categoria",()=>{
 for(const nome of [
   "11-180 Delivery 2p (diesel)(E5)",
   "Cargo 2429 6x2",
   "FH-540 4x2 2p (diesel)",
   "Truck 6x4",
   "Caminhão 11.180",
   "Volkswagen Delivery",
   "",
 ]){
   assert.equal(categoriaAutomaticaCaminhao(nome),null,nome);
 }
});
