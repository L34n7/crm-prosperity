"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  RefreshCw,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import styles from "./growth.module.css";

export type GrowthDetailRow = {
  id: string;
  empresa: string;
  responsavel?: string;
  email?: string;
  plano?: string;
  data?: string;
  valor?: string;
  status?: string;
  observacao?: string;
};

export type GrowthCardData = {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: "users" | "refresh" | "money" | "card" | "wallet" | "trend" | "alert";
  modalTitle: string;
  modalDescription: string;
  rows: GrowthDetailRow[];
};

const icons = {
  users: Users,
  refresh: RefreshCw,
  money: CircleDollarSign,
  card: CreditCard,
  wallet: WalletCards,
  trend: TrendingUp,
  alert: AlertTriangle,
};

export default function GrowthKpiCards({ cards }: { cards: GrowthCardData[] }) {
  const [active, setActive] = useState<GrowthCardData | null>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && setActive(null);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [active]);

  return (
    <>
      <section className={styles.kpis}>
        {cards.map((card) => {
          const Icon = icons[card.icon];
          return (
            <button
              key={card.id}
              type="button"
              className={styles.kpiButton}
              onClick={() => setActive(card)}
              aria-label={`Abrir detalhes de ${card.label}`}
            >
              <Icon size={21} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
              <em>Ver detalhes</em>
            </button>
          );
        })}
      </section>

      {active && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={() => setActive(null)}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="growth-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Detalhamento</span>
                <h2 id="growth-modal-title">{active.modalTitle}</h2>
                <p>{active.modalDescription}</p>
              </div>
              <button type="button" onClick={() => setActive(null)} aria-label="Fechar modal">
                <X size={20} />
              </button>
            </header>

            <div className={styles.modalSummary}>
              <strong>{active.value}</strong>
              <span>{active.rows.length} registro(s)</span>
            </div>

            {active.rows.length === 0 ? (
              <p className={styles.empty}>Nenhum registro encontrado para este indicador.</p>
            ) : (
              <div className={styles.modalTableWrapper}>
                <table className={styles.modalTable}>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Responsável</th>
                      <th>Plano / oferta</th>
                      <th>Data</th>
                      <th>Valor</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.rows.map((row, index) => (
                      <tr key={`${row.id}-${index}`}>
                        <td><strong>{row.empresa}</strong><small>{row.email || ""}</small></td>
                        <td>{row.responsavel || "Não informado"}</td>
                        <td>{row.plano || "Não informado"}</td>
                        <td>{row.data || "Não informado"}</td>
                        <td>{row.valor || "—"}</td>
                        <td><span className={styles.status}>{row.status || row.observacao || "Confirmado"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
