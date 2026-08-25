"use client";

import { Sparkles } from "lucide-react";
import styles from "../fluxos.module.css";

type TimeoutUnidade = "minutos" | "horas";
type StatusEnvioTimeout = "qualquer" | "entregue" | "lida";

type ConnectionEditorProps = {
  rotuloConexao: string;
  tipoCondicaoConexao: string;
  timeoutQuantidade: string;
  timeoutUnidade: TimeoutUnidade;
  statusEnvioTimeout: StatusEnvioTimeout;
  origemPerguntaLivreIa: boolean;
  usarIaConexao: boolean;
  descricaoIaConexao: string;
  valorCondicao: string;
  gerandoDescricaoIaConexao: boolean;
  salvando: boolean;
  confirmandoExclusaoConexao: boolean;
  onNomeConexaoChange: (valor: string) => void;
  onTipoCondicaoChange: (valor: string) => void;
  onTimeoutQuantidadeChange: (valor: string) => void;
  onTimeoutUnidadeChange: (valor: TimeoutUnidade) => void;
  onStatusEnvioTimeoutChange: (valor: StatusEnvioTimeout) => void;
  onUsarIaChange: (ativo: boolean) => void;
  onDescricaoIaChange: (valor: string) => void;
  onGerarDescricaoIa: () => void;
  onValorCondicaoChange: (valor: string) => void;
  onPedirExclusao: () => void;
  onConfirmarExclusao: () => void;
  onCancelar: () => void;
  onAplicar: () => void;
};

