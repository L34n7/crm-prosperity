import assert from "node:assert/strict";
import test from "node:test";
import {
  codigoGrupoOpcional,rotuloGrupoOpcional,listarGruposOpcionais,
} from "../src/lib/cotacoes-veiculares/grupos-opcionais.ts";

test("criando Rastreador, usuário vê Grupo Rastreador sem código técnico",()=>{
  const codigo=codigoGrupoOpcional("Rastreador");
  assert.equal(codigo,"rastreador");
  assert.equal(rotuloGrupoOpcional(codigo),"Grupo Rastreador");
});

test("aceita nome já começando por Grupo sem duplicar prefixo",()=>{
  assert.equal(codigoGrupoOpcional("Grupo Rastreador"),"rastreador");
  assert.equal(codigoGrupoOpcional("Grupo Carro Reserva"),"carro_reserva");
  assert.equal(rotuloGrupoOpcional("carro_reserva"),"Grupo Carro reserva");
});

test("grupos legados continuam selecionáveis sem migração",()=>{
  const opcoes=listarGruposOpcionais([
    {grupo_exclusivo:"carro_reserva"},
    {grupo_exclusivo:"rastreador"},
    {grupo_exclusivo:"carro_reserva"},
    {grupo_exclusivo:""},
  ]);
  assert.deepEqual(opcoes,["carro_reserva","rastreador"]);
  assert.equal(rotuloGrupoOpcional(""),"Sem grupo");
});

test("normalização: acentos, caracteres especiais, espaços e limite do banco",()=>{
  assert.equal(codigoGrupoOpcional("Assistência à terceiros"),"assistencia_a_terceiros");
  assert.equal(codigoGrupoOpcional("  Grupo   Vidros e Faróis  "),"vidros_e_farois");
  assert.ok(codigoGrupoOpcional("Teste ".repeat(30)).length<=50);
});
