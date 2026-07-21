import { executarAssistente } from "./route-resiliente";
import { prepararSessaoAntesDeCriar } from "./route-preparar-criacao";
import { garantirTerminalAntesDeCriar } from "./route-garantir-terminal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestPreparada = await prepararSessaoAntesDeCriar(request);
  const requestComTerminal = await garantirTerminalAntesDeCriar(requestPreparada);
  return executarAssistente(requestComTerminal);
}
