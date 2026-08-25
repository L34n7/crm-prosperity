"use client";

import styles from "../../fluxos.module.css";

type BotaoResposta = {
  id: string;
  titulo: string;
};

type BotoesConfigProps = {
  botoes: BotaoResposta[];
  onAdicionar: () => void;
  onAtualizar: (
    index: number,
    campo: "id" | "titulo",
    valor: string
  ) => void;
  onRemover: (index: number) => void;
};

export default function BotoesConfig({
  botoes,
  onAdicionar,
  onAtualizar,
  onRemover,
}: BotoesConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <div className={styles.optionsHeader}>
        <span className={styles.label}>Botões de resposta</span>
        <button
          type="button"
          className={styles.smallButton}
          onClick={onAdicionar}
          disabled={botoes.length >= 3}
        >
          + Botão
        </button>
      </div>

      {botoes.length === 0 ? (
        <p className={styles.help}>Nenhum botão cadastrado.</p>
      ) : (
        botoes.map((botao, index) => (
          <div key={index} className={styles.botaoRespostaRow}>
            <label className={styles.botaoRespostaCampo}>
              <span className={styles.botaoRespostaLabel}>ID da resposta</span>
              <input
                className={styles.optionValueInput}
                value={botao.id}
                onChange={(e) => onAtualizar(index, "id", e.target.value)}
                placeholder="sim"
              />
            </label>

            <label className={styles.botaoRespostaCampo}>
              <span className={styles.botaoRespostaLabel}>Texto do botão</span>
              <input
                className={styles.input}
                value={botao.titulo}
                onChange={(e) => onAtualizar(index, "titulo", e.target.value)}
                placeholder="Sim"
                maxLength={20}
              />
            </label>

            <button
              type="button"
              className={styles.dangerSmallButton}
              onClick={() => onRemover(index)}
            >
              ×
            </button>
          </div>
        ))
      )}

      <p className={styles.help}>
        O cliente vê o texto do botão. A conexão do fluxo deve usar o ID da resposta.
        Exemplo: ID “não” conecta com resposta esperada “não”.
      </p>
      <p className={styles.help}>
        O WhatsApp permite até 20 caracteres no botão.
      </p>
    </div>
  );
}
