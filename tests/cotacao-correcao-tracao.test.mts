import assert from "node:assert/strict";
import test from "node:test";
import {
  clienteCorrigiuVersaoCotacao,
  tracaoCorrigidaCotacao,
  aplicarTracaoCorrigidaCotacao,
  versaoCorrigidaFoiInformada,
  promessaCotacaoSemFerramenta,
  clienteCobraRecalculoPrometido,
  recalculoPrometidoAposCorrecao,
  versaoAnteriorComTracaoCorrigida,
  motorizacaoCorrigidaCotacao,
  cambioInformadoCotacao,
} from "../src/lib/agentes-ia/correcao-cotacao.ts";

test("correções de tração após proposta são reconhecidas de forma genérica",()=>{
  for(const texto of [
    "confundi não é 4x2 é 8x2",
    "Na verdade é 6x2, não 4x2",
    "A tração correta é 6x4",
    "Não era 6x2, era 8x4",
    "4x2 foi um erro, o certo é 8x2",
    "É 8 x 2, não 4 x 2",
  ])assert.equal(clienteCorrigiuVersaoCotacao(texto),true,texto);
  for(const texto of ["4x2 2p diesel","8x2","ok","Particular","Gostei do Premium"])
    assert.equal(clienteCorrigiuVersaoCotacao(texto),false,texto);
});
test("somente a tração afirmada pelo cliente substitui a antiga",()=>{
  assert.equal(tracaoCorrigidaCotacao([
    "FH 460","2016","comercial","4x2 2p diesel","1",
    "confundi não é 4x2 é 8x2",
  ]),"8x2");
  assert.equal(tracaoCorrigidaCotacao(["Não era 6x2, era 8x4"]),"8x4");
  assert.equal(tracaoCorrigidaCotacao(["É 8x2, não 4x2"]),"8x2");
  assert.equal(tracaoCorrigidaCotacao(["Não é 4x2"]),null);
  assert.equal(tracaoCorrigidaCotacao(["4x2 2p diesel"]),null);
  assert.equal(versaoCorrigidaFoiInformada(["FH460","confundi não é 4x2 é 8x2"]),true);
  assert.equal(versaoCorrigidaFoiInformada(["FH460","não é 4x2"]),false);
});
test("a ferramenta nunca preserva a tração obsoleta",()=>{
  assert.equal(aplicarTracaoCorrigidaCotacao("FH-460 4x2 2p diesel","8x2"),
    "FH-460 8x2 2p diesel");
  assert.equal(aplicarTracaoCorrigidaCotacao("FH-460 4X2","8x2"),
    "FH-460 8x2");
  assert.equal(aplicarTracaoCorrigidaCotacao("FH-460 8x2","8x2"),
    "FH-460 8x2");
  assert.equal(aplicarTracaoCorrigidaCotacao("Ranger 2.0 4x4","4x2"),
    "Ranger 2.0 4x2");
});
test("promessas de recálculo sem citar cotação também são detectadas",()=>{
  for(const frase of [
    "Sem problema! Vou recalcular para o caminhão agora.",
    "Vou recalcular para o Volvo FH-460 8x2 2p, ano-modelo 2016.",
    "Desculpe a espera. Vou recalcular agora para o veículo.",
    "Vou gerar a cotação agora.",
    "Vou refazer para o caminhão.",
    "Estou verificando os valores.",
  ])assert.equal(promessaCotacaoSemFerramenta([frase]),true,frase);
  for(const frase of [
    "A proposta já foi gerada e enviada.",
    "A cotação está disponível.",
    "Vou continuar o atendimento.",
    "Qual versão corresponde ao seu veículo?",
  ])assert.equal(promessaCotacaoSemFerramenta([frase]),false,frase);
});
test("após proposta, confirmação de recálculo prometido retoma ferramenta",()=>{
  const depoisDaProposta=[
    {role:"user" as const,content:"confundi não é 4x2 é 8x2"},
    {role:"assistant" as const,content:"Vou recalcular para o veículo na configuração 8x2."},
    {role:"user" as const,content:"ok"},
  ];
  const promessa="Vou recalcular para o caminhão agora.";
  for(const mensagemAtual of ["ok","estou aguardando","Pode gerar","cadê a cotação"]){
    assert.equal(recalculoPrometidoAposCorrecao({
      mensagensAposProposta:depoisDaProposta,
      ultimaRespostaAgente:promessa,mensagemAtual
    }),true,mensagemAtual);
  }
  assert.equal(recalculoPrometidoAposCorrecao({
    mensagensAposProposta:[],
    ultimaRespostaAgente:promessa,mensagemAtual:"ok"
  }),false);
  assert.equal(recalculoPrometidoAposCorrecao({
    mensagensAposProposta:depoisDaProposta,
    ultimaRespostaAgente:"A proposta foi gerada.",mensagemAtual:"ok"
  }),false);
});

