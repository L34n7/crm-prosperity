import assert from "node:assert/strict";
import test from "node:test";
import {
  resolverMarcaCatalogoFipe,marcaDeclaradaNoPedido,
} from "../src/lib/cotacoes-veiculares/resolver-marca.ts";
import {
  clientePediuNovoVeiculoCotacao,consolidarDadosCotacao,
  DADOS_COTACAO_VAZIOS,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";
import {
  propostaEmitidaCotacao,dadosDaPropostaParaCorrecao,
  normalizarPropostaCotacao,
} from "../src/lib/agentes-ia/estado-pedido-cotacao.ts";
import {
  clienteRejeitouVersoesFipe,novoModeloForaDaLista,
} from "../src/lib/agentes-ia/reorientacao-versoes-cotacao.ts";
import {versaoCorrigidaFoiInformada}
 from "../src/lib/agentes-ia/correcao-cotacao.ts";
import {sugestaoUnicaTracaoFipe}
 from "../src/lib/agentes-ia/sugestao-versao-fipe.ts";
import {diagnosticarIdentificacaoFipe}
 from "../src/lib/cotacoes-veiculares/erros-identificacao.ts";

test("Jaecco: corrigir uma letra usando marcas reais, nunca inventar marca",()=>{
 const marcas=[
  {name:"Jaecoo",code:"999"},{name:"JAC",code:"22"},
  {name:"Jeep",code:"25"},{name:"GWM",code:"44"},
 ];
 const marca=resolverMarcaCatalogoFipe(marcas,"Jaecco");
 assert.equal(marca?.marca.name,"Jaecoo");
 assert.equal(marca?.origem,"correcao_unica");
 assert.equal(resolverMarcaCatalogoFipe(marcas,"JAC")?.origem,"exata");
 assert.equal(resolverMarcaCatalogoFipe(marcas,"GW")?.marca.name,undefined);
 assert.equal(resolverMarcaCatalogoFipe(marcas,"Fabricante inventado"),null);
 const ambiguas=[
  {name:"Borem",code:"1"},{name:"Boram",code:"2"},
 ];
 assert.equal(resolverMarcaCatalogoFipe(ambiguas,"Borim"),null);
});

test("XJ6: marca JAC antiga nao pode ser considerada informada no pedido da moto",()=>{
 const pedido=["Quero ver uma moto","Xj","XJ6 2011","2012"];
 assert.equal(marcaDeclaradaNoPedido("JAC",pedido),false);
 assert.equal(marcaDeclaradaNoPedido("Yamaha",pedido),false);
 assert.equal(marcaDeclaradaNoPedido("Yamaha",[...pedido,"Yamaha"]),true);
 assert.equal(marcaDeclaradaNoPedido("Haval",["Haval H6","2026"]),true);
});

test("mudanca explicita de categoria inicia novo pedido",()=>{
 for(const texto of [
  "Quero ver uma moto","Vamos ver outro carro",
  "Quero consultar um caminhão","Vou cotar uma motocicleta",
 ])assert.equal(clientePediuNovoVeiculoCotacao(texto),true,texto);
 for(const texto of ["Quero outro plano","Quanto custa o seguro?","Quero ver as coberturas"])
  assert.equal(clientePediuNovoVeiculoCotacao(texto),false,texto);
});

test("JAC: comando 'quero ver' nao pode virar modelo chamado 'ver'",()=>{
 const dados=consolidarDadosCotacao(
  ["Não, quero ver outro carro","JAC","2013"],DADOS_COTACAO_VAZIOS
 );
 assert.equal(dados.modelo,null);
 assert.equal(dados.ano_modelo,"2013");
});

test("a nova familia interrompe a lista antiga de modelos",()=>{
 const z4=["Z4 M40i 3.0 340cv Aut.","Z4 Roadster sDRIVE 30i MSport"];
 const j3=["J3 1.4 16V 5p Mec.","J3 S 1.5 Flex","J3 turin Sedan"];
 assert.equal(novoModeloForaDaLista("É BMW XM",z4),"bmw xm");
 assert.equal(novoModeloForaDaLista("Na verdade é JAC J2",j3),"jac j2");
 assert.equal(novoModeloForaDaLista("Yamaha Fazer 250",[
   "XJ6 F","XJ6 N/ABS",
 ]),"yamaha fazer 250");
 assert.equal(novoModeloForaDaLista("BMW Z4",z4),null);
 assert.equal(novoModeloForaDaLista("Sportback",[
   "A3 Sportback 1.8","A3 Sedan 1.8",
 ]),null);
 assert.equal(novoModeloForaDaLista("Não é essa",z4),null);
 assert.equal(clienteRejeitouVersoesFipe("Não é essa"),true);
 assert.equal(clienteRejeitouVersoesFipe("Não é esse modelo"),true);
});

test("apos modelo não encontrado, o ultimo modelo completo substitui o antigo",()=>{
 const mensagens=["BMW XM G09","2020","BMW G310 GS","Particular"];
 const comCorrecao=consolidarDadosCotacao(
   mensagens,DADOS_COTACAO_VAZIOS,true
 );
 assert.equal(comCorrecao.modelo,"g310");
 assert.equal(comCorrecao.ano_modelo,"2020");
 assert.equal(comCorrecao.uso,"particular");
});

test("snapshot da proposta emitida ancora marca, modelo, ano e uso",()=>{
 const proposta=propostaEmitidaCotacao({
   pedidoId:"pedido-1",modeloConsultado:"G310 GS",
   veiculoFipe:"BMW G 310 GS",ano:2020,uso:"particular",
 });
 assert.ok(proposta);
 assert.equal(proposta?.modelo,"BMW G 310 GS");
 assert.deepEqual(dadosDaPropostaParaCorrecao(proposta),{
   modelo:"BMW G 310 GS",ano_modelo:"2020",uso:"particular",
 });
 const nova={...dadosDaPropostaParaCorrecao(proposta),ano_modelo:"2018"};
 assert.equal(nova.modelo,"BMW G 310 GS");
 assert.equal(nova.uso,"particular");
 assert.equal(normalizarPropostaCotacao({
   pedido_id:"p",modelo:"",ano_modelo:"2018",
 }),null);
});

test("Fazer YS gasolina permite RECONSULTA mas não seleção automática",()=>{
 assert.equal(versaoCorrigidaFoiInformada([
   "Não é essa versão","Fazer 250 YS gasolina",
 ]),true);
 assert.equal(versaoCorrigidaFoiInformada([
   "Não é essa versão",
 ]),false);
});

test("5x4: sugerir somente 6x4, exigir confirmação, nunca alterar a tração",()=>{
 const opcoes=[
  "NH-12 460 4x2 2p TA/TB (diesel)",
  "NH-12 460 6x2 2p TA/TB (diesel)",
  "NH-12 460 6x4 2p TA/TB (diesel)",
 ];
 const sugestao=sugestaoUnicaTracaoFipe("5x4",opcoes);
 assert.equal(sugestao?.sugerida,"6x4");
 assert.equal(sugestao?.versao,opcoes[2]);
 assert.equal(sugestaoUnicaTracaoFipe("6x4",opcoes),null);
 assert.equal(sugestaoUnicaTracaoFipe("5x2",opcoes),null);
});

test("ano incompatível pode indicar datas reais sem especulação",()=>{
 const result=diagnosticarIdentificacaoFipe({
   modelo:"R470",anoModelo:"2005",
   possuiModeloNaMarca:true,anosDisponiveis:["2008","2009","2010"],
 });
 assert.equal(result.codigo,"FIPE_ANO_MODELO_NAO_ENCONTRADO");
 assert.match(result.perguntaCliente,/2008, 2009, 2010/);
 const desconhecido=diagnosticarIdentificacaoFipe({
   modelo:"Modelo desconhecido",anoModelo:"2005",possuiModeloNaMarca:false,
 });
 assert.equal(desconhecido.codigo,"FIPE_MODELO_NAO_ENCONTRADO");
});
