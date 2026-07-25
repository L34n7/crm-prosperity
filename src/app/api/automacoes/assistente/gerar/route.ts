import { executarAssistenteComDistribuicao } from "./route-distribuicao-atendimento";
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { anexarRegrasRecursosAoPedido } from "./route-regras-recursos";
import {
  configurarModelosFluxosIa,
  habilitarBriefingFluxosIa,
} from "./route-runtime-config";

export const runtime = "nodejs";

/**
 * Pipeline:
 * pedido original + regras tecnicas -> briefing estruturado com GPT-5.4 mini ->
 * Prompt Mestre + recursos + schema -> geracao final com GPT-5.4 mini ->
 * confirmacao de recursos concretos -> validacao estrutural -> persistencia.
 *
 * Nao existe validacao semantica, reparo automatico ou segunda geracao de
 * revisao. Quando o briefing falha, o comportamento anterior de continuar com
 * o pedido original permanece ativo.
 */
export async function POST(request: Request) {
  configurarModelosFluxosIa();

  const { reconciliarConsumosIaPendentes } = await import(
    "./openai-retrieve-compat"
  );
  habilitarBriefingFluxosIa();

  const { executarAssistente } = await import("./route-resiliente");

  await reconciliarConsumosIaPendentes();
  const requestComRegras = await anexarRegrasRecursosAoPedido(request);

  return executarComRecuperacaoSessao(requestComRegras, (requestFinal) =>
    executarAssistenteComDistribuicao(requestFinal, executarAssistente)
  );
}
