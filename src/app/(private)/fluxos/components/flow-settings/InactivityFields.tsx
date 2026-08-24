"use client";

import styles from "../../fluxos.module.css";

type UnidadeInatividade = "minutos" | "horas";

type InactivityFieldsProps = {
  quantidade: string;
  unidade: UnidadeInatividade;
  mensagem: string;
  onQuantidadeChange: (value: string) => void;
  onQuantidadeBlur: () => void;
  onUnidadeChange: (value: UnidadeInatividade) => void;
  onMensagemChange: (value: string) => void;
};

export default function InactivityFields({
  quantidade,
  unidade,
  mensagem,
  onQuantidadeChange,
  onQuantidadeBlur,
  onUnidadeChange,
  onMensagemChange,
}: InactivityFieldsProps) {
  return (
    <div className={styles.sectionBlock}>
      <div>
        <p className={styles.modalSectionTitle}>
          Encerramento por inatividade
        </p>
        <p className={styles.helperText}>
          Todo fluxo será encerrado automaticamente quando o contato ficar
          sem responder pelo tempo definido. Essa regra tem prioridade sobre
          conexões &quot;Sem resposta após tempo&quot; maiores.
        </p>
      </div>

      <div className={styles.inlineFields}>
        <label className={styles.field}>
          <span className={styles.label}>Tempo sem resposta</span>
          <input
            className={styles.input}
            type="number"
            min={unidade === "minutos" ? 5 : 1}
            max={unidade === "minutos" ? 1380 : 23}
            value={quantidade}
            onChange={(event) => onQuantidadeChange(event.target.value)}
            onBlur={onQuantidadeBlur}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Unidade</span>
          <select
            className={styles.input}
            value={unidade}
            onChange={(event) =>
              onUnidadeChange(
                event.target.value === "minutos" ? "minutos" : "horas"
              )
            }
          >
            <option value="minutos">Minutos</option>
            <option value="horas">Horas</option>
          </select>
        </label>
      </div>

      <p className={styles.helperText}>
        O tempo mínimo é de 5 minutos e o máximo é de 23 horas.
      </p>

      <label className={styles.field}>
        <span className={styles.label}>Mensagem antes de encerrar</span>
        <textarea
          className={styles.textarea}
          value={mensagem}
          onChange={(event) => onMensagemChange(event.target.value)}
          placeholder="Mensagem enviada antes de encerrar o atendimento."
        />
      </label>
    </div>
  );
}
