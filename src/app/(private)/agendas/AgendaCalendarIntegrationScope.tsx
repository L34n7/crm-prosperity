"use client";

import { Link2 } from "lucide-react";
import styles from "./AgendaCalendarIntegrationScope.module.css";

type Integration = {
  id: string;
  nome_conexao: string;
};

type Props = {
  integrations: Integration[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  loading?: boolean;
  error?: string;
};

export default function AgendaCalendarIntegrationScope({
  integrations,
  selectedIds,
  onChange,
  loading = false,
  error = "",
}: Props) {
  const toggle = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedIds, id]))
      : selectedIds.filter((item) => item !== id);
    if (next.length > 0) onChange(next);
  };

  return (
    <section className={styles.scope} aria-label="Integrações do calendário">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.icon} aria-hidden="true">
            <Link2 size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h4>Integrações do calendário</h4>
            <p>
              Escolha quais números do WhatsApp poderão executar fluxos,
              confirmações, lembretes e pós-atendimento neste calendário.
            </p>
          </div>
        </div>
        <span className={styles.count}>
          {selectedIds.length} selecionada{selectedIds.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className={styles.loading}>Carregando integrações...</div>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && integrations.length > 0 ? (
        <>
          <div className={styles.list}>
            {integrations.map((integration) => {
              const checked = selectedIds.includes(integration.id);
              return (
                <label
                  className={`${styles.option} ${checked ? styles.optionSelected : ""}`}
                  key={integration.id}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      toggle(integration.id, event.target.checked)
                    }
                  />
                  <span className={styles.optionText}>
                    {integration.nome_conexao}
                  </span>
                </label>
              );
            })}
          </div>
          <p className={styles.hint}>
            Fluxos exclusivos de integrações não selecionadas serão ocultados.
            Ao menos uma integração deve permanecer ativa neste calendário.
          </p>
        </>
      ) : null}
    </section>
  );
}
