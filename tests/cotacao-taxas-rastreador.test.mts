import assert from "node:assert/strict";
import test from "node:test";
import {
  CONDICOES_CONTRATACAO_PADRAO,
  calcularTaxasContratacao,
  normalizarCondicoesContratacao,
  validarCondicoesContratacao,
  condicoesExclusivasDoPlano,
} from "../src/lib/cotacoes-veiculares/condicoes-contratacao.ts";
import {formatarPropostaVeicular} from "../src/lib/cotacoes-veiculares/formatar-proposta.ts";

const savecar={
  ...CONDICOES_CONTRATACAO_PADRAO,
  adesao_ativa:true,adesao_centavos:null,
  rastreador_ativo:true,
  rastreador_carro_acima_centavos:5000000,
  rastreador_moto_acima_centavos:3500000,
  rastreador_instalacao_centavos:15000,
  rastreador_mensalidade_inclusa:true,
};
const quote=(valor:number,categoria:"auto_leves"|"motocicleta"|"app_taxi"|"van_utilitario"|"especiais"|"caminhao_pesado",tipo?:"cars"|"motorcycles"|"trucks")=>
  calcularTaxasContratacao({
    condicoes:savecar,valorFipeCentavos:valor,categoria,tipoFipe:tipo,
  });

test("SaveCar: 50 mil exatos nao obriga rastreador; acima obriga instalacao",()=>{
  assert.equal(quote(5000000,"auto_leves","cars").rastreador_obrigatorio,false);
  const alto=quote(5000001,"auto_leves","cars");
  assert.equal(alto.rastreador_obrigatorio,true);
  assert.equal(alto.rastreador_instalacao_centavos,15000);
  assert.equal(alto.rastreador_mensalidade_adicional_centavos,0);
  assert.equal(alto.taxas_unicas_centavos,null); // adesão ainda não informada
});

test("SaveCar: motocicleta apenas acima de 35 mil e sem taxa mensal extra",()=>{
  assert.equal(quote(3500000,"motocicleta","motorcycles").rastreador_obrigatorio,false);
  const acima=quote(3500001,"motocicleta","motorcycles");
  assert.equal(acima.rastreador_obrigatorio,true);
  assert.equal(acima.rastreador_instalacao_centavos,15000);
  assert.equal(acima.rastreador_mensalidade_adicional_centavos,0);
});

test("FIPE reconhece tipo real para categoria especial, mas nao cobra rastreador em caminhoes e vans",()=>{
  assert.equal(quote(6000000,"especiais","cars").rastreador_obrigatorio,true);
  assert.equal(quote(6000000,"especiais","motorcycles").rastreador_obrigatorio,true);
  assert.equal(quote(6000000,"especiais","trucks").rastreador_obrigatorio,false);
  assert.equal(quote(6000000,"caminhao_pesado","trucks").rastreador_obrigatorio,false);
  assert.equal(quote(6000000,"van_utilitario").rastreador_obrigatorio,false);
  assert.equal(quote(6000000,"van_utilitario","cars").rastreador_obrigatorio,false);
  assert.equal(quote(6000000,"app_taxi","cars").rastreador_obrigatorio,true);
});

test("taxa de adesao cadastrada permite somar apenas taxas unicas",()=>{
  const t=calcularTaxasContratacao({
    condicoes:{...savecar,adesao_centavos:10000},
    categoria:"auto_leves",tipoFipe:"cars",valorFipeCentavos:6000000,
  });
  assert.equal(t.adesao_centavos,10000);
  assert.equal(t.rastreador_instalacao_centavos,15000);
  assert.equal(t.taxas_unicas_centavos,25000);
  assert.equal(t.rastreador_mensalidade_adicional_centavos,0);
});

test("rastreador fora da mensalidade retorna somente adicional declarado",()=>{
  const c={...savecar,
    rastreador_mensalidade_inclusa:false,
    rastreador_mensalidade_adicional_centavos:3900,
  };
  assert.deepEqual(validarCondicoesContratacao(c),c);
  const t=calcularTaxasContratacao({
    condicoes:c,categoria:"auto_leves",valorFipeCentavos:6000000,
  });
  assert.equal(t.rastreador_mensalidade_adicional_centavos,3900);
  assert.equal(t.rastreador_mensalidade_inclusa,false);
});

test("configuração vazia mantém propostas antigas sem taxas novas",()=>{
  const c=normalizarCondicoesContratacao(null);
  const t=calcularTaxasContratacao({
    condicoes:c,categoria:"auto_leves",valorFipeCentavos:8000000,
  });
  assert.equal(t.adesao_ativa,false);
  assert.equal(t.rastreador_obrigatorio,false);
  assert.equal(t.taxas_unicas_centavos,0);
});

