"use client";

import { AlertTriangle, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useHeaderSummary } from "@/components/header-summary-context";
import { useHeaderUser } from "@/components/header-user-context";
import { META_PAYMENT_SETTINGS_URL } from "@/lib/whatsapp/meta-payment-block";
import styles from "./MetaPaymentIssueBadge.module.css";

export default function MetaPaymentIssueBadge() {
  const headerUser = useHeaderUser();
  const { bloqueioPagamentoMeta, refreshResumo } = useHeaderSummary();
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [reativando, setReativando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => setMounted(true), []);

  const bloqueios = bloqueioPagamentoMeta?.integracoes || [];
  const assinatura = useMemo(
    () =>
      bloqueios
        .map((item) => `${item.id}:${item.ocorrido_em || item.ultima_falha_em || ""}`)
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

  async function reativar() {
    if (reativando) return;

    try {
      setReativando(true);
      setErro("");

      const response = await fetch("/api/whatsapp/pagamento-meta/reativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integracoes_ids: bloqueios.map((item) => item.id),
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Não foi possível reativar as automações.");
      }

      await refreshResumo(true);
      setModalOpen(false);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível reativar as automações."
      );
    } finally {
      setReativando(false);
    }
  }

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
                    A Meta recusou um envio por pendência financeira. Para evitar
                    novas tentativas com falha, o CRM pausou as automações dos
                    números afetados.
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
                        {item.pausas.execucoes_canceladas} fluxo(s) ·{" "}
                        {item.pausas.pendencias_ia_canceladas +
                          item.pausas.execucoes_ia_canceladas}{" "}
                        IA · {item.pausas.campanhas_pausadas} disparo(s)
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.info}>
                <strong>O que fazer agora</strong>
                <p>
                  Abra a área de cobrança da Meta, cadastre ou regularize a forma
                  de pagamento da conta WhatsApp Business e depois volte aqui
                  para reativar as automações.
                </p>
              </div>

              {erro && <div className={styles.error}>{erro}</div>}

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

                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => void reativar()}
                  disabled={reativando}
                >
                  <RefreshCw size={16} className={reativando ? styles.spin : ""} />
                  {reativando ? "Reativando..." : "Já configurei · reativar"}
                </button>
              </div>

              <p className={styles.note}>
                Se a cobrança ainda não estiver regularizada, uma nova falha
                financeira fará o CRM pausar novamente automaticamente.
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
