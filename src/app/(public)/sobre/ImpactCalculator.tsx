"use client";

import { useState } from "react";
import styles from "./sobre.module.css";

const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export default function ImpactCalculator() {
  const [leads, setLeads] = useState(5000);
  const [ticket, setTicket] = useState(200);

  const revenueBase = leads * ticket;
  const withoutProsperity = revenueBase * 0.015;
  const withProsperity = revenueBase * 0.09;
  const potential = withProsperity - withoutProsperity;

  return (
    <div className={styles.calculator}>
      <label>
        <span>
          Leads por Mês <strong>{leads.toLocaleString("pt-BR")}</strong>
        </span>
        <input
          type="range"
          min="500"
          max="20000"
          step="500"
          value={leads}
          onChange={(event) => setLeads(Number(event.target.value))}
        />
      </label>

      <label>
        <span>
          Ticket Médio (R$) <strong>{formatter.format(ticket)}</strong>
        </span>
        <input
          type="range"
          min="50"
          max="2000"
          step="50"
          value={ticket}
          onChange={(event) => setTicket(Number(event.target.value))}
        />
      </label>

      <div className={styles.comparison}>
        <article className={styles.withoutCard}>
          <small>Sem CRM Prosperity</small>
          <strong>{formatter.format(withoutProsperity)}</strong>
          <ul>
            <li>Taxa de conversão 1,5%</li>
            <li>Follow-up manual</li>
            <li>Leads sem histórico</li>
          </ul>
        </article>

        <span className={styles.versus}>VS</span>

        <article className={styles.withCard}>
          <small>Com CRM Prosperity</small>
          <strong>{formatter.format(withProsperity)}</strong>
          <ul>
            <li>Taxa de conversão 9%</li>
            <li>Follow-up automático</li>
            <li>IA personaliza cada contato</li>
          </ul>
        </article>
      </div>

      <div className={styles.potential}>
        <span>Ganho potencial mensal</span>
        <strong>+ {formatter.format(potential)}</strong>
      </div>

      <p>
        * Simulação baseada em taxas de conversão de mercado. Resultados reais
        variam por segmento.
      </p>
    </div>
  );
}
