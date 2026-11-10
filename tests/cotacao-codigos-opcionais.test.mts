import assert from "node:assert/strict";
import test from "node:test";
import {gerarCodigosOpcionais} from "../src/lib/cotacoes-veiculares/codigos-opcionais.ts";
import type {OpcionalComercial} from "../src/lib/cotacoes-veiculares/comercial.ts";

function opcional(nome:string,codigo=""):OpcionalComercial{
  return {codigo,nome,valor_centavos:2000,ativo:true,grupo_exclusivo:""};
}
test("gera código técnico no servidor sem exigir input do cliente",()=>{
  const resultado=gerarCodigosOpcionais([
    opcional("Carro reserva 7 dias"),opcional("Assistência à terceiros"),
  ],[]);
  assert.deepEqual(resultado.map(v=>v.codigo),[
    "carro_reserva_7_dias","assistencia_a_terceiros",
  ]);
});
test("mantém códigos já utilizados mesmo quando o nome é editado",()=>{
  const anterior=[{codigo:"reserva_7",nome:"Carro reserva 7 dias"}];
  const novo=gerarCodigosOpcionais([opcional("Carro reserva por 7 dias","reserva_7")],anterior);
  assert.equal(novo[0].codigo,"reserva_7");
});
test("não confia em código novo vindo do browser e trata colisões",()=>{
  const gerados=gerarCodigosOpcionais([
    opcional("Vidros","codigo_escolhido_pelo_cliente"),
    opcional("Vidros"),opcional("Vidros"),
  ],[{codigo:"vidros",nome:"Outro opcional"}]);
  assert.deepEqual(gerados.map(v=>v.codigo),["vidros_2","vidros_3","vidros_4"]);
});
test("reutiliza código de nome legado e desambigua novos opcionais",()=>{
  const gerados=gerarCodigosOpcionais([
    opcional("Rastreador"),
    opcional("Carro reserva 15 dias"),
  ],[{codigo:"rastreador",nome:"Rastreador"}]);
  assert.equal(gerados[0].codigo,"rastreador");
  assert.equal(gerados[1].codigo,"carro_reserva_15_dias");
});
