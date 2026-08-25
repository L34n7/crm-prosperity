"use client";

import { LIMITE_DELAY_SEGUNDOS } from "../../constants";
import styles from "../../fluxos.module.css";

type DelayConfigProps = {
  valor: string;
  onChange: (valor: string) => void;
};

export default function DelayConfig({ valor, onChange }: DelayConfigProps) {
  return (
    <label className={styles.delayField}>
      <div className={styles.delayTopRow}>
        <span className={styles.label}>Delay antes de enviar:</span>
        <span className={styles.helpS}>Segundos:</span>
        <input
          type="number"
          min={0}
          max={LIMITE_DELAY_SEGUNDOS}
          className={styles.delayInput}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <span className={styles.help}>
        Delay adicional antes do envio deste bloco, é somado ao tempo minimo do sistema, entre 2 a 3 segundos. Deixe vazio para envio imediato.
      </span>
      <span className={styles.help}>
        Máximo: 82.800 segundos, equivalente a 23 horas.
      </span>
    </label>
  );
}
