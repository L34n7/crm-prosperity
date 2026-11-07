import assert from "node:assert/strict";
import test from "node:test";
import {usoComercialInferivelFipe} from "../src/lib/cotacoes-veiculares/uso-automatico.ts";

test("caminhões FIPE inferem comercial independentemente da tração",()=>{
  for(const descricaoFipe of [
    "FH-540 GLOBETROTTER 8X4 2p (diesel)(E5)",
    "11-180 Delivery 2p (diesel)(E5)",
    "FH 540 4X2 diesel",
    "Cargo 2429 6x2",
  ]){
    assert.equal(usoComercialInferivelFipe({
      tipo:"trucks",categoria:"caminhao_pesado",descricaoFipe,
      mensagensPedido:["Quero cotar um caminhão","2021"],
    }),"comercial",descricaoFipe);
  }
});
test("categoria comercial manual de caminhão leve e agregado pode inferir uso",()=>{
  assert.equal(usoComercialInferivelFipe({
    tipo:"trucks",categoria:"caminhao_leve",descricaoFipe:"Cargo 11.180"
  }),"comercial");
  assert.equal(usoComercialInferivelFipe({
    tipo:"trucks",categoria:"agregado",descricaoFipe:"11-180"
  }),"comercial");
});
test("van de carga e furgão são comerciais por padrão",()=>{
  for(const descricaoFipe of [
    "Sprinter 415 CDI Furgão 2.2 diesel",
    "Ducato Cargo",
    "Transit Furg.",
    "Master Van Carga",
  ]){
    assert.equal(usoComercialInferivelFipe({
      tipo:"cars",categoria:"van_utilitario",descricaoFipe,
    }),"comercial",descricaoFipe);
  }
  assert.equal(usoComercialInferivelFipe({
    tipo:"cars",categoria:"van_utilitario",descricaoFipe:"Sprinter 415 CDI",
    mensagensPedido:["Quero cotar van de carga","2022"]
  }),"comercial");
});
test("van de passageiros e van genérica exigem confirmação de finalidade",()=>{
  for(const descricaoFipe of [
    "Sprinter Passageiros 16 lugares",
    "Master Minibus",
    "Van Escolar",
    "Sprinter 415 CDI",
    "Van Turismo",
    "Kombi",
  ]){
    assert.equal(usoComercialInferivelFipe({
      tipo:"cars",categoria:"van_utilitario",descricaoFipe,
    }),null,descricaoFipe);
  }
  assert.equal(usoComercialInferivelFipe({
    tipo:"cars",categoria:"van_utilitario",descricaoFipe:"Master Van de carga passageiros",
  }),null);
});
test("picapes e automóveis nunca ganham uso presumido comercial",()=>{
  for(const descricaoFipe of ["Ranger 4x4 diesel","Hilux CD","Civic EXL","Saveiro Robust"]){
    assert.equal(usoComercialInferivelFipe({
      tipo:"cars",categoria:"auto_leves",descricaoFipe,
    }),null,descricaoFipe);
  }
});
test("caminhão de lazer ou motorhome não presume finalidade comercial",()=>{
  for(const mensagem of ["Quero cotar meu caminhão motorhome",
    "É para lazer","Viagem com a família","Uso pessoal somente"]){
    assert.equal(usoComercialInferivelFipe({
      tipo:"trucks",categoria:"caminhao_pesado",
      descricaoFipe:"FH-540 8x4",mensagensPedido:[mensagem]
    }),null,mensagem);
  }
});
