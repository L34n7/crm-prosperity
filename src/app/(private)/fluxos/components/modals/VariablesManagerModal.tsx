"use client";

import { VARIAVEIS_FIXAS_SISTEMA } from "../../constants";
import type { VariavelPersonalizada } from "../../types";
import styles from "../../fluxos.module.css";

type VariablesManagerModalProps = {
  variaveis: VariavelPersonalizada[];
  loading: boolean;
  salvando: boolean;
  erro: string;
  chave: string;
  valor: string;
  descricao: string;
  onChaveChange: (value: string) => void;
  onValorChange: (value: string) => void;
  onDescricaoChange: (value: string) => void;
  onSalvar: () => void;
  onRemover: (id: string) => void;
  onUsar: (chave: string) => void;
  onFechar: () => void;
};

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

export default function VariablesManagerModal({
  variaveis,
  loading,
  salvando,
  erro,
  chave,
  valor,
  descricao,
  onChaveChange,
  onValorChange,
  onDescricaoChange,
  onSalvar,
  onRemover,
  onUsar,
  onFechar,
}: VariablesManagerModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onFechar}>
      <div
        className={`${styles.modalCard} ${styles.variableManagerModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Variáveis</p>
            <h3 className={styles.modalTitle}>Gerenciar variáveis</h3>
            <p className={styles.modalSubtitle}>
              Cadastre variáveis personalizadas e consulte as variáveis fixas
              disponíveis para disparos e fluxos.
            </p>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onFechar}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalSection}>
            <h4 className={styles.modalSectionTitle}>
              Cadastrar variável personalizada
            </h4>

            <div className={styles.variableFormGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome da variável</span>
                <input
                  value={chave}
                  onChange={(event) =>
                    onChaveChange(
                      normalizarEntradaVariavelTemplate(event.target.value)
                    )
                  }
                  className={styles.input}
                  placeholder="ex: desconto"
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Mensagem da variável</span>
              <textarea
                value={valor}
                onChange={(event) => onValorChange(event.target.value)}
                className={styles.textarea}
                placeholder="Digite a mensagem da variável..."
                rows={4}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Descrição Interna</span>
              <textarea
                value={descricao}
                onChange={(event) => onDescricaoChange(event.target.value)}
                className={styles.textareadesc}
                placeholder="ex: essa variável é sobre desconto."
              />
            </label>

            <div className={styles.variablePreviewBox}>
              A variável será usada assim:{" "}
              <strong>
                {"{{"}
                {normalizarEntradaVariavelTemplate(chave) || "nome_variavel"}
                {"}}"}
              </strong>
            </div>

            {erro && <div className={styles.errorAlert}>{erro}</div>}

            <div className={styles.variableFormActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onSalvar}
                disabled={salvando}
              >
                {salvando ? "Salvando..." : "Salvar variável"}
              </button>
            </div>
          </div>

          <div className={styles.modalSection}>
            <h4 className={styles.modalSectionTitle}>Variáveis cadastradas</h4>

            {loading ? (
              <div className={styles.emptyMini}>Carregando variáveis...</div>
            ) : variaveis.length === 0 ? (
              <div className={styles.emptyMini}>
                Nenhuma variável personalizada cadastrada.
              </div>
            ) : (
              <div className={styles.variablesList}>
                {variaveis.map((item) => (
                  <div key={item.id} className={styles.variableItem}>
                    <div className={styles.variableMain}>
                      <strong className={styles.variableCode}>
                        {"{{"}
                        {item.chave}
                        {"}}"}
                      </strong>

                      <p className={styles.variablePerson}>
                        <strong>Mensagem da variável: </strong>
                        {item.valor}
                      </p>

                      {item.descricao ? (
                        <p className={styles.variablePerson}>
                          <strong>Descrição Interna: </strong>
                          {item.descricao}
                        </p>
                      ) : null}
                    </div>

                    <div className={styles.variableActions}>
                      <button
                        type="button"
                        className={styles.variableUseButton}
                        onClick={() => onUsar(item.chave)}
                      >
                        Usar
                      </button>

                      <button
                        type="button"
                        className={styles.variableDeleteButton}
                        onClick={() => onRemover(item.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.modalSection}>
            <h4 className={styles.modalSectionTitle}>
              Variáveis fixas do sistema
            </h4>

            <div className={styles.variablesList}>
              {VARIAVEIS_FIXAS_SISTEMA.map((item) => (
                <div key={item.chave} className={styles.variableItem}>
                  <div className={styles.variableMain}>
                    <strong className={styles.variableCode}>
                      {item.exemplo}
                    </strong>
                    <p className={styles.variableDescription}>
                      {item.descricao}
                    </p>
                  </div>

                  <button
                    type="button"
                    className={styles.variableUseButton}
                    onClick={() => onUsar(item.chave)}
                  >
                    Usar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onFechar}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
