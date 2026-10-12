"use client";

import { AlertTriangle, CreditCard, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useHeaderSummary } from "@/components/header-summary-context";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./MetaPaymentIssueBadge.module.css";

const META_PAYMENT_SETTINGS_URL =
  "https://business.facebook.com/latest/billing_hub/accounts";

export default function MetaPaymentIssueBadge() {
  const headerUser = useHeaderUser();
  const { bloqueioPagamentoMeta } = useHeaderSummary();
  const [modalOpen, setModalOpen] = useState(false);

  const bloqueios = useMemo(
    () => bloqueioPagamentoMeta?.integracoes || [],
    [bloqueioPagamentoMeta?.integracoes]
  );
  const assinatura = useMemo(
    () =>
      bloqueios
        .map(
          (item) =>
            item.id + ":" + (item.ocorrido_em || item.ultima_falha_em || "")
        )
        .join("|"),
    [bloqueios]
  );

  useEffect(() => {
    if (!headerUser.isAdmin || !assinatura) return;

    const key = "crm:meta-payment-modal:" + assinatura;
    if (window.sessionStorage.getItem(key) === "shown") return;

    window.sessionStorage.setItem(key, "shown");
    const timer = window.setTimeout(() => setModalOpen(true), 0);

    return () => window.clearTimeout(timer);
  }, [assinatura, headerUser.isAdmin]);

  if (!headerUser.isAdmin || bloqueios.length === 0) return null;

  return (
    <¶»§q«^