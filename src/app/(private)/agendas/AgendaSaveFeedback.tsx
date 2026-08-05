"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AgendaSaveFeedback.module.css";

const SAVE_ATTEMPT_TIMEOUT_MS = 20_000;

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function currentFeedbackText() {
  const regions = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="status"][aria-live="polite"]',
    ),
  );

  return regions
    .map((region) => region.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean)
    .at(-1) || "";
}

function friendlySaveError(value: string) {
  const message = value.replace(/\s+/g, " ").trim();
  const normalized = normalize(message);
  const conflictTerms = [
    "conflit",
    "sobrepos",
    "ocupad",
    "indisponivel",
    "ja existe",
    "mesmo horario",
    "duplicate",
    "exclusion",
    "overlap",
  ];

  if (conflictTerms.some((term) => normalized.includes(term))) {
    return "Já existe um agendamento nesse horário. Escolha outro horário e tente novamente.";
  }

  return (
    message ||
    "Não foi possível salvar o agendamento. Revise os dados e tente novamente."
  );
}

function findSaveButton(drawer: HTMLElement) {
  return Array.from(
    drawer.querySelectorAll<HTMLButtonElement>(".foot button"),
  ).find((button) => normalize(button.textContent) === "salvar") || null;
}

export default function AgendaSaveFeedback() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState("");

  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const attemptStartedAtRef = useRef(0);
  const feedbackAtAttemptRef = useRef("");
  const feedbackClearedRef = useRef(false);

  useEffect(() => {
    let animationFrame = 0;

    const handleSaveAttempt = () => {
      attemptStartedAtRef.current = Date.now();
      feedbackAtAttemptRef.current = currentFeedbackText();
      feedbackClearedRef.current = !feedbackAtAttemptRef.current;
      setMessage("");
    };

    const unbindSaveButton = () => {
      saveButtonRef.current?.removeEventListener("click", handleSaveAttempt);
      saveButtonRef.current = null;
    };

    const bindSaveButton = (button: HTMLButtonElement) => {
      if (saveButtonRef.current === button) return;
      unbindSaveButton();
      saveButtonRef.current = button;
      button.addEventListener("click", handleSaveAttempt);
    };

    const clearDrawerState = () => {
      unbindSaveButton();
      targetRef.current = null;
      setTarget(null);
      setMessage("");
      attemptStartedAtRef.current = 0;
      feedbackAtAttemptRef.current = "";
      feedbackClearedRef.current = false;
    };

    const apply = () => {
      animationFrame = 0;

      const drawer = document.querySelector<HTMLElement>(
        ".agendaTemplateShell .a2 .drawer",
      );
      const footer = drawer?.querySelector<HTMLElement>(".foot");
      const actions = footer?.querySelector<HTMLElement>(".mini");
      const saveButton = drawer ? findSaveButton(drawer) : null;

      if (!drawer || !footer || !actions || !saveButton) {
        if (saveButtonRef.current || targetRef.current) clearDrawerState();
        return;
      }

      let host = footer.querySelector<HTMLElement>(
        '[data-agenda-save-feedback-host="true"]',
      );

      if (!host) {
        host = document.createElement("div");
        host.className = styles.host;
        host.dataset.agendaSaveFeedbackHost = "true";
        footer.insertBefore(host, actions);
      }

      if (targetRef.current !== host) {
        targetRef.current = host;
        setTarget(host);
      }
      bindSaveButton(saveButton);

      const feedback = currentFeedbackText();
      if (!feedback) feedbackClearedRef.current = true;

      const attemptIsRecent =
        attemptStartedAtRef.current > 0 &&
        Date.now() - attemptStartedAtRef.current <= SAVE_ATTEMPT_TIMEOUT_MS;
      const isNewFeedback =
        feedbackClearedRef.current ||
        feedback !== feedbackAtAttemptRef.current;

      if (attemptIsRecent && feedback && isNewFeedback && drawer.isConnected) {
        setMessage(friendlySaveError(feedback));
        attemptStartedAtRef.current = 0;
      }
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
      unbindSaveButton();
    };
  }, []);

  if (!target || !message) return null;

  return createPortal(
    <div className={styles.error} role="alert" aria-live="assertive">
      {message}
    </div>,
    target,
  );
}
