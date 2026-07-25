import { reconciliarConsumosIaPendentes } from "./openai-retrieve-compat";

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
 * response_id. Respostas terminais com consumo sao registradas mesmo quando
 * nenhum fluxo pode ser materializado.
 */
export async function POST(request: Request) {
  await reconciliarConsumosIaPendentes();
  const requestComRegras = await anexarRegrasRecursosAoPedido(request);

  return executarComRecuperacaoSessao(requestComRegras, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
