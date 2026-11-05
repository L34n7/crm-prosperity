import assert from "node:assert/strict";
import test from "node:test";
import {
  classificarFalhaCotacao,
  contemDetalheInternoCotacao,
  respostaSeguraFalhaCotacao,
} from "../src/lib/agentes-ia/cotacao-erros-publicos.ts";

const mensagemFaixa =
  "O valor FIPE deste veículo (R$ 2.400.000,00) ultrapassa a maior faixa cadastrada " +
  "para sua categoria (R$ 350.000,00). Não há mensalidade definida para este valor. " +
  "Atualize a tabela de preços do plano antes de cotar.";

test("limite de faixa jamais chega ao cliente", () => {
  const falha = classificarFalhaCotacao(mensagemFaixa);
  assert.equal(falha.tipo, "comercial");
  const resposta = respostaSeguraFalhaCotacao(mensagemFaixa, [
    "Não foi possível calcular porque ultrapassa a maior faixa cadastrada.",
  ]).join(" ");
  assert.equal(contemDetalheInternoCotacao(resposta), false);
  assert.doesNotMatch(resposta, /faixa|tabela|fipe|categoria|atualiz/i);
  assert.match(resposta, /equipe pode verificar as opções/i);
});

test("tabela de outros e cadastro interno nunca são informados", () => {
  for (const erro of [
    "Será necessário atualizar a tabela de outros.",
    "Nenhum plano disponível para este veículo. Confira os critérios de aceitação, a categoria e as faixas de preço cadastradas.",
    "Configuração comercial pendente: importe as tabelas de preços.",
    "Este veículo precisa de classificação comercial interna. Encaminhe à equipe para configurá-lo diretamente no banco de dados.",
  ]) {
    const falha = classificarFalhaCotacao(erro);
    assert.equal(falha.tipo, "comercial", erro);
    assert.equal(contemDetalheInternoCotacao(respostaSeguraFalhaCotacao(erro,[erro]).join(" ")),false);
  }
});

test("falha comercial não inventa mensalidade nem divulga preço FIPE", () => {
  const resposta = respostaSeguraFalhaCotacao(mensagemFaixa, [
    "Não consigo calcular, o preço ultrapassa o teto.",
  ]).join(" ");
  assert.doesNotMatch(resposta, /R\$|mensalidade|2.400.000|faixa/i);
});

test("pergunta de versão continua possível quando não há erro comercial", () => {
  const erro="Não encontrei esta descrição exata nos modelos FIPE. Confirme somente a versão ou motorização.";
  const resposta="Pode me informar a motorização exata do Vectra? 😊";
  assert.equal(classificarFalhaCotacao(erro).tipo,"versao");
  assert.deepEqual(respostaSeguraFalhaCotacao(erro,[resposta]),[resposta]);
});

test("falha na consulta recebe mensagem amigável e não detalhes do provedor", () => {
  const resposta=respostaSeguraFalhaCotacao("Consulta FIPE indisponível no momento (503).",[
    "Erro da API FIPE: 503.",
  ]).join(" ");
  assert.match(resposta,/Não consegui consultar os dados desse veículo/i);
  assert.doesNotMatch(resposta,/FIPE|503|API/i);
});

test("bloqueia vazamentos de texto técnico mesmo em consulta ambígua", () => {
  assert.equal(contemDetalheInternoCotacao(
    "A tabela de outros precisa ser atualizada para gerar o preço."
  ), true);
  const resposta = respostaSeguraFalhaCotacao(
    "Informe uma versão mais específica para o ano-modelo 2000.",
    ["A tabela de outros precisa ser atualizada para gerar o preço."],
  ).join(" ");
  assert.doesNotMatch(resposta,/tabela|preço|categoria/i);
});
