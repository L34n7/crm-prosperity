"use client";

import { useEffect } from "react";
import styles from "./AgendaManagementPresentation.module.css";

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ownText(element: Element) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCalendarManagementModal(modal: HTMLElement) {
  const title = normalize(modal.querySelector(".dhead h2")?.textContent);
  return [
    "configurar agenda",
    "configurar calendario",
    "gerenciar agenda",
    "gerenciar calendario",
    "nova agenda",
    "novo calendario",
  ].some((expected) => title.includes(expected));
}

function decorateManagementModal(modal: HTMLElement) {
  if (!isCalendarManagementModal(modal)) return;

  modal
    .querySelectorAll<HTMLElement>("h3,h4,strong,p,span,small,div")
    .forEach((element) => {
      const rawText = ownText(element);
      if (!rawText) return;

      const text = normalize(rawText);

      if (text.includes("bidirecional ativa")) {
        element.classList.add(styles.hiddenBadge);
        return;
      }

      if (text.startsWith("importante sobre o fluxo automatico")) {
        element.classList.add(styles.importantTitle);

        element.parentElement
          ?.querySelectorAll<HTMLElement>("p,small,span")
          .forEach((description) => {
            const descriptionText = normalize(ownText(description));
            if (
              descriptionText &&
              !descriptionText.includes("bidirecional ativa") &&
              description !== element
            ) {
              description.classList.add(styles.importantDescription);
            }
          });
        return;
      }

      if (
        text.includes("vincule somente este calendario") ||
        text.includes("vincule somente esta agenda")
      ) {
        element.classList.add(styles.syncHint);
        return;
      }

      if (text === "disponibilidade semanal") {
        element.classList.add(styles.availabilityTitle);
        return;
      }

      if (text.startsWith("defina o inicio e o fim de cada dia")) {
        element.classList.add(styles.availabilityDescription);
        return;
      }

      if (
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawText) &&
        !element.closest("label")
      ) {
        element.classList.add(styles.connectedEmail);
      }
    });
}

export default function AgendaManagementPresentation() {
  useEffect(() => {
    let animationFrame = 0;

    const apply = () => {
      animationFrame = 0;
      document
        .querySelectorAll<HTMLElement>(
          ".agendaTemplateShell .a2 .modalbg .modal",
        )
        .forEach(decorateManagementModal);
    };

    const schedule = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(apply);
      }
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    apply();

    return () => {
      observer.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
