import { canonicalizarSessaoAntesDeCriar } from "./route-deduplicar-opcoes";
import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";
import { garantirTerminalAntesDeCriar } from "./route-garantir-terminal";
import { normalizarPedidoAssistente } from "./route-normalizar-pedido";
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { executarAssistente } from "./route-resiliente";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestNormalizada = await normalizarPedidoAssistente(request);
  const requestCanonical = await canonicalizarSessaoAntesDeCriar(
    requestNormalizada
  );
  const requestComTerminal = await garantirTerminalAntesDeCriar(
    requestCanonical
  );

  return executarComRecuperacaoSessao(requestComTerminal, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
