"use client";

import styles from "../../fluxos.module.css";

type NotificacaoConfigProps = {
  ativo: boolean;
  titulo: string;
  mensagem: string;
  enviarEmail: boolean;
  onAtivoChange: (valor: boolean) => void;
  onTituloChange: (valor: string) => void;
  onMensagemChange: (valor: string) => void;
  onEnviarEmailChange: (valor: boolean) => void;
};

export default function NotificacaoConfig({
  ativo,
  titulo,
  mensagem,
  enviarEmail,
  onAtivoChange,
  onTituloChange,
  onMensagemChange,
  onEnviarEmailChange,
}: NotificacaoConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <label className={styles.switchField}>
        <input
          type="checkbox"
          checked={ativo}
          onChange={(e) => onAtivoChange(e.target.checked)}
        />
        <div>
          <strong>Notificar quando chegar neste bloco</strong>
          <p>
            Cria uma notificação no sistema quando a automação alcançar este bloco.
          </p>
        </div>
      </label>

      {ativo && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Título da notificação</span>
            <input
              className={styles.input}
              value={titulo}
              onChange={(e) => onTituloChange(e.target.value)}
              placeholder="Ex: Lead chegou na escolha de plano"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mensagem da notificação</span>
            <textarea
              className={styles.textarea}
              value={mensagem}
              onChange={(e) => onMensagemChange(e.target.value)}
              placeholder="Ex: O contato chegou no bloco de escolha de plano."
            />
          </label>

          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={enviarEmail}
              onChange={(e) => onEnviarEmailChange(e.target.checked)}
            />
            <div>
              <strong>Enviar email também</strong>
              <p>
                Além da notificação no sistema, envia um email para os responsáveis.
              </p>
            </div>
          </label>
        </>
      )}
    </div>
  );
}
