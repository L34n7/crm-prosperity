import { executarAssistente } from "./route-resiliente";
import { prepararSessaoAntesDeCriar } from "./route-preparar-criacao";
import { garantirTerminalAntesDeCriar } from "./route-garantir-terminal";
import { canonicalizarSessaoAntesDeCriar } from "./route-deduplicar-opcoes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestPreparada = await prepararSessaoAntesDeCriar(request);
  const requestComTerminal = await garantirTerminalAntesDeCriar(requestPreparada);
  const requestCanonical = await canonicalizarSessaoAntesDeCriar(
    requestComTerminal
  );
  return executarAssistente(requestCanonical);
}
