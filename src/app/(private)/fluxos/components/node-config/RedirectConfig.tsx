"use client";

import styles from "../../fluxos.module.css";

type RedirectConfigProps = {
  textoBotao: string;
  url: string;
  onTextoBotaoChange: (valor: string) => void;
  onUrlChange: (valor: string) => void;
};

export default function RedirectConfig({
  textoBotao,
  url,
  onTextoBotaoChange,
  onUrlChange,
}: RedirectConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <label className={styles.field}>
        <span className={styles.label}>Texto do botão</span>
        <input
          className={styles.input}
          value={textoBotao}
          onChange={(e) => onTextoBotaoChange(e.target.value)}
          placeholder="Acessar"
          maxLength={20}
        />
        <span className={styles.help}>
          O WhatsApp permite ate 20 caracteres no botão CTA.
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>URL de destino</span>
        <input
          className={styles.input}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
        />
        <span className={styles.help}>
          Use um link https, incluindo convites de grupo do WhatsApp ou links externos.
        </span>
      </label>
    </div>
  );
}
