"use client";

import styles from "../../fluxos.module.css";

type OpcaoPergunta = {
  valor: string;
  titulo: string;
};

type PerguntaOpcoesConfigProps = {
  opcoes: OpcaoPergunta[];
  onAdicionar: () => void;
  onAtualizar: (
    index: number,
    campo: "valor" | "titulo",
    valor: string
  ) => void;
  onRemover: (index: number) => void;
};

export default function PerguntaOpcoesConfig({
  opcoes,
  onAdicionar,
  onAtualizar,
  onRemover,
}: PerguntaOpcoesConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <div className={styles.optionsHeader}>
        <span className={styles.label}>Opções da pergunta</span>
        <button
          type="button"
          className={styles.smallButton}
          onClick={onAdicionar}
        >
          + Opção
        </button>
      </div>

      {opcoes.length === 0 ? (
        <p className={styles.help}>Nenhuma opção cadastrada.</p>
      ) : (
        opcoes.map((opcao, index) => (
          <div key={index} className={styles.optionRow}>
            <label className={styles.botaoRespostaCampo}>
              <span className={styles.botaoRespostaLabel}>ID da resposta</span>
              <input
                className={styles.optionValueInput}
                value={opcao.valor}
                onChange={(e) => onAtualizar(index, "valor", e.target.value)}
                placeholder="1"
              />
            </label>

            <label className={styles.botaoRespostaCampo}>
              <span className={styles.botaoRespostaLabel}>Texto do botão</span>
              <input
                className={styles.input}
                value={opcao.titulo}
                onChange={(e) => onAtualizar(index, "titulo", e.target.value)}
                placeholder="Comercial"
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
    </div>
  );
}
