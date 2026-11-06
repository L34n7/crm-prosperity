import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../src/lib/cotacoes-veiculares/identificacao.ts",import.meta.url),"utf8");
const trecho=source.split("const modelosConhecidos:")[1]?.split("export type IdentificacaoMarca")[0]||"";
const dicas=[...trecho.matchAll(/\{regex:\/([^/]+)\/,marca:"([^"]+)"/g)]
 .map(([,regex,marca])=>({regex:new RegExp(regex),marca}));
const casos:Record<string,string>={
 "Tera":"Volkswagen","SpaceFox":"Volkswagen","CrossFox":"Volkswagen",
 "HB20S":"Hyundai","HB20X":"Hyundai","i20":"Hyundai",
 "Kardian":"Renault","Clio":"Renault","Fluence":"Renault",
 "Kait":"Nissan","Sonic":"Chevrolet","Agile":"Chevrolet",
 "Idea":"Fiat","Linea":"Fiat","Avenger":"Jeep",
 "Haval H6":"GWM","Rampage":"RAM","Omoda 5":"Omoda",
 "Jaecoo 7":"Jaecoo","206":"Peugeot","207":"Peugeot",
 "Bros":"Honda","Titan":"Honda",
};
test("os modelos populares adicionais identificam apenas a marca sugerida",()=>{
 for(const [modelo,marca] of Object.entries(casos)){
  const encontrado=dicas.find(d=>d.regex.test(modelo.toLowerCase()));
  assert.equal(encontrado?.marca,marca,modelo);
 }
});
test("sem confundir nomes numéricos e sem presumir versões FIPE",()=>{
 for(const modelo of ["5","7","20","GS"]){
  assert.equal(dicas.find(d=>d.regex.test(modelo.toLowerCase())),undefined,modelo);
 }
});
