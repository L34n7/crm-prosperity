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

function removerAjuste(mensagem: HTMLElement) {
  mensagem.style.removeProperty("justify-content");
  mensagem.style.removeProperty("width");
  mensagem.style.removeProperty("align-self");

  const card = mensagem.firstElementChild as HTMLElement | null;

  if (card) {
    card.style.removeProperty("margin-left");
    card.style.removeProperty("margin-right");
    card.style.removeProperty("align-self");
  }

  delete mensagem.dataset.conteudoIndisponivelDireita;
}

function alinharCardADireita(mensagem: HTMLElement) {
  mensagem.style.setProperty("justify-content", "flex-end", "important");
  mensagem.style.setProperty("width", "100%", "important");
  mensagem.style.setProperty("align-self", "stretch", "important");

  const card = mensagem.firstElementChild as HTMLElement | null;

  if (card) {
    card.style.setProperty("margin-left", "auto", "important");
    card.style.setProperty("margin-right", "0", "important");
    card.style.setProperty("align-self", "flex-end", "important");
  }

  mensagem.dataset.conteudoIndisponivelDireita = "true";
}

function ajustarAlinhamentoCards() {
  const mensagens = document.querySelectorAll<HTMLElement>('[id^="mensagem-"]');

  mensagens.forEach((mensagem) => {
    const deveAlinharDireita = ehCardConteudoIndisponivel(mensagem);
    const foiAjustada = mensagem.dataset.conteudoIndisponivelDireita === "true";

    if (deveAlinharDireita) {
      alinharCardADireita(mensagem);
      return;
    }

    if (foiAjustada) {
      removerAjuste(mensagem);
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
