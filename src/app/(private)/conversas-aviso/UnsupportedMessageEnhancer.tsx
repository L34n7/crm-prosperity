"use client";

import { useEffect } from "react";

const TEXTO_MENSAGEM_UNSUPPORTED =
  "Mensagem não suportada pela API do WhatsApp";

function criarConteudoAviso() {
  const container = document.createElement("div");
  container.className = "unsupportedMessageCardContent";

  const icone = document.createElement("div");
  icone.className = "unsupportedMessageCardIcon";
  icone.setAttribute("aria-hidden", "true");
  icone.textContent = "⚠️";

  const texto = document.createElement("div");
  texto.className = "unsupportedMessageCardCopy";

  const titulo = document.createElement("strong");
  titulo.className = "unsupportedMessageCardTitle";
  titulo.textContent = "Conteúdo não disponível";

  const descricao = document.createElement("p");
  descricao.className = "unsupportedMessageCardDescription";
  descricao.textContent =
    "O contato enviou uma mensagem que não pode ser exibida pela API do WhatsApp.";

  const selo = document.createElement("span");
  selo.className = "unsupportedMessageCardBadge";
  selo.textContent = "Aviso do sistema";

  texto.append(titulo, descricao, selo);
  container.append(icone, texto);

  return container;
}

function localizarTimelineAtiva() {
  const timelines = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="timelineArea"]')
  );

  return (
    timelines.find((timeline) =>
      timeline.querySelector('[class*="messagesStack"]')
    ) || null
  );
}

function aplicarEstiloMensagensUnsupported() {
  const timeline = localizarTimelineAtiva();
  if (!timeline) return;

  const paragrafos = Array.from(
    timeline.querySelectorAll<HTMLElement>('p[class*="messageText"]')
  );

  for (const paragrafo of paragrafos) {
    const textoNormalizado = (paragrafo.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!textoNormalizado.includes(TEXTO_MENSAGEM_UNSUPPORTED)) continue;

    const balao = paragrafo.closest<HTMLElement>('[class*="messageBubble"]');
    const linha = paragrafo.closest<HTMLElement>('[class*="messageRow"]');
    const conteudoRow = paragrafo.closest<HTMLElement>(
      '[class*="messageContentRow"]'
    );
    const conteudoFlex = paragrafo.parentElement;

    if (!balao || !linha || !conteudoRow || !conteudoFlex) continue;
    if (!timeline.contains(balao) || !timeline.contains(linha)) continue;
    if (balao.closest('[class*="conversationItem"]')) continue;
    if (balao.dataset.unsupportedMessageEnhanced === "true") continue;

    balao.dataset.unsupportedMessageEnhanced = "true";
    balao.classList.add("unsupportedMessageBubble");
    linha.classList.add("unsupportedMessageRow");
    conteudoRow.classList.add("unsupportedMessageContentRow");
    conteudoFlex.classList.add("unsupportedMessageContentFlex");

    const favorito = conteudoRow.querySelector(
      'button[class*="messageFavoriteButton"]'
    );
    favorito?.remove();

    conteudoFlex.replaceChildren(criarConteudoAviso());
  }
}

export default function UnsupportedMessageEnhancer() {
  useEffect(() => {
    aplicarEstiloMensagensUnsupported();

    const observer = new MutationObserver(() => {
      aplicarEstiloMensagensUnsupported();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <style jsx global>{`
      [class*="timelineArea"] .unsupportedMessageRow {
        justify-content: flex-start !important;
        padding-inline: 0 !important;
      }

      [class*="timelineArea"] .unsupportedMessageBubble {
        width: min(560px, 94%) !important;
        max-width: min(560px, 94%) !important;
        margin-left: 0 !important;
        margin-right: auto !important;
        padding: 14px 16px 10px !important;
        border: 1px solid rgba(217, 153, 20, 0.42) !important;
        border-radius: 16px !important;
        background: linear-gradient(
          135deg,
          rgba(255, 250, 230, 0.98),
          rgba(255, 246, 207, 0.94)
        ) !important;
        color: #25313b !important;
        box-shadow: 0 8px 24px rgba(120, 83, 7, 0.1) !important;
      }

      [class*="timelineArea"] .unsupportedMessageContentRow,
      [class*="timelineArea"] .unsupportedMessageContentFlex {
        width: 100% !important;
      }

      [class*="timelineArea"] .unsupportedMessageCardContent {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        width: 100%;
      }

      [class*="timelineArea"] .unsupportedMessageCardIcon {
        display: grid;
        place-items: center;
        flex: 0 0 38px;
        width: 38px;
        height: 38px;
        border: 1px solid rgba(217, 153, 20, 0.28);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.72);
        font-size: 20px;
        line-height: 1;
      }

      [class*="timelineArea"] .unsupportedMessageCardCopy {
        min-width: 0;
        flex: 1;
      }

      [class*="timelineArea"] .unsupportedMessageCardTitle {
        display: block;
        margin: 1px 0 4px;
        color: #29323a;
        font-size: 14px;
        font-weight: 750;
        line-height: 1.3;
      }

      [class*="timelineArea"] .unsupportedMessageCardDescription {
        margin: 0;
        color: #5f6871;
        font-size: 13px;
        line-height: 1.45;
      }

      [class*="timelineArea"] .unsupportedMessageCardBadge {
        display: inline-flex;
        align-items: center;
        margin-top: 8px;
        padding: 3px 8px;
        border: 1px solid rgba(180, 126, 13, 0.24);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.58);
        color: #8a6519;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      [class*="timelineArea"]
        .unsupportedMessageBubble
        [class*="messageMetaBottom"] {
        margin-top: 8px !important;
        color: #8b826e !important;
        font-size: 11px !important;
      }

      @media (max-width: 640px) {
        [class*="timelineArea"] .unsupportedMessageBubble {
          width: 100% !important;
          max-width: 100% !important;
          padding: 13px 14px 9px !important;
        }

        [class*="timelineArea"] .unsupportedMessageCardContent {
          gap: 10px;
        }

        [class*="timelineArea"] .unsupportedMessageCardIcon {
          flex-basis: 34px;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          font-size: 18px;
        }

        [class*="timelineArea"] .unsupportedMessageCardTitle {
          font-size: 13px;
        }

        [class*="timelineArea"] .unsupportedMessageCardDescription {
          font-size: 12px;
        }
      }
    `}</style>
  );
}
