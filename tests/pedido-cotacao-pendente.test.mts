import assert from "node:assert/strict";
import test from "node:test";
import {
  clientePediuCotacaoVeicular,
  confirmouProsseguirCotacao,
  validarDadosNovosCotacao,
  modeloComDadosConfirmados,
  clientePediuNovoVeiculoCotacao, clientePediuRetomarCotacao,
  consolidarDadosCotacao, dadosEssenciaisCotacaoConfirmados,
  DADOS_COTACAO_VAZIOS,
} from "../src/lib/agentes-ia/pedido-cotacao.ts";

test("reconhece cotação solicitada para o carro de outra pessoa",()=>{
  assert.equal(clientePediuCotacaoVeicular("quero cotar o carro do meu tio"),true);
  assert.equal(clientePediuCotacaoVeicular("Quanto fica o seguro do meu civic"),true);
  assert.equal(clientePediuCotacaoVeicular("Quero outro"),true);
  assert.equal(clientePediuCotacaoVeicular("Quero cotar outro veículo"),true);
  assert.equal(clientePediuCotacaoVeicular("Qual o valor da cotação anterior?"),false);
  assert.equal(clientePediuCotacaoVeicular("Qual a diferença do plano completo?"),false);
});

test("pedido HR-V em mensagens separadas tem todos os dados necessários",()=>{
  const mensagens=["quero cotar o carro do meu tio","Hrv","2015","Particular"];
  assert.equal(validarDadosNovosCotacao(mensagens,"Honda HR-V","2015","particular"),null);
  assert.equal(modeloComDadosConfirmados(mensagens,"Honda HR-V EX 1.8 Aut."),"HR-V");
});

test("Quero outro não reutiliza veículo nem ano de proposta anterior",()=>{
  assert.equal(validarDadosNovosCotacao(["Quero outro"],"Honda Civic","2015","particular"),
    "Qual é o modelo do novo veículo?");
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox 2010"],"Honda Civic","2015","particular"),
    "Qual é o modelo do novo veículo?");
});

test("nova cotação pede apenas informação ainda não fornecida",()=>{
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox 2010"],"Fox","2010","particular"),
    "Qual é a finalidade de uso do novo veículo: particular, aplicativo, táxi ou comercial?");
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox","Particular"],"Fox","2010","particular"),
    "Qual é o ano-modelo do novo veículo?");
  assert.equal(validarDadosNovosCotacao(["Quero outro","Fox 2010","Particular"],"Fox","2010","particular"),null);
});

test("não incluir motorização e acabamento presumidos pelo modelo",()=>{
  assert.equal(modeloComDadosConfirmados(["Quero outro","Fox 2010","Particular"],
    "Volkswagen Fox 1.0 Mi Total Flex 8V 3p"),"Fox");
  assert.equal(modeloComDadosConfirmados(["Outra cotação","Ranger 2.8 4x4","2005","Particular"],
    "Ford Ranger 2.8 4x4 Diesel"),"Ranger 2.8 4x4");
});

test("permite confirmação de pedido ativo sem iniciar outro",()=>{
  assert.equal(confirmouProsseguirCotacao("Ok"),true);
  assert.equal(confirmouProsseguirCotacao("Pode gerar"),true);
  assert.equal(confirmouProsseguirCotacao("Pode cotar"),true);
  assert.equal(confirmouProsseguirCotacao("Quero outro"),false);
});

test("ano fabricação/modelo usa último ano",()=>{
  assert.equal(validarDadosNovosCotacao(["Quero cotar","Fox 2004/2005","Particular"],
    "Fox","2004/2005","particular"),null);
});


test("abre novo pedido com linguagem natural sem confundir troca de plano",()=>{
  for(const pedido of ["Vamos outro","Vamos outra","Vamos fazer outro","Bora cotar outro","Próximo veículo","Quero outra","Outra cotação","Mais uma cotação","Quero cotar outro carro"]){
    assert.equal(clientePediuNovoVeiculoCotacao(pedido),true,pedido);
    assert.equal(clientePediuCotacaoVeicular(pedido),true,pedido);
  }
  for(const consulta of ["Quero outro plano","Qual a cotação anterior?","Quero comparar o Premium","Pode gerar a cotação agora?"]){
    assert.equal(clientePediuNovoVeiculoCotacao(consulta),false,consulta);
  }
  assert.equal(clientePediuRetomarCotacao("Consegue gerar agora?"),true);
  assert.equal(clientePediuRetomarCotacao("Pode tentar de novo?"),true);
  assert.equal(clientePediuRetomarCotacao("Quero outro"),false);
});

