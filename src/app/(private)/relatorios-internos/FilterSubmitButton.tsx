"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, Loader2 } from "lucide-react";
import styles from "./relatorios-internos.module.css";

type FilterSubmitButtonProps = {
  label?: string;
  loadingLabel?: string;
};

export default function FilterSubmitButton({
  label = "Filtrar",
  loadingLabel = "Filtrando",
}: FilterSubmitButtonProps) {
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!form) return;

    function handleSubmit() {
      setLoading(true);
    }

    function handlePageShow() {
      setLoading(false);
    }

    form.addEventListener("submit", handleSubmit);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      form.removeEventListener("submit", handleSubmit);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="submit"
      className={`${styles.primaryButton} ${loading ? styles.buttonLoading : ""}`}
      aria-busy={loading}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className={styles.loadingSpinner} size={16} strokeWidth={2.3} />
      ) : (
        <Filter size={16} strokeWidth={2.2} />
      )}
      {loading ? loadingLabel : label}
    </button>
  );
}
