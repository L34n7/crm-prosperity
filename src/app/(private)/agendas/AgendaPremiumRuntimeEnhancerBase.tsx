"use client";

import { useEffect } from "react";
import AgendaTemplateMappingEnhancer from "./AgendaTemplateMappingEnhancer";
import styles from "./AgendaPremiumRuntimeEnhancerBase.module.css";

const DECORATION_CLASSES = [
  "agendaReminderCard",
  "agendaReminderWhatsappGrid",
  "agendaReminderWhatsappField",
  "agendaAppointmentSectionHeader",
  "agendaAppointmentSectionDescription",
  "agendaParticipantsSection",
  "agendaParticipantsHeader",
  "agendaParticipantsDescription",
  "agendaRemindersSection",
];

const LEGACY_INTERVAL_CLASSES = [
  "agendaPremiumDayCard",
  "agendaDayExpanded",
  "agendaPremiumIntervalHeader",
  "agendaPremiumIntervalTitle",
  "agendaPremiumIntervalAdd",
  "agendaPremiumIntervalEmpty",
  "agendaPremiumIntervalRow",
  "agendaPremiumIntervalRemove",
];

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

function findLabel(root: ParentNode, expected: string) {
  return Array.from(
    root.querySelectorAll<HTMLElement>("label,span,b,strong,p,small"),
  ).find((element) => {
    const direct = normalize(ownText(element));
    const complete = normalize(element.textContent);
    return direct === expected || (complete === expected && complete.length < 45);
  });
}

function lowestCommonParent(
  first: HTMLElement,
  second: HTMLElement,
  boundary: HTMLElement,
) {
  const firstParents = new Set<HTMLElement>();
  let current: HTMLElement | null = first;

  while (current && boundary.contains(current)) {
    firstParents.add(current);
    if (current === boundary) break;
    current = current.parentElement;
  }

  current = second;
  while (current && boundary.contains(current)) {
    if (firstParents.has(current)) return current;
    if (current === boundary) break;
    current = current.parentElement;
  }

  return null;
}

function clearDecorations() {
  const selector = DECORATION_CLASSES.map((item) => `.${item}`).join(",");
  if (!selector) return;

  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    DECORATION_CLASSES.forEach((item) => element.classList.remove(item));
  });
}

function clearLegacyIntervalRuntime() {
  document
    .querySelectorAll<HTMLElement>(
      ".agendaDayExpand,.agendaDayStatus,.agendaDayTimeSeparator,.agendaDayIntervalCount,.agendaDayTimeline",
    )
    .forEach((element) => element.remove());

  const selector = LEGACY_INTERVAL_CLASSES.map((item) => `.${item}`).join(",");
  if (selector) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      LEGACY_INTERVAL_CLASSES.forEach((item) => element.classList.remove(item));
    });
  }

  document
    .querySelectorAll<HTMLElement>(".availability .avBreaks[hidden]")
    .forEach((element) => {
      element.hidden = false;
    });
}

function decorateReminderCards(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".repeat").forEach((card) => {
    card.classList.add("agendaReminderCard");

    const integrationLabel = findLabel(card, "integracao do whatsapp");
    const templateLabel = findLabel(card, "template aprovado");
    if (!integrationLabel || !templateLabel) return;

    const integrationField =
      integrationLabel.closest<HTMLElement>(".field,label,div") || integrationLabel;
    const templateField =
      templateLabel.closest<HTMLElement>(".field,label,div") || templateLabel;

    integrationField.classList.add("agendaReminderWhatsappField");
    templateField.classList.add("agendaReminderWhatsappField");

    const common = lowestCommonParent(integrationField, templateField, card);
    if (common && common !== card) {
      common.classList.add("agendaReminderWhatsappGrid");
    }
  });
}

function decorateAppointmentSections(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".drawer .section").forEach((section) => {
    const heading = section.querySelector<HTMLElement>("h3");
    if (!heading) return;

    const title = normalize(heading.textContent);
    const header = heading.closest<HTMLElement>(".row");

    if (title.includes("participantes")) {
      section.classList.add("agendaParticipantsSection");
      header?.classList.add(
        "agendaAppointmentSectionHeader",
        "agendaParticipantsHeader",
      );

      const description = section.querySelector<HTMLElement>(
        ".agendaParticipantsDescription,small",
      );
      description?.classList.add(
        "agendaAppointmentSectionDescription",
        "agendaParticipantsDescription",
      );
    }

    if (title.includes("lembretes e confirmacao")) {
      section.classList.add("agendaRemindersSection");
      header?.classList.add("agendaAppointmentSectionHeader");

      const description = Array.from(section.children).find(
        (child) => child.tagName === "SMALL",
      ) as HTMLElement | undefined;
      description?.classList.add("agendaAppointmentSectionDescription");
    }
  });
}

export default function AgendaPremiumRuntimeEnhancerBase() {
  useEffect(() => {
    clearDecorations();
    clearLegacyIntervalRuntime();

    let frame = 0;
    const apply = () => {
      frame = 0;
      decorateReminderCards(document);
      decorateAppointmentSections(document);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    apply();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      clearDecorations();
    };
  }, []);

  return (
    <>
      <span className={styles.runtimeStyles} aria-hidden="true" />
      <AgendaTemplateMappingEnhancer />
    </>
  );
}
