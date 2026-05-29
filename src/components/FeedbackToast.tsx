"use client";

import { useEffect } from "react";
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

  if (!success && !error) return null;

  return (
    <div className={styles.toastArea} role="status" aria-live="polite">
      {success ? (
        <div className={`${styles.toast} ${styles.toastSuccess}`}>
          {success}
        </div>
      ) : null}

      {error ? (
        <div className={`${styles.toast} ${styles.toastError}`}>{error}</div>
      ) : null}
    </div>
  );
}
