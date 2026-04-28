import type { AutomacaoGatilho } from "./types";

function normalizarTexto(texto: string) {
  return String(texto || "")
    .trim()
    .toLowerCase();
}

export function gatilhoCombinaComMensagem(
  gatilho: AutomacaoGatilho,
  mensagemTexto: string
) {
  const mensagem = normalizarTexto(mensagemTexto);
  const valor = normalizarTexto(gatilho.valor || "");

  if (!mensagem || !valor) return false;

  if (gatilho.tipo_gatilho !== "palavra_chave") {
    return false;
  }

  if (gatilho.condicao === "exata") {
    return mensagem === valor;
  }

  if (gatilho.condicao === "inicia_com") {
    return mensagem.startsWith(valor);
  }

  if (gatilho.condicao === "contem") {
    return mensagem.includes(valor);
  }

  return false;
}