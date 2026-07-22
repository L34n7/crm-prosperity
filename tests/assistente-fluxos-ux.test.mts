import assert from "node:assert/strict";
import test from "node:test";

import { validarExperienciaConversacional } from "../src/lib/automacoes/assistente-fluxos-validador-ux.ts";
import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
} from "../src/lib/automacoes/assistente-fluxos-base.ts";

function no(
  id: string,
  tipo_no: string,
  titulo: string,
  mensagem = "",
  opcoes: Array<{ id: string; titulo: string }> = []
): AssistenteAutomacaoNo {
  return {
    id,
    tipo_no,
    titulo,
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    delay_segundos: null,
    configuracao_json: {
      mensagem,
      ...(tipo_no === "pergunta_opcoes"
        ? {
            opcoes: opcoes.map((opcao) => ({
              valor: opcao.id,
              titulo: opcao.titulo,
            })),
          }
        : {}),
    },
  };
}

function rota(
  id: string,
  origem: string,
  destino: string,
  valor: string,
  rotulo: string
): AssistenteAutomacaoConexao {
  return {
    id,
    no_origem_id: origem,
    no_destino_id: destino,
    rotulo,
    ordem: 1,
    condicao_json: { tipo: "resposta_contem", valor },
    usar_ia: false,
    descricao_ia: null,
  };
}

test("bloqueia botao que promete Menu Principal mas aponta para submenu", () => {
  const menu = no("menu", "pergunta_opcoes", "Menu do procedimento", "Escolha", [
    { id: "voltar", titulo: "Voltar ao Menu Principal" },
  ]);
  const submenu = no("submenu", "pergunta_opcoes", "Outras opções", "Escolha", [
    { id: "fim", titulo: "Encerrar" },
  ]);
  const validacao = validarExperienciaConversacional({
    nos: [menu, submenu],
    conexoes: [rota("c1", "menu", "submenu", "voltar", "Voltar ao Menu Principal")],
  });

  assert.ok(
    validacao.erros.some((erro) => erro.codigo === "UX_RETORNO_MENU_INCORRETO")
  );
});

test("aceita FAQ de recorrencia com resposta semanticamente correspondente", () => {
  const faq = no("faq", "pergunta_opcoes", "Dúvidas Frequentes", "Escolha", [
    { id: "melasma_volta", titulo: "O Melasma volta?" },
  ]);
  const resposta = no(
    "resposta",
    "enviar_texto",
    "Resposta FAQ — recorrência",
    "Pode reaparecer; a manutenção e os cuidados ajudam no controle."
  );
  const validacao = validarExperienciaConversacional({
    nos: [faq, resposta],
    conexoes: [rota("c1", "faq", "resposta", "melasma_volta", "O Melasma volta?")],
  });

  assert.equal(validacao.erros.length, 0, JSON.stringify(validacao.erros));
});

test("bloqueia duas escolhas da mesma pergunta com o mesmo destino", () => {
  const menu = no("menu", "pergunta_opcoes", "Menu Principal", "Escolha", [
    { id: "vendas", titulo: "Vendas" },
    { id: "suporte", titulo: "Suporte" },
  ]);
  const destino = no("destino", "enviar_texto", "Atendimento", "Vamos ajudar.");
  const validacao = validarExperienciaConversacional({
    nos: [menu, destino],
    conexoes: [
      rota("c1", "menu", "destino", "vendas", "Vendas"),
      rota("c2", "menu", "destino", "suporte", "Suporte"),
    ],
  });

  assert.ok(
    validacao.erros.some((erro) => erro.codigo === "UX_OPCOES_MESMO_DESTINO")
  );
});
