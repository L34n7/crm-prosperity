import "./openai-retrieve-compat";

import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { executarAssistente } from "./route-resiliente";

export const runtime = "nodejs";

/**
 * Pipeline deliberadamente curto:
 * pedido original -> briefing estruturado -> Prompt Mestre + recursos + schema ->
 * uma IA em background -> validacao estrutural -> persistencia.
 *
 * A geracao longa e retomada pelo mesmo response_id, sem iniciar outra IA.
 */
export async function POST(request: Request) {
  return executarComRecuperacaoSessao(request, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
