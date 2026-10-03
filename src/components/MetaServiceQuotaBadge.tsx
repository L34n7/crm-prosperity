"use client";

import { AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useHeaderSummary } from "@/components/header-summary-context";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./MetaServiceQuotaBadge.module.css";

function formatar(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Number(valor || 0)));
}

export default function MetaServiceQuotaBadge() {
  const { franquiaServiceMeta, refreshResumo } = useHeaderSummary();
  const headerUser = useHeaderUser();
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => setMounted(true), []);

  const alerta = franquiaServiceMeta?.alerta_pendente || null;

  useEffect(() => {
    if (headerUser.isAdmin && alerta) {
      setModalOpen(true);
    }
  }, [alerta?.id, headerUser.isAdmin]);

  const nivel = franquiaServiceMeta?.nivel_percentual_maximo || 0;
  const statusClass =
    nivel >= 95
      ? styles.badgeCritical
      : nivel >= 80
        ? styles.badgeWarning
        : "";

  const percentualGeral = Math.min(
    100,
    Math.max(0, franquiaServiceMeta?.percentual || 0)
  );

  const descricao = useMemo(() => {
    if (!franquiaServiceMeta) return "";
    return `Meta Service: ${formatar(
      franquiaServiceMeta.total_usado
    )} de ${formatar(franquiaServiceMeta.total_limite)} gratuitas usadas`;
  }, [franquiaServiceMeta]);

  if (!franquiaServiceMeta || franquiaServiceMeta.total_limite <= 0) {
    return null;
  }

  async function fecharModal() {
    if (confirmando) return;

    if (!alerta || !headerUser.isAdmin) {
      setModalOpen(false);
      return;
    }

    try {
      setConfirmando(true);
      await fetch("/api/whatsapp/service-franquia/alertas/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerta_id: alerta.id }),
      });
      setModalOpen(false);
      await refreshResumo(true);
    } finally {
      setConfirmando(false);
    }
  }

  const tituloModal = alerta
    ? alerta.percentual >= 100
      ? "Franquia gratuita atingida"
      : `Atenção: ${alerta.percentual}% da franquia utilizada`
    : "Consumo Meta Service";

  return (
    <>
      <button
        type="button"
        className={`${styles.badge} ${statusClass}`}
        title={descricao}
        onClick={() => setModalOpen(true)}
        aria-label={descricao}
      >
        <span className={styles.iconWrap}>
          <MessageCircle size={15} strokeWidth={2.4} />
        </span>

        <span className={styles.copy}>
          <span className={styles.label}>Meta Service</span>
          <strong>
            {formatar(franquiaServiceMeta.total_usado)}
            <span>/</span>
            {formatar(franquiaServiceMeta.total_limite)}
          </strong>
        </span>

        <span className={styles.progress} aria-hidden="true">
          <span style={{ width: `${percentualGeral}%` }} />
        </span>
      </button>

      {mounted &&
        modalOpen &&
        createPortal(
          <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            onClick={() => void fecharModal()}
          >
            <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={styles.close}
                onClick={() => void fecharModal()}
                aria-label="Fechar"
                disabled={confirmando}
              >
                ×
              </button>

              <div className={styles.hero}>
                <span className={styles.heroIcon}>
                  {alerta && alerta.percentual >= 95 ? (
                    <AlertTriangle size={23} />
                  ) : (
                    <CheckCircle2 size={23} />
                  )}
                </span>
                <div>
                  <span className={styles.eyebrow}>Meta · Service</span>
                  <h2>{tituloModal}</h2>
                  <p>
                    {alerta
                      ? `O número ${alerta.numero || alerta.nome} consumiu ${formatar(
                          alerta.service_usado
                        )} de ${formatar(
                          alerta.service_limite
                        )} mensagens Service gratuitas neste mês.`
                      : "Acompanhe abaixo o consumo mensal de mensagens Service gratuitas por número."}
                  </p>
                </div>
              </div>

              <div className={styles.totalCard}>
                <div>
                  <span>Consumo consolidado</span>
                  <strong>
                    {formatar(franquiaServiceMeta.total_usado)} /{" "}
                    {formatar(franquiaServiceMeta.total_limite)}
                  </strong>
                </div>
                <div className={styles.totalRight}>
                  <strong>{franquiaServiceMeta.percentual.toFixed(1)}%</strong>
                  <span>{formatar(franquiaServiceMeta.total_restante)} restantes</span>
                </div>
                <div className={styles.totalProgress}>
                  <span style={{ width: `${percentualGeral}%` }} />
                </div>
              </div>

              <div className={styles.list}>
                {franquiaServiceMeta.integracoes.map((integracao) => (
                  <div key={integracao.id} className={styles.item}>
                    <div className={styles.itemTop}>
                      <div>
                        <strong>{integracao.numero || integracao.nome}</strong>
                        <span>{integracao.nome}</span>
                      </div>
                      <div className={styles.itemValue}>
                        <strong>
                          {formatar(integracao.usados)} / {formatar(integracao.limite)}
                        </strong>
                        <span>{integracao.percentual.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className={styles.itemProgress}>
                      <span
                        style={{
                          width: `${Math.min(100, integracao.percentual)}%`,
                        }}
                      />
                    </div>
                    <div className={styles.itemMeta}>
                      <span>{formatar(integracao.restantes)} gratuitas restantes</span>
                      {integracao.service_cobrado > 0 && (
                        <span className={styles.itemMetaCharged}>
                          {formatar(integracao.service_cobrado)} Service cobradas
                        </span>
                      )}
                      {integracao.free_entry_point > 0 && (
                        <span>
                          {formatar(integracao.free_entry_point)} Free Entry Point
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.footerNote}>
                A franquia reinicia mensalmente por número, considerando o fuso
                da empresa. Após o limite, as mensagens cobradas são exibidas
                conforme a classificação recebida da Meta. Free Entry Point é
                contabilizado separadamente e não reduz este saldo.
              </div>

              <button
                type="button"
                className={styles.primary}
                onClick={() => void fecharModal()}
                disabled={confirmando}
              >
                {confirmando ? "Confirmando..." : alerta ? "Entendi" : "Fechar"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
