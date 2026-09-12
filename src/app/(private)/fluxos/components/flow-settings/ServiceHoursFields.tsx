"use client";

import { Clock3 } from "lucide-react";
import {
  FUSOS_HORARIOS_FLUXO_AMERICA_LATINA,
  type HorarioAtendimentoFluxo,
} from "@/lib/automacoes/normalizar-configuracao-fluxo";
import styles from "../../fluxos.module.css";

const DIAS = [
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
  [7, "Dom"],
] as const;

type ServiceHoursFieldsProps = {
  value: HorarioAtendimentoFluxo;
  onChange: (value: HorarioAtendimentoFluxo) => void;
  disabled?: boolean;
};

export default function ServiceHoursFields({
  value,
  onChange,
  disabled = false,
}: ServiceHoursFieldsProps) {
  function atualizar(patch: Partial<HorarioAtendimentoFluxo>) {
    onChange({ ...value, ...patch });
  }

  function alternarDia(dia: number) {
    const dias = value.dias.includes(dia)
      ? value.dias.filter((item) => item !== dia)
      : [...value.dias, dia].sort((a, b) => a - b);

    atualizar({ dias });
  }

  return (
    <div className={styles.gatilhosBox}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <Clock3 size={18} style={{ marginTop: 1, flex: "0 0 auto" }} />
        <div>
          <p className={styles.modalSectionTitle}>Horário de atendimento</p>
          <p className={styles.help}>
            Defina quando este fluxo pode executar respostas e ações automáticas.
          </p>
        </div>
      </div>

      <label className={styles.switchField}>
        <input
          type="checkbox"
          checked={value.ativo}
          disabled={disabled}
          onChange={(event) => atualizar({ ativo: event.target.checked })}
        />
        <div>
          <strong>Limitar horário de atendimento</strong>
          <p>
            Fora do horário, o fluxo aguarda a próxima abertura. Antes de
            retomar, o CRM confirma se a conversa ainda pode seguir no
            atendimento automático.
          </p>
        </div>
      </label>

      {value.ativo && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className={styles.field}>
            <span className={styles.label}>Dias de atendimento</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {DIAS.map(([dia, label]) => {
                const selecionado = value.dias.includes(dia);

                return (
                  <button
                    key={dia}
                    type="button"
                    disabled={disabled}
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
                        : {
                            minWidth: 49,
                            minHeight: 36,
                            padding: "0 10px",
                          }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <label className={styles.field}>
              <span className={styles.label}>Início</span>
              <input
                type="time"
                className={styles.input}
                value={value.inicio}
                disabled={disabled}
                onChange={(event) => atualizar({ inicio: event.target.value })}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Fim</span>
              <input
                type="time"
                className={styles.input}
                value={value.fim}
                disabled={disabled}
                onChange={(event) => atualizar({ fim: event.target.value })}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Fuso horário</span>
            <select
              className={styles.input}
              value={value.timezone}
              disabled={disabled}
              onChange={(event) => atualizar({ timezone: event.target.value })}
            >
              {FUSOS_HORARIOS_FLUXO_AMERICA_LATINA.map((fuso) => (
                <option key={fuso.value} value={fuso.value}>
                  {fuso.label}
                </option>
              ))}
            </select>
            <span className={styles.help}>
              O horário é calculado de acordo com o fuso selecionado.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
