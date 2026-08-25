"use client";

import styles from "../../fluxos.module.css";

type InterpretarArquivoIaConfigProps = {
  instrucao: string;
  camposExtracao: string;
  mensagemErro: string;
  onInstrucaoChange: (valor: string) => void;
  onCamposExtracaoChange: (valor: string) => void;
  onMensagemErroChange: (valor: string) => void;
};

export default function InterpretarArquivoIaConfig({
  instrucao,
  camposExtracao,
  mensagemErro,
  onInstrucaoChange,
  onCamposExtracaoChange,
  onMensagemErroChange,
}: InterpretarArquivoIaConfigProps) {
  return (
    <div className={styles.arquivoIABox}>
      <label className={styles.field}>
        <span className={styles.label}>Instrução para IA</span>
        <textarea
          className={styles.textarea}
          value={instrucao}
          onChange={(e) => onInstrucaoChange(e.target.value)}
          placeholder="Ex: Interprete se este arquivo é um comprovante de pagamento no valor mínimo de R$ 150,00."
        />
        <span className={styles.help}>
          Explique o que a IA deve verificar no arquivo enviado pelo cliente.
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Campos para extrair</span>
        <textarea
          className={styles.textarea}
          value={camposExtracao}
          onChange={(e) => onCamposExtracaoChange(e.target.value)}
          placeholder="valor, banco, pagador, data, id_transacao"
        />
        <span className={styles.help}>
          Informe as variáveis separadas por vírgula, palavras sem acentos. A IA só poderá retornar esses campos.
          Exemplo: valor, banco, pagador. Depois você poderá usar como{" "}{"{{analise_arquivo_valor}}"}.
        </span>
        <span className={styles.help}>
          Váriaveis fixas: {"{{analise_arquivo}}"} {"{{analise_arquivo_motivo}}"}
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Mensagem quando inválido</span>
        <textarea
          className={styles.textarea}
          value={mensagemErro}
          onChange={(e) => onMensagemErroChange(e.target.value)}
        />
      </label>

      <div className={styles.warningBox}>
        <div className={styles.errorConnectionNotice}>
          <strong>Crie uma conexão de Erro para este bloco</strong>
          <p>
            Se os tokens de IA acabarem, o fluxo vai seguir pela conexão com resposta esperada <strong>erro</strong>.
            Configure essa rota para enviar uma mensagem, transferir o atendimento ou executar a tratativa que desejar.
          </p>
        </div>

        <strong>Como usar as conexões deste bloco</strong>
        <p>
          Após interpretar o arquivo, a IA retorna um status para o fluxo seguir. Crie conexões saindo deste bloco.
        </p>
        <ul className={styles.warningList}>
          <li><strong>aprovado</strong> — quando o arquivo atende à instrução.</li>
          <li><strong>reprovado</strong> — quando o arquivo não atende à instrução.</li>
          <li>
            <strong>erro</strong> — quando o arquivo está ilegível, não pôde ser analisado ou os tokens de IA acabaram.
          </li>
        </ul>
      </div>
    </div>
  );
}
