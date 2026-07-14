import assert from "node:assert/strict";
import test from "node:test";
import { avaliarElegibilidadeRecuperacaoFluxo } from "../src/lib/automacoes/recuperacao-fluxo-policy.ts";

const agora = new Date("2026-07-02T20:00:00.000Z");

test("permite recuperar conversa na fila com mensagem recente", () => {
  assert.deepEqual(
    avaliarElegibilidadeRecuperacaoFluxo({
      conversaStatus: "fila",
      mensagemRecebidaEm: "2026-07-02T19:00:00.000Z",
      automacaoProcessada: false,
      possuiExecucaoAtiva: false,
      agora,
    }),
    {
      elegivel: true,
      motivo: null,
    }
  );
});

test("bloqueia conversa fora da fila, processada ou com execução ativa", () => {
  assert.equal(
    avaliarElegibilidadeRecuperacaoFluxo({
      conversaStatus: "bot",
      mensagemRecebidaEm: "2026-07-02T19:00:00.000Z",
      automacaoProcessada: false,
      possuiExecucaoAtiva: false,
      agora,
    }).motivo,
    "conversa_nao_esta_na_fila"
  );
  assert.equal(
    avaliarElegibilidadeRecuperacaoFluxo({
      conversaStatus: "fila",
      mensagemRecebidaEm: "2026-07-02T19:00:00.000Z",
      automacaoProcessada: true,
      possuiExecucaoAtiva: false,
      agora,
    }).motivo,
    "mensagem_ja_processada"
  );
  assert.equal(
    avaliarElegibilidadeRecuperacaoFluxo({
      conversaStatus: "fila",
      mensagemRecebidaEm: "2026-07-02T19:00:00.000Z",
      automacaoProcessada: false,
      possuiExecucaoAtiva: true,
      agora,
    }).motivo,
    "conversa_possui_execucao_ativa"
  );
});

test("bloqueia conversa na fila que já foi entregue ao atendimento humano", () => {
  assert.equal(
    avaliarElegibilidadeRecuperacaoFluxo({
      conversaStatus: "fila",
      aguardandoAtendente: true,
      mensagemRecebidaEm: "2026-07-02T19:00:00.000Z",
      automacaoProcessada: false,
      possuiExecucaoAtiva: false,
      agora,
    }).motivo,
    "conversa_aguardando_atendente"
  );
});

test("bloqueia recuperação fora da janela de 24 horas", () => {
  assert.equal(
    avaliarElegibilidadeRecuperacaoFluxo({
      conversaStatus: "fila",
      mensagemRecebidaEm: "2026-07-01T19:00:00.000Z",
      automacaoProcessada: false,
      possuiExecucaoAtiva: false,
      agora,
    }).motivo,
    "fora_da_janela_24h"
  );
});
