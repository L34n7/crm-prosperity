import { executarAssistente } from "./route-resiliente";
import { prepararSessaoAntesDeCriar } from "./route-preparar-criacao";
import { garantirTerminalAntesDeCriar } from "./route-garantir-terminal";
import { canonicalizarSessaoAntesDeCriar } from "./route-deduplicar-opcoes";
import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestPreparada = await prepararSessaoAntesDeCriar(request);
  const requestCanonical = await canonicalizarSessaoAntesDeCriar(
    requestPreparada
  );
  const requestComTerminal = await garantirTerminalAntesDeCriar(
    requestCanonical
  );
  return executarAssistenteComDistribuicao(
    requestComTerminal,
    executarAssistente
  );
}