test("preserva a versão FIPE previamente confirmada quando só a tração muda",()=>{
  assert.equal(versaoAnteriorComTracaoCorrigida({
    veiculoAnterior:"VOLVO FH-460 4x2 2p (diesel) (E5)",
    anoAnterior:2016,modeloConfirmado:"fh 460",
    anoConfirmado:"2016",tracao:"8x2",
    mensagemCorrecao:"confundi não é 4x2 é 8x2",
  }),"VOLVO FH-460 8x2 2p (diesel) (E5)");
  // Não deve usar proposta anterior de outro veículo ou ano.
  assert.equal(versaoAnteriorComTracaoCorrigida({
    veiculoAnterior:"VOLVO FH-460 4x2 2p (diesel) (E5)",
    anoAnterior:2016,modeloConfirmado:"cargo 2429",
    anoConfirmado:"2016",tracao:"8x2",
    mensagemCorrecao:"não é 4x2 é 8x2",
  }),null);
  assert.equal(versaoAnteriorComTracaoCorrigida({
    veiculoAnterior:"VOLVO FH-460 4x2 2p (diesel) (E5)",
    anoAnterior:2016,modeloConfirmado:"fh 460",
    anoConfirmado:"2017",tracao:"8x2",
    mensagemCorrecao:"não é 4x2 é 8x2",
  }),null);
  // A pessoa alterou também o acabamento: não reutilizar versão anterior.
  assert.equal(versaoAnteriorComTracaoCorrigida({
    veiculoAnterior:"VOLVO FH-460 4x2 2p (diesel) (E5)",
    anoAnterior:2016,modeloConfirmado:"fh 460",
    anoConfirmado:"2016",tracao:"8x2",
    mensagemCorrecao:"não é 4x2, é 8x2 Globetrotter",
  }),null);
});

test("negações não reaproveitam motor, câmbio ou tração antigos",()=>{
  assert.equal(motorizacaoCorrigidaCotacao([
    "Astra MPI 2.0","não é 2.0, é 1.8",
  ]),"1.8");
  assert.equal(motorizacaoCorrigidaCotacao([
    "Astra MPI 2.0","é 1.8, não 2.0",
  ]),"1.8");
  assert.equal(motorizacaoCorrigidaCotacao([
    "Astra MPI 2.0","não é o motor 2.0",
  ]),null);
  assert.equal(cambioInformadoCotacao([
    "automático","é manual, não automático",
  ]),"manual");
  assert.equal(cambioInformadoCotacao([
    "manual","não é manual, é automático",
  ]),"automatico");
  assert.equal(cambioInformadoCotacao([
    "automático","não é automático",
  ]),null);
  assert.equal(tracaoCorrigidaCotacao([
    "4x2","não é a tração 4x2, é 8x2",
  ]),"8x2");
  assert.equal(tracaoCorrigidaCotacao([
    "4x2","não é a tração 4x2",
  ]),null);
});

test("correções no meio das opções e depois da proposta permitem retomar",()=>{
  for(const frase of [
    "respondi errado",
    "não é MPI, é GLS",
    "é outro ano",
    "não é 2000, é 2001",
    "não é esse modelo",
    "não é a versão",
  ])assert.equal(clienteCorrigiuVersaoCotacao(frase),true,frase);

  assert.equal(versaoCorrigidaFoiInformada([
    "Astra MPI 2.0","não é a versão MPI",
  ]),false);
  assert.equal(versaoCorrigidaFoiInformada([
    "Astra MPI 2.0","não é 2.0",
  ]),false);
  assert.equal(versaoCorrigidaFoiInformada([
    "Astra MPI 2.0","não é 2.0, é 1.8",
  ]),true);
  assert.equal(recalculoPrometidoAposCorrecao({
    mensagensAposProposta:[
      {role:"user",content:"não é 2000, é 2001"},
      {role:"assistant",content:"Vou recalcular a cotação agora."},
    ],
    ultimaRespostaAgente:"Vou recalcular a cotação agora.",
    mensagemAtual:"ok",
  }),true);
});