test("Vectra 2000 em mensagens distintas completa o pedido sem reutilizar Tiguan",()=>{
  let dados={...DADOS_COTACAO_VAZIOS};
  for(const [mensagem, completo] of [
    ["Vamos outro",false],
    ["Vectra 2000",false],
    ["Particular",true],
  ] as const){
    dados=consolidarDadosCotacao([mensagem],dados);
    assert.equal(dadosEssenciaisCotacaoConfirmados(dados),completo,mensagem);
  }
  assert.deepEqual(dados,{modelo:"vectra",ano_modelo:"2000",uso:"particular"});
  assert.equal(validarDadosNovosCotacao(["Vamos outro","Vectra 2000","Particular"],"Vectra","2000","particular"),null);
});

test("HR-V e Tiguan preservam separadamente modelo ano e uso",()=>{
  const hrv=consolidarDadosCotacao(["quero cotar o carro do meu tio","HR-V","2015","Particular"]);
  assert.deepEqual(hrv,{modelo:"hr v",ano_modelo:"2015",uso:"particular"});
  const tiguan=consolidarDadosCotacao(["Quero outra","Tiguan","2.0 2010","Particular"]);
  assert.deepEqual(tiguan,{modelo:"tiguan",ano_modelo:"2010",uso:"particular"});
  assert.equal(dadosEssenciaisCotacaoConfirmados(hrv),true);
  assert.equal(dadosEssenciaisCotacaoConfirmados(tiguan),true);
  assert.equal(dadosEssenciaisCotacaoConfirmados(consolidarDadosCotacao(["Quero outra"])),false);
  assert.equal(dadosEssenciaisCotacaoConfirmados(consolidarDadosCotacao(["Quero outra","2015","Particular"])),false);
});

test("não confunde modelo numérico Peugeot 2008 com ano-modelo",()=>{
  const parcial=consolidarDadosCotacao(["Quero cotar Peugeot 2008","Particular"]);
  assert.equal(parcial.modelo,"2008");
  assert.equal(parcial.ano_modelo,null);
  const final=consolidarDadosCotacao(["2021"],parcial);
  assert.equal(final.ano_modelo,"2021");
  assert.equal(dadosEssenciaisCotacaoConfirmados(final),true);
});

test("ano 2004/2005 e dados de uso não herdam informações do pedido anterior",()=>{
  const anterior=consolidarDadosCotacao(["Tiguan","2010","Particular"]);
  assert.equal(dadosEssenciaisCotacaoConfirmados(anterior),true);
  const atual=consolidarDadosCotacao(["Quero outra","Ranger 2004/2005 4x4 CD diesel"]);
  assert.equal(atual.ano_modelo,"2005");
  assert.equal(atual.modelo,"ranger");
  assert.equal(atual.uso,null);
  assert.equal(dadosEssenciaisCotacaoConfirmados(atual),false);
});


test("modelo é indicado sem confundir 4x4 com a família do veículo",()=>{
  const dados=consolidarDadosCotacao(["Ranger 2004/2005 4x4 CD diesel"]);
  assert.deepEqual(dados,{modelo:"ranger",ano_modelo:"2005",uso:null});
});


test("Peugeot 2008 com ano-modelo em mesma mensagem mantém números distintos",()=>{
  const dados=consolidarDadosCotacao(["Quero cotar Peugeot 2008 2021, uso particular"]);
  assert.deepEqual(dados,{modelo:"2008",ano_modelo:"2021",uso:"particular"});
});


test("modelo numérico confirmado não se confunde com ano FIPE",()=>{
  assert.equal(validarDadosNovosCotacao(
    ["Quero cotar Peugeot 2008","2021","Particular"],"2008","2021","particular"),null);
  assert.equal(validarDadosNovosCotacao(
    ["Quero cotar Peugeot 2008","2021","Particular"],"Peugeot 2008","2021","particular"),null);
  assert.equal(validarDadosNovosCotacao(
    ["Quero cotar Peugeot 2008","Particular"],"2008","2008","particular"),
    "Qual é o ano-modelo do novo veículo?");
  assert.equal(validarDadosNovosCotacao(
    ["Vamos outro","Vectra 2000","Particular"],"2000","2000","particular"),
    "Qual é o modelo do novo veículo?");
  assert.equal(modeloComDadosConfirmados(
    ["Quero cotar Peugeot 2008","2021","Particular"],"Peugeot 2008"),"Peugeot 2008");
});


test("Astra 2000 não incorpora atributos que não pertencem à identificação FIPE",()=>{
  const mensagens=["Quero cotar","Astra 2000","particular","GLS","16v","manual","sedan","nacional"];
  assert.equal(modeloComDadosConfirmados(
    mensagens,"Astra GLS Sedan 16V manual nacional injeção eletrônica"),
    "Astra GLS Sedan 16V manual");
  assert.equal(modeloComDadosConfirmados(
    mensagens,"Astra GLS 2.0 16V manual"),"Astra GLS 16V manual");
});
