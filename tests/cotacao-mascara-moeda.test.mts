import assert from "node:assert/strict";
import test from "node:test";
import {
  formatarCentavosMoedaBR,
  centavosDaDigitacaoMoedaBR,
  centavosDoTextoColadoMoedaBR,
} from "../src/lib/cotacoes-veiculares/mascara-moeda.ts";

const MAX_TAXA=100_000_000;
const MAX_FIPE=2_000_000_000;

test("valores exibidos em português brasileiro com milhares e centavos",()=>{
  assert.equal(formatarCentavosMoedaBR(100000),"1.000,00");
  assert.equal(formatarCentavosMoedaBR(5000000),"50.000,00");
  assert.equal(formatarCentavosMoedaBR(3500000),"35.000,00");
  assert.equal(formatarCentavosMoedaBR(15000),"150,00");
  assert.equal(formatarCentavosMoedaBR(100000000),"1.000.000,00");
  assert.equal(formatarCentavosMoedaBR(1),"0,01");
  assert.equal(formatarCentavosMoedaBR(0),"0,00");
  assert.equal(formatarCentavosMoedaBR(null),"");
});

test("digitação de números acrescenta centavos e separadores progressivamente",()=>{
  const entradas=["1","10","100","1000","10000","100000","1000000"];
  const exibidos=["0,01","0,10","1,00","10,00","100,00","1.000,00","10.000,00"];
  entradas.forEach((entrada,i)=>{
    const centavos=centavosDaDigitacaoMoedaBR(entrada,MAX_FIPE);
    assert.equal(centavos,Number(entrada),entrada);
    assert.equal(formatarCentavosMoedaBR(centavos??null),exibidos[i],entrada);
    assert.equal(centavosDaDigitacaoMoedaBR(exibidos[i],MAX_FIPE),centavos);
  });
});

test("campos opcionais permitem zerar/limpar sem transformar vazio em cobrança",()=>{
  assert.equal(centavosDaDigitacaoMoedaBR("",MAX_TAXA),null);
  assert.equal(centavosDaDigitacaoMoedaBR("  ",MAX_TAXA),null);
  assert.equal(centavosDaDigitacaoMoedaBR("0,00",MAX_TAXA),0);
  assert.equal(centavosDaDigitacaoMoedaBR("abc",MAX_TAXA),undefined);
});

test("colar valor brasileiro interpreta reais corretamente",()=>{
  for(const [texto,esperado] of [
    ["1.000,00",100000],
    ["R$ 1.000,00",100000],
    ["R$ 150,00",15000],
    ["50.000,00",5000000],
    ["35.000,00",3500000],
    ["1000",100000],
    ["1,5",150],
    ["0,01",1],
    ["0",0],
  ] as const){
    assert.equal(centavosDoTextoColadoMoedaBR(texto,MAX_FIPE),esperado,texto);
  }
});

test("não aceitar valores acima do limite ou dados malformados",()=>{
  assert.equal(centavosDaDigitacaoMoedaBR("1.000.000,01",MAX_TAXA),undefined);
  assert.equal(centavosDaDigitacaoMoedaBR("20.000.000,01",MAX_FIPE),undefined);
  assert.equal(centavosDoTextoColadoMoedaBR("1.000.000,01",MAX_TAXA),undefined);
  assert.equal(centavosDoTextoColadoMoedaBR("-1,00",MAX_TAXA),undefined);
  assert.equal(centavosDoTextoColadoMoedaBR("1,2,3",MAX_TAXA),undefined);
  assert.equal(centavosDoTextoColadoMoedaBR("abc",MAX_TAXA),undefined);
  assert.equal(centavosDoTextoColadoMoedaBR("1.000,000",MAX_TAXA),undefined);
  assert.equal(centavosDoTextoColadoMoedaBR("",MAX_TAXA),null);
});

test("formatar e editar não altera centavos persistidos em reabertura do plano",()=>{
  for(const centavos of [0,1,150,15000,5000000,3500000,100000000]){
    const exibido=formatarCentavosMoedaBR(centavos);
    assert.equal(centavosDaDigitacaoMoedaBR(exibido,MAX_FIPE),centavos);
  }
});
