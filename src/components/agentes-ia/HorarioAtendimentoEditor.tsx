"use client";

import { Clock3 } from "lucide-react";
import {
  FUSOS_HORARIOS_AMERICA_LATINA,
  normalizarHorarioAtendimento,
  type HorarioAtendimentoAgente,
} from "@/lib/agentes-ia/horario-atendimento";
import styles from "@/app/(private)/agentes-ia/page.module.css";

type Props = {
  value: unknown;
  onChange: (horario: HorarioAtendimentoAgente) => void;
};

const DIAS = [
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
  [7, "Dom"],
] as const;

export default function HorarioAtendimentoEditor({ value, onChange }: Props) {
  const horario = normalizarHorarioAtendimento(value);

  function atualizar(patch: Partial<HorarioAtendimentoAgente>) {
    onChange({ ...horario, ...patch });
  }

  function alternarDia(dia: number) {
    const dias = horario.dias.includes(dia)
      ? horario.dias.filter((item) => item !== dia)
      : [...horario.dias, dia].sort((a, b) => a - b);
    atualizar({ dias });
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>
        <Clock3 size={18} />
        <div>
          <h3>Horário de atendimento</h3>
          <p>Defina quando este agente de IA pode responder novas mensagens.</p>
        </div>
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={horario.ativo}
          onChange={(event) => atualizar({ ativo: event.target.checked })}
        />
        <span>
          <strong>Limitar horário de atendimento</strong>
          <small>
            Fora do horário, a mensagem fica agendada para a próxima abertura. Antes de responder, o CRM confirma se a conversa continua sem atendimento.
          </small>
        </span>
      </label>

      {horario.ativo && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div className={styles.field} style={{ marginBottom: 0 }}>
            <span>Dias de atendimento</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {DIAS.map(([dia, label]) => {
                const selecionado = horario.dias.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    className={styles.secondaryButton}
                    aria-pressed={selecionado}
                    onClick={() => alternarDia(dia)}
                    style={
                      selecionado
                        ? {
                            minWidth: 49,
                            minHeight: 36,
                            padding: "0 10px",
                            borderColor: "var(--crm-primary-strong)",
                            background: "var(--crm-primary-strong)",
                            color: "var(--crm-text-inverse)",
                          }
                        : { minWidth: 49, minHeight: 36, padding: "0 10px" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field} style={{ marginBottom: 0 }}>
              <span>Início</span>
              <input
                type="time"
                value={horario.inicio}
                onChange={(event) => atualizar({ inicio: event.target.value })}
              />
            </label>
            <label className={styles.field} style={{ marginBottom: 0 }}>
              <span>Fim</span>
              <input
                type="time"
                value={horario.fim}
                onChange={(event) => atualizar({ fim: event.target.value })}
              />
            </label>
          </div>

          <label className={styles.field} style={{ marginBottom: 0 }}>
            <span>Fuso horário</span>
            <select
              value={horario.timezone}
              onChange={(event) => atualizar({ timezone: event.target.value })}
            >
              {FUSOS_HORARIOS_AMERICA_LATINA.map((fuso) => (
                <option key={fuso.value} value={fuso.value}>
                  {fuso.label}
                </option>
              ))}
            </select>
            <small className={styles.fieldHint}>
              O horário é calculado de acordo com o fuso selecionado, incluindo alterações oficiais de horário quando aplicáveis.
            </small>
          </label>
        </div>
      )}
    </section>
  );
}
