"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./FeedbackToast.module.css";

type FeedbackToastProps = {
  success?: string;
  error?: string;
  duration?: number;
  onSuccessDismiss?: () => void;
  onErrorDismiss?: () => void;
};

export default function FeedbackToast({
  success = "",
  error = "",
  duration = 8000,
  onSuccessDismiss,
  onErrorDismiss,
}: FeedbackToastProps) {
  const [inlineErrorHost, setInlineErrorHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!success || !onSuccessDismiss) return;

    const timeout = window.setTimeout(onSuccessDismiss, duration);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [duration, onSuccessDismiss, success]);

  useEffect(() => {
    if (!error || !onErrorDismiss) return;

    const timeout = window.setTimeout(onErrorDismiss, duration);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [duration, error, onErrorDismiss]);

  useEffect(() => {
    if (!error) {
      setInlineErrorHost(null);
      return;
    }

    const localizarRodapeEditor = () => {
      setInlineErrorHost(
        document.querySelector<HTMLElement>(".a2 .overlay .drawer .foot"),
      );
    };

    localizarRodapeEditor();

    const observer = new MutationObserver(localizarRodapeEditor);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [error]);

  if (!success && !error) return null;

  const floatingError = Boolean(error && !inlineErrorHost);

  return (
    <>
      {success || floatingError ? (
        <div className={styles.toastArea} role="status" aria-live="polite">
          {success ? (
            <div className={`${styles.toast} ${styles.toastSuccess}`}>
              {success}
            </div>
          ) : null}

          {floatingError ? (
            <div className={`${styles.toast} ${styles.toastError}`}>{error}</div>
          ) : null}
        </div>
      ) : null}

      {error && inlineErrorHost
        ? createPortal(
            <div
              className={`${styles.toast} ${styles.toastError} ${styles.inlineError}`}
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>,
            inlineErrorHost,
          )
        : null}
    </>
  );
}
