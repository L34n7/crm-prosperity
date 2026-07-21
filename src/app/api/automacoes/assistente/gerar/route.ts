import { executarAssistente } from "./route-resiliente";
import { prepararSessaoAntesDeCriar } from "./route-preparar-criacao";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestPreparada = await prepararSessaoAntesDeCriar(request);
  return executarAssistente(requestPreparada);
}
