"use client";

import { useEffect } from "react";

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehCardConteudoIndisponivel(elemento: HTMLElement) {
  const texto = normalizarTexto(elemento.textContent);

  return (
    texto.includes("conteudo nao disponivel") ||
    texto.includes("mensagem nao suportada pela api do whatsapp") ||
    texto.includes("evento ou conteudo nao reconhecido") ||
    texto.includes("este tipo de conteudo ainda nao e suportado pela api oficial")
  );
}

function ajustarAlinhamentoCards() {
  const mensagens = document.querySelectorAll<HTMLElement>('[id^="mensagem-"]');

  mensagens.forEach((mensagem) => {
    const deveAlinharDireita = ehCardConteudoIndisponivel(mensagem);
    const foiAjustada = mensagem.dataset.conteudoIndisponivelDireita === "true";

    if (deveAlinharDireita) {
      mensagem.style.justifyContent = "flex-end";
      mensagem.dataset.conteudoIndisponivelDireita = "true";
      return;
    }

    if (foiAjustada) {
      mensagem.style.removeProperty("justify-content");
      delete mensagem.dataset.conteudoIndisponivelDireita;
    }
  });
}

export default function ConteudoIndisponivelAlignment() {
  useEffect(() => {
    let frameId: number | null = null;

    const agendarAjuste = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        ajustarAlinhamentoCards();
      });
    };

    agendarAjuste();

    const observer = new MutationObserver(agendarAjuste);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return null;
}
