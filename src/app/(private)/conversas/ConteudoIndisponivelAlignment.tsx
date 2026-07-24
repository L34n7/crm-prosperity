"use client";

import { useEffect } from "react";

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehConteudoIndisponivel(elemento: Element | null) {
  if (!(elemento instanceof HTMLElement)) return false;

  const texto = normalizarTexto(elemento.textContent);

  return (
    texto.includes("conteudo nao disponivel") ||
    texto.includes("mensagem nao suportada pela api do whatsapp") ||
    texto.includes("evento ou conteudo nao reconhecido") ||
    texto.includes("este tipo de conteudo ainda nao e suportado pela api oficial")
  );
}

function ehContainerDaTimeline(elemento: HTMLElement) {
  const classes = String(elemento.className || "");

  return (
    classes.includes("messagesStack") ||
    classes.includes("timelineArea") ||
    classes.includes("timelineWrapper")
  );
}

function encontrarLinhaDoCard(elemento: HTMLElement) {
  const linhaPorClasse = elemento.closest<HTMLElement>(
    '[id^="mensagem-"], [class*="messageRow"], [class*="systemMessageRow"]'
  );

  if (linhaPorClasse) return linhaPorClasse;

  let atual: HTMLElement | null = elemento;
  let linhaFlexivel: HTMLElement | null = null;

  while (atual?.parentElement) {
    const pai = atual.parentElement;

    if (ehContainerDaTimeline(pai)) break;

    const estilo = window.getComputedStyle(atual);
    const retanguloAtual = atual.getBoundingClientRect();
    const retanguloElemento = elemento.getBoundingClientRect();

    if (
      estilo.display.includes("flex") &&
      estilo.flexDirection !== "column" &&
      retanguloAtual.width >= retanguloElemento.width + 40
    ) {
      linhaFlexivel = atual;
    }

    atual = pai;
  }

  return linhaFlexivel;
}

function encontrarCardDireto(linha: HTMLElement, elemento: HTMLElement) {
  let card = elemento;

  while (card.parentElement && card.parentElement !== linha) {
    card = card.parentElement;
  }

  return card.parentElement === linha ? card : linha.firstElementChild as HTMLElement | null;
}

function removerAjuste(linha: HTMLElement) {
  linha.style.removeProperty("justify-content");
  linha.style.removeProperty("width");
  linha.style.removeProperty("align-self");

  const card = linha.querySelector<HTMLElement>(
    '[data-card-conteudo-indisponivel-direita="true"]'
  );

  if (card) {
    card.style.removeProperty("margin-left");
    card.style.removeProperty("margin-right");
    card.style.removeProperty("align-self");
    delete card.dataset.cardConteudoIndisponivelDireita;
  }

  delete linha.dataset.conteudoIndisponivelDireita;
}

function alinharCardADireita(linha: HTMLElement, card: HTMLElement | null) {
  linha.style.setProperty("display", "flex", "important");
  linha.style.setProperty("justify-content", "flex-end", "important");
  linha.style.setProperty("width", "100%", "important");
  linha.style.setProperty("align-self", "stretch", "important");

  if (card) {
    card.style.setProperty("margin-left", "auto", "important");
    card.style.setProperty("margin-right", "0", "important");
    card.style.setProperty("align-self", "flex-end", "important");
    card.dataset.cardConteudoIndisponivelDireita = "true";
  }

  linha.dataset.conteudoIndisponivelDireita = "true";
}

function ajustarAlinhamentoCards() {
  const linhasAjustadas = document.querySelectorAll<HTMLElement>(
    '[data-conteudo-indisponivel-direita="true"]'
  );

  linhasAjustadas.forEach((linha) => {
    if (!ehConteudoIndisponivel(linha)) {
      removerAjuste(linha);
    }
  });

  const raiz =
    document.querySelector<HTMLElement>('[class*="timelineArea"]') || document.body;

  const elementos = raiz.querySelectorAll<HTMLElement>("div, article, section, p, span");
  const linhasProcessadas = new Set<HTMLElement>();

  elementos.forEach((elemento) => {
    if (!ehConteudoIndisponivel(elemento)) return;

    const filhoTambemIdentificado = Array.from(elemento.children).some((filho) =>
      ehConteudoIndisponivel(filho)
    );

    if (filhoTambemIdentificado) return;

    const linha = encontrarLinhaDoCard(elemento);

    if (!linha || linhasProcessadas.has(linha)) return;

    const card = encontrarCardDireto(linha, elemento);
    alinharCardADireita(linha, card);
    linhasProcessadas.add(linha);
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

    window.addEventListener("resize", agendarAjuste);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", agendarAjuste);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return null;
}
