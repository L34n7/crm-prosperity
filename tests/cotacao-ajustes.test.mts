import assert from "node:assert/strict";
import test from "node:test";
import {
  identificarAjusteCotacao,recuperarOpcoesFipe,
  anoCorrigidoCotacao,textoPositivoDaCorrecao,
} from "../src/lib/agentes-ia/ajustes-cotacao.ts";
import {interpretarRespostaOpcoesFipe}
  from "../src/lib/cotacoes-veiculares/orientacao-versoes.ts";

const opcoesAstra=[
  "Astra GLS 2.0",
  "Astra MPI 2.0",
  "Astra MPI 1.8",
];
test("MPI filtra duas versões, mas correção GLS recupera a lista original",()=>{
  const parcial=interpretarRespostaOpcoesFipe("MPI",opcoesAstra);
  assert.deepEqual(parcial.opcoesRestantes,opcoesAstra.slice(1));
  assert.equal(parcial.versaoSelecionada,null);
  const correto=recuperarOpcoesFipe(opcoesAstra,"Não é MPI, na verdade é GLS");
  assert.equal(correto.selecionada,opcoesAstra[0]);
  assert.deepEqual(correto.opcoes,[opcoesAstra[0]]);
  const direto=recuperarOpcoesFipe(opcoesAstra,"respondi errado, é GLS");
  assert.equal(direto.selecionada,opcoesAstra[0]);
  assert.equal(recuperarOpcoesFipe(opcoesAstra,
    "Não é a versão MPI, é GLS").selecionada,opcoesAstra[0]);
  assert.equal(recuperarOpcoesFipe(opcoesAstra,
    "É GLS, não MPI").selecionada,opcoesAstra[0]);
});
test("resposta errada volta às opções anteriores, não fica presa ao filtro",()=>{
  const resposta=recuperarOpcoesFipe(opcoesAstra,"respondi errado");
  assert.equal(resposta.selecionada,null);
  assert.deepEqual(resposta.opcoes,opcoesAstra);
  assert.equal(recuperarOpcoesFipe(opcoesAstra,"na verdade é MPI").opcoes.length,2);
});
test("negativas classificam-se conforme o campo a corrigir",()=>{
 const exemplos=[
  ["Não é esse modelo","modelo"],
  ["o modelo está errado","modelo"],
  ["é outro modelo","modelo"],
  ["É outro veículo","outro_veiculo"],
  ["Na verdade é outro carro","outro_veiculo"],
  ["quero cotar outra moto","outro_veiculo"],
  ["É outro ano","ano"],
  ["O ano está errado","ano"],
  ["Não é 2000, é 2001","ano"],
  ["Não é a versão","versao"],
  ["a versão está errada","versao"],
  ["na verdade é GLS","versao"],
  ["Errei a opção","voltar_opcoes"],
  ["Respondi errado","voltar_opcoes"],
  ["Quero ver as opções","voltar_opcoes"],
  ["O câmbio correto é manual","cambio"],
  ["Não é automático, é manual","cambio"],
  ["A motorização estava errada","motor"],
  ["Não é 2.0, é 1.8","motor"],
  ["Confundi não é 4x2 é 8x2","tracao"],
  ["A tração está errada","tracao"],
  ["Quero falar com atendente","atendente"],
  ["Me transfira para um humano","atendente"],
  ["Quero conversar com uma pessoa","atendente"],
 ] as const;
 for(const [texto,esperada] of exemplos)
   assert.equal(identificarAjusteCotacao(texto,true)?.acao,esperada,texto);
});
test("pistas são positivas; ano negado não se torna ano confirmado",()=>{
 assert.equal(textoPositivoDaCorrecao("não é MPI, é GLS"),"gls");
 assert.equal(textoPositivoDaCorrecao("é GLS, não MPI"),"gls");
 assert.equal(anoCorrigidoCotacao("não é 2000, é 2001"),"2001");
 assert.equal(anoCorrigidoCotacao("era 2001, não 2000"),"2001");
 assert.equal(anoCorrigidoCotacao("é outro ano"),null);
});
test("não inventa intenção de correção em consulta comum",()=>{
 for(const frase of ["MPI","Astra GLS 2.0","2001","ok","qual o plano premium?","vou pensar","não quero contratar"]){
   assert.equal(identificarAjusteCotacao(frase,false),null,frase);
 }
});

test("troca de versão sem nome do campo em ambos os sentidos",()=>{
  for(const frase of ["Não é MPI, é GLS","É GLS, não MPI","Não é essa"]){
    assert.equal(identificarAjusteCotacao(frase,true)?.acao,"versao",frase);
  }
  assert.equal(textoPositivoDaCorrecao("não é a versão MPI, é GLS"),"gls");
  assert.equal(textoPositivoDaCorrecao("é 1.8, não é o motor 2.0"),"1.8");
  assert.equal(textoPositivoDaCorrecao("não é o câmbio automático"),"");
});
test("rejeição comercial não é correção FIPE mesmo com opções anteriores",()=>{
  for(const frase of ["não é esse plano","não é esse valor","mas ficou caro","errei a opção do plano"]){
    assert.equal(identificarAjusteCotacao(frase,true),null,frase);
  }
});
