"use client";

import { useEffect } from "react";
import styles from "./AgendaMenuLabel.module.css";

const acceptedLabels = new Set([
  "agenda",
  "agendas",
  "calendario",
  "calendarios",
]);

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
    .trim();
}

function decorateAgendaLink(link: HTMLAnchorElement) {
  link.classList.add(styles.link);
  link.setAttribute("aria-label", "Agenda");

  if (link.hasAttribute("title")) {
    link.setAttribute("title", "Agenda");
  }

  Array.from(link.querySelectorAll<HTMLElement>("span")).forEach((span) => {
    if (acceptedLabels.has(normalize(ownText(span)))) {
      span.dataset.agendaMenuLabelText = "true";
    }
  });
}

export default function AgendaMenuLabel() {
  useEffect(() => {
    let animationFrame = 0;

    const apply = () => {
      animationFrame = 0;
      document
        .querySelectorAll<HTMLAnchorElement>('a[href="/agendas"]')
        .forEach(decorateAgendaLink);
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
