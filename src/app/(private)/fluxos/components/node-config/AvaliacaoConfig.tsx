"use client";

import styles from "../../fluxos.module.css";

type AvaliacaoConfigProps = {
  notaMinima: string;
  notaMaxima: string;
  solicitarComentario: boolean;
  mensagemComentario: string;
  onNotaMinimaChange: (valor: string) => void;
  onNotaMaximaChange: (valor: string) => void;
  onSolicitarComentarioChange: (valor: boolean) => void;
  onMensagemComentarioChange: (valor: string) => void;
};

export default function AvaliacaoConfig({
  notaMinima,
  notaMaxima,
  solicitarComentario,
  mensagemComentario,
  onNotaMinimaChange,
  onNotaMaximaChange,
  onSolicitarComentarioChange,
  onMensagemComentarioChange,
}: AvaliacaoConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <div className={styles.optionRow}>
        <label className={styles.field}>
          <span className={styles.label}>Nota mínima</span>
          <input
            type="number"
            className={styles.input}
            value={notaMinima}
            onChange={(e) => onNotaMinimaChange(e.target.value)}
            min={0}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Nota máxima</span>
          <input
            type="number"
            className={styles.input}
            value={notaMaxima}
            onChange={(e) => onNotaMaximaChange(e.target.value)}
            min={1}
          />
        </label>
      </div>

      <label className={styles.switchField}>
        <input
          type="checkbox"
          checked={solicitarComentario}
          onChange={(e) => onSolicitarComentarioChange(e.target.checked)}
        />

        <div>
          <strong>Solicitar comentário</strong>
          <p>
            Após enviar a nota, o cliente poderá escrever um comentário sobre o atendimento.
          </p>
        </div>
      </label>

      {solicitarComentario && (
        <label className={styles.field}>
          <span className={styles.label}>Mensagem para solicitar comentário</span>
          <textarea
            className={styles.textarea}
            value={mensagemComentario}
            onChange={(e) => onMensagemComentarioChange(e.target.value)}
            placeholder="Ex: Conte como foi sua experiência."
          />
        </label>
      )}
    </div>
  );
}
