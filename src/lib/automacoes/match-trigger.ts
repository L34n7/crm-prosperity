import type { AutomacaoGatilho } from "./types";

function normalizarTexto(texto: string) {
  return String(texto || "").trim().toLowerCase();
}

export function gatilhoCombinaComMensagem(
  gatilho: AutomacaoGatilho,
  mensagemTexto: string
) {
  const mensagemOriginal = String(mensagemTexto || "").trim();
  const valorOriginal = String(gatilho.valor || "").trim();

  const mensagem = normalizarTexto(mensagemOriginal);
  const valor = normalizarTexto(valorOriginal);

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

  if (gatilho.condicao === "regex") {
    try {
      const regex = new RegExp(valorOriginal, "i");
      return regex.test(mensagemOriginal);
    } catch {
      return false;
    }
  }

  return false;
}