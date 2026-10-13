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
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const bloqueios = bloqueioPagamentoMeta?.integracoes || [];
  const assinatura = useMemo(
    () =>
      bloqueios
        .map(
          (item) =>
            `${item.id}:${item.ocorrido_em || item.ultima_falha_em || ""}`
        )
        .join("|"),
    [bloqueios]
  );

  useEffect(() => {
    if (!mounted || !headerUser.isAdmin || !assinatura) return;

    const key = `crm:meta-payment-modal:${assinatura}`;
    if (window.sessionStorage.getItem(key) === "shown") return;

    window.sessionStorage.setItem(key, "shown");
    setModalOpen(true);
  }, [assinatura, headerUser.isAdmin, mounted]);

  if (!headerUser.isAdmin || bloqueios.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className={styles.badge}
        onClick={() => setModalOpen(true)}
        title="Pagamento da Meta pendente"
      >
        <AlertTriangle size={15} />
        <span>
          <small>Meta</small>
          <strong>Pagamento pendente</strong>
        </span>
      </button>

      {mounted &&
        modalOpen &&
        createPortal(
          <div className={styles.overlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <button
                type="button"
                className={styles.close}
                aria-label="Fechar"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>

              <div className={styles.hero}>
                <span className={styles.heroIcon}>
                  <CreditCard size={24} />
                </span>
                <div>
                  <span className={styles.eyebrow}>Meta · Cobrança</span>
                  <h2>Forma de pagamento necessária</h2>
                  <p>
                    A Meta recusou um envio por pendência financeira. O CRM não
                    bloqueia os próximos envios: novas tentativas continuam
                    normalmente.
                  </p>
                </div>
              </div>

              <div className={styles.list}>
                {bloqueios.map((item) => (
                  <div className={styles.item} key={item.id}>
                    <div>
                      <strong>{item.numero || item.nome}</strong>
                      <span>{item.nome}</span>
                    </div>
                    <div className={styles.itemMeta}>
                      <span>Código Meta {item.codigo || "financeiro"}</span>
                      <span>
                        O aviso será removido após um novo envio confirmado.
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.info}>
                <strong>O que fazer agora</strong>
                <p>
                  Abra a área de cobrança da Meta e regularize a forma de
                  pagamento da conta WhatsApp Business. Assim que a Meta
                  confirmar um novo envio com sucesso, este aviso será removido
                  automaticamente.
                </p>
              </div>

              <div className={styles.actions}>
                <a
                  className={styles.primary}
                  href={META_PAYMENT_SETTINGS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Configurar forma de pagamento
                  <ExternalLink size={16} />
                </a>
              </div>

              <p className={styles.note}>
                Se a cobrança continuar irregular, novas falhas podem manter o
                aviso ativo, mas não impedem o CRM de tentar os próximos envios.
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
