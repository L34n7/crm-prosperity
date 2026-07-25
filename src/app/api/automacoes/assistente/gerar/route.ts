import "./openai-retrieve-compat";

import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { executarAssistente } from "./route-resiliente";
import { anexarRegrasRecursosAoPedido } from "./route-regras-recursos";

export const runtime = "nodejs";

/**
 * Pipeline deliberadamente curto:
 * pedido original + regras tecnicas -> Prompt Mestre + recursos + schema ->
 * uma IA em background -> confirmacao de recursos concretos ->
 * validacao estrutural -> persistencia.
 *
 * O briefing por IA fica desativado. A geracao longa e retomada pelo mesmo
 * response_id, sem iniciar outra IA e sem salvar respostas incompletas.
 */
export async function POST(request: Request) {
  const requestComRegras = await anexarRegrasRecursosAoPedido(request);

  return executarComRecuperacaoSessao(requestComRegras, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