test("backend não aceita taxas inválidas, mensais omitidas ou rastreador sem limites",()=>{
  for(const v of [
    {...savecar,adesao_centavos:-5},
    {...savecar,rastreador_instalacao_centavos:1.5},
    {...savecar,rastreador_carro_acima_centavos:null,
      rastreador_moto_acima_centavos:null},
    {...savecar,rastreador_mensalidade_inclusa:false,
      rastreador_mensalidade_adicional_centavos:0},
    {...savecar,adesao_ativa:"sim"},
  ])assert.throws(()=>validarCondicoesContratacao(v));
});

const proposta=(taxas:ReturnType<typeof quote>)=>formatarPropostaVeicular({
  veiculo:"Yamaha XJ6 F",anoModelo:2013,uso:"Particular",
  planos:[{
    plano_nome:"Premium",mensalidade_base_centavos:18990,
    cota_participacao_centavos:250000,
    terceiros_limite_centavos:3000000,
    assistencia_km_total:200,assistencias_ano:3,
    carro_reserva_incluso_dias:0,coberturas:["Roubo e furto"],
    opcionais:[],observacoes:"",tabela_validada:true,
    ...taxas,
  }],
});

test("proposta da SaveCar exibe adesão a confirmar e taxa de instalação sem duplicar mensalidade",()=>{
  const mensagem=proposta(quote(6000000,"auto_leves","cars"));
  assert.match(mensagem,/Mensalidade: R\$\s*189,90\/mês/);
  assert.match(mensagem,/Adesão: valor a confirmar/);
  assert.match(mensagem,/Instalação: R\$\s*150,00/);
  assert.match(mensagem,/já incluída no preço informado/);
  assert.doesNotMatch(mensagem,/60\.000|60,000/);
  assert.doesNotMatch(mensagem,/Total das taxas únicas: R\$/);
});

test("proposta sem rastreador nem adesão não exibe seção financeira indevida",()=>{
  const taxas=calcularTaxasContratacao({
    condicoes:CONDICOES_CONTRATACAO_PADRAO,
    categoria:"auto_leves",valorFipeCentavos:6000000,
  });
  const mensagem=proposta(taxas);
  assert.doesNotMatch(mensagem,/TAXAS DE CONTRATAÇÃO/);
  assert.doesNotMatch(mensagem,/Rastreador obrigatório/);
});

test("proposta com valor informado apresenta total correto das taxas únicas",()=>{
  const taxas=calcularTaxasContratacao({
    condicoes:{...savecar,adesao_centavos:10000},
    categoria:"auto_leves",valorFipeCentavos:6000000,
  });
  const mensagem=proposta(taxas);
  assert.match(mensagem,/Adesão: R\$\s*100,00/);
  assert.match(mensagem,/Total das taxas únicas: R\$\s*250,00/);
});

test("condições são independentes: alterar Premium não muda Completo",()=>{
  const configuradas={
    premium:{...savecar,adesao_centavos:10000},
    completo:{...savecar,adesao_centavos:15000},
  };
  assert.equal(condicoesExclusivasDoPlano(configuradas,"premium").adesao_centavos,10000);
  assert.equal(condicoesExclusivasDoPlano(configuradas,"completo").adesao_centavos,15000);
  const novaPremium={...configuradas.premium,adesao_centavos:20000};
  const atualizadas={...configuradas,premium:novaPremium};
  assert.equal(condicoesExclusivasDoPlano(atualizadas,"premium").adesao_centavos,20000);
  assert.equal(condicoesExclusivasDoPlano(atualizadas,"completo").adesao_centavos,15000);
});

test("plano novo não herda taxas de outro plano nem padrão global",()=>{
  const configuradas={premium:savecar};
  const novo=condicoesExclusivasDoPlano(configuradas,"completo");
  assert.deepEqual(novo,CONDICOES_CONTRATACAO_PADRAO);
  assert.equal(novo.rastreador_ativo,false);
  assert.equal(novo.adesao_ativa,false);
});

test("cada plano preserva rastreador próprio para a cotação",()=>{
  const configuradas={
    premium:{...savecar,rastreador_instalacao_centavos:15000},
    completo:{...savecar,rastreador_instalacao_centavos:18000},
  };
  const calcular=(plano:string)=>calcularTaxasContratacao({
    condicoes:condicoesExclusivasDoPlano(configuradas,plano),
    categoria:"auto_leves",tipoFipe:"cars",valorFipeCentavos:6500000,
  });
  assert.equal(calcular("premium").rastreador_instalacao_centavos,15000);
  assert.equal(calcular("completo").rastreador_instalacao_centavos,18000);
});
