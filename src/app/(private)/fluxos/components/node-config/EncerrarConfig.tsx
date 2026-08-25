"use client";

import styles from "../../fluxos.module.css";

type EncerrarConfigProps = {
  resultado: string;
  tipoValor: string;
  valorFixo: string;
  valorVariavel: string;
  onResultadoChange: (valor: string) => void;
  onTipoValorChange: (valor: string) => void;
  onValorFixoChange: (valor: string) => void;
  onValorVariavelChange: (valor: string) => void;
};

export default function EncerrarConfig({
  resultado,
  tipoValor,
  valorFixo,
  valorVariavel,
  onResultadoChange,
  onTipoValorChange,
  onValorFixoChange,
  onValorVariavelChange,
}: EncerrarConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <label className={styles.field}>
        <span className={styles.label}>Resultado do fluxo</span>
        <select
          className={styles.input}
          value={resultado}
          onChange={(e) => onResultadoChange(e.target.value)}
        >
          <option value="positivo">Positivo</option>
          <option value="negativo">Negativo</option>
          <option value="neutro">Neutro</option>
        </select>
        <span className={styles.help}>
          Esse resultado sera usado nos eventos e relatorios do rastreamento.
        </span>
      </label>

      {resultado === "positivo" && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Valor da conversao</span>
            <select
              className={styles.input}
              value={tipoValor}
              onChange={(e) => onTipoValorChange(e.target.value)}
            >
              <option value="sem_valor">Sem valor</option>
              <option value="valor_fixo">Valor fixo</option>
              <option value="variavel">Variavel do fluxo</option>
            </select>
          </label>

          {tipoValor === "valor_fixo" && (
            <label className={styles.field}>
              <span className={styles.label}>Valor fixo da conversao</span>
              <input
                className={styles.input}
                value={valorFixo}
                onChange={(e) => onValorFixoChange(e.target.value)}
                placeholder="Ex: 497,00"
              />
            </label>
          )}

          {tipoValor === "variavel" && (
            <label className={styles.field}>
              <span className={styles.label}>Variavel com o valor</span>
              <input
                className={styles.input}
                value={valorVariavel}
                onChange={(e) => onValorVariavelChange(e.target.value)}
                placeholder="Ex: valor_plano"
              />
              <span className={styles.help}>
                Informe o nome da variavel salva no fluxo, sem chaves. Exemplo: valor_plano.
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
