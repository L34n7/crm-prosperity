"use client";

import styles from "../../fluxos.module.css";

type CapturarRespostaConfigProps = {
  tipoCaptura: string;
  variavel: string;
  mensagemErro: string;
  onTipoCapturaChange: (valor: string) => void;
  onVariavelChange: (valor: string) => void;
  onMensagemErroChange: (valor: string) => void;
};

export default function CapturarRespostaConfig({
  tipoCaptura,
  variavel,
  mensagemErro,
  onTipoCapturaChange,
  onVariavelChange,
  onMensagemErroChange,
}: CapturarRespostaConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <label className={styles.field}>
        <span className={styles.label}>Tipo de captura</span>
        <select
          className={styles.input}
          value={tipoCaptura}
          onChange={(e) => onTipoCapturaChange(e.target.value)}
        >
          <option value="texto">Texto livre</option>
          <option value="nome">Nome</option>
          <option value="cpf">CPF</option>
          <option value="cnpj">CNPJ</option>
          <option value="email">Email</option>
          <option value="telefone">Telefone</option>
          <option value="numero">Número</option>
          <option value="data">Data</option>
          <option value="cep">CEP</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Salvar resposta na variável</span>
        <input
          className={styles.input}
          value={variavel}
          onChange={(e) => onVariavelChange(e.target.value)}
          placeholder="Ex: nome, cpf, email"
        />
        <p className={styles.help}>
          Use variaveis com duas chaves de cada lado. Exemplo: {"{{variavel}}"} ou {"{{teste}}"}.
        </p>
        <p className={styles.help}>
          Nao use os nomes fixos do contato para salvar respostas.
        </p>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Mensagem quando inválido</span>
        <textarea
          className={styles.textarea}
          value={mensagemErro}
          onChange={(e) => onMensagemErroChange(e.target.value)}
        />
      </label>
    </div>
  );
}
