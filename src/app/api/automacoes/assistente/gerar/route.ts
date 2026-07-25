import "./openai-retrieve-compat";

import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { executarAssistente } from "./route-resiliente";
import { anexarRegrasRecursosAoPedido } from "./route-regras-recursos";

export const runtime = "nodejs";

/**
 * Pipeline deliberadamente curto:
 * pedido original + regras tecnicas -> briefing estruturado ->
 * Prompt Mestre + recursos + schema -> uma IA em background ->
 * confirmacao de recursos concretos -> validacao estrutural -> persistencia.
 *
 * A geracao longa e retomada pelo mesmo response_id, sem iniciar outra IA.
 */
export async function POST(request: Request) {
  const requestComRegras = await anexarRegrasRecursosAoPedido(request);

  return executarComRecuperacaoSessao(requestComRegras, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
