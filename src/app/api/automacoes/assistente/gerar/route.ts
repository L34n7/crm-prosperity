import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { executarAssistente } from "./route-resiliente";

export const runtime = "nodejs";

/**
 * Pipeline deliberadamente curto:
 * pedido original -> Prompt Mestre + recursos + schema -> uma IA ->
 * confirmacao apenas de recursos concretos ausentes -> persistencia.
 *
 * Nao canonicaliza, nao cria terminal, nao deduplica e nao repara o plano da IA.
 */
export async function POST(request: Request) {
  return executarComRecuperacaoSessao(request, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