export default function ConnectionEditor({
  rotuloConexao,
  tipoCondicaoConexao,
  timeoutQuantidade,
  timeoutUnidade,
  statusEnvioTimeout,
  origemPerguntaLivreIa,
  usarIaConexao,
  descricaoIaConexao,
  valorCondicao,
  gerandoDescricaoIaConexao,
  salvando,
  confirmandoExclusaoConexao,
  onNomeConexaoChange,
  onTipoCondicaoChange,
  onTimeoutQuantidadeChange,
  onTimeoutUnidadeChange,
  onStatusEnvioTimeoutChange,
  onUsarIaChange,
  onDescricaoIaChange,
  onGerarDescricaoIa,
  onValorCondicaoChange,
  onPedirExclusao,
  onConfirmarExclusao,
  onCancelar,
  onAplicar,
}: ConnectionEditorProps) {
  const ehSempreSeguir = tipoCondicaoConexao === "sempre";
  const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";
  const permiteInterpretacaoIa = !ehSempreSeguir && !ehTimeout;

  return (
    <div className={styles.propertiesForm}>
      <label className={styles.field}>
        <span className={styles.label}>Nome da conexão</span>
        <input
          className={styles.input}
          value={ehSempreSeguir ? "Sempre seguir" : rotuloConexao}
          onChange={(event) => onNomeConexaoChange(event.target.value)}
          placeholder="Ex: Opção 1, Sim, Comercial"
          disabled={ehSempreSeguir}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Tipo da condição</span>
        <select
          className={styles.input}
          value={tipoCondicaoConexao}
          onChange={(event) => onTipoCondicaoChange(event.target.value)}
        >
          <option value="resposta_igual">Exata</option>
          <option value="resposta_contem">Contém</option>
          <option value="resposta_inicia_com">Inicia com</option>
          <option value="resposta_regex">Regex</option>
          <option value="sempre">Sempre seguir</option>
          <option value="timeout_sem_resposta">Sem resposta após tempo</option>
        </select>
      </label>

      {ehTimeout && (
        <div className={styles.optionsBox}>
          <div className={styles.timeoutGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Tempo mínimo</span>
              <input
                type="number"
                min={5}
                max={timeoutUnidade === "horas" ? 22 : 1320}
                className={styles.input}
                value={timeoutQuantidade}
                onChange={(event) =>
                  onTimeoutQuantidadeChange(event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Unidade</span>
              <select
                className={styles.input}
                value={timeoutUnidade}
                onChange={(event) =>
                  onTimeoutUnidadeChange(event.target.value as TimeoutUnidade)
                }
              >
                <option value="minutos">Minutos</option>
                <option value="horas">Horas</option>
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Status da mensagem</span>
            <select
              className={styles.input}
              value={statusEnvioTimeout}
              onChange={(event) =>
                onStatusEnvioTimeoutChange(
                  event.target.value as StatusEnvioTimeout
                )
              }
            >
              <option value="qualquer">Qualquer status</option>
              <option value="entregue">Apenas entregue</option>
              <option value="lida">Apenas lida</option>
            </select>
          </label>

          <p className={styles.help}>
            Para mensagens comuns do WhatsApp, o tempo precisa ser menor que 22
            horas. Para 22h ou mais será necessário usar template aprovado.
          </p>
        </div>
      )}

      <div className={styles.IABox}>
        {origemPerguntaLivreIa && permiteInterpretacaoIa && (
          <p className={styles.help}>
            Nesta origem, cada conexão com IA representa uma intenção possível
            para a resposta livre do cliente.
          </p>
        )}

        <label className={styles.IAField}>
          <input
            type="checkbox"
            checked={usarIaConexao && permiteInterpretacaoIa}
            disabled={!permiteInterpretacaoIa}
            onChange={(event) => onUsarIaChange(event.target.checked)}
          />

          <div>
            <strong>Usar IA para interpretar esta conexão</strong>
            <p>
              A IA vai analisar a resposta do cliente e escolher esta conexão
              quando a intenção combinar com a descrição abaixo.
            </p>
          </div>
        </label>

        {usarIaConexao && (
          <label className={styles.field}>
            <span className={styles.label}>Descrição para IA</span>
            <textarea
              className={styles.textarea}
              value={descricaoIaConexao}
              onChange={(event) => onDescricaoIaChange(event.target.value)}
              placeholder="Ex: Use esta conexão quando o cliente quiser saber preço, planos, mensalidade, orçamento ou contratar."
            />

            <span className={styles.help}>
              Descreva a intenção do cliente. Não coloque resposta pronta; coloque
              quando esta conexão deve ser usada.
            </span>
          </label>
        )}

        {permiteInterpretacaoIa && (
          <button
            type="button"
            className={`${styles.smallButtonIA} ${styles.generateIaButton}`}
            onClick={onGerarDescricaoIa}
            disabled={gerandoDescricaoIaConexao || salvando}
          >
            <Sparkles size={14} />
            {gerandoDescricaoIaConexao
              ? "Gerando..."
              : "Gerar descrição com IA"}
          </button>
        )}
      </div>

      {permiteInterpretacaoIa && !usarIaConexao && (
        <label className={styles.field}>
          <span className={styles.label}>ID da resposta </span>
          <input
            className={styles.input}
            value={valorCondicao}
            onChange={(event) => onValorCondicaoChange(event.target.value)}
            placeholder="Ex: 1, sim, quero comprar"
          />
        </label>
      )}

      <div
        className={`${styles.actionButtonsRow} ${styles.connectionActionButtonsRow}`}
      >
        {confirmandoExclusaoConexao ? (
          <button
            type="button"
            className={styles.deleteNodeConfirmButton}
            onClick={onConfirmarExclusao}
          >
            Excluir
          </button>
        ) : (
          <button
            type="button"
            className={styles.deleteNodeIconButton}
            onClick={onPedirExclusao}
            title="Excluir conexão"
          >
            🗑
          </button>
        )}

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onCancelar}
        >
          Cancelar
        </button>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={onAplicar}
          disabled={salvando}
        >
          Aplicar na conexão
        </button>
      </div>

      <p className={styles.help}>
        Depois de aplicar, clique em Salvar fluxo para gravar no banco.
      </p>
    </div>
  );
}
