"use client";

import { Clock3 } from "lucide-react";
import {
  normalizarDelayDinamico,
  type ConfigDelayDinamico,
} from "@/lib/agentes-ia/delay-dinamico";
import styles from "./DelayDinamicoEditor.module.css";

type Props = {
  value: ConfigDelayDinamico;
  onChange: (valor: ConfigDelayDinamico) => void;
};

export default function DelayDinamicoEditor({ value, onChange }: Props) {
  const ativo = normalizarDelayDinamico(value).ativo;
  return (
    <div className={styles.card}>
      <div className={styles.titulo}>
        <Clock3 size={18} aria-hidden="true" />
        <div>
          <strong>Delay dinâmico</strong>
          <span>
            {ativo
              ? "Ativado: pequenas pausas automáticas antes de cada mensagem, conforme o tamanho do texto."
              : "Adiciona pausas curtas e naturais entre as mensagens do agente."}
          </span>
        </div>
      </div>
      <label className={styles.ativar}>
        <input
          type="checkbox"
          checked={ativo}
          onChange={(event) => onChange({ ativo: event.target.checked })}
        />
        <span>{ativo ? "Ativado" : "Desativado"}</span>
      </label>
    </div>
  );
}
