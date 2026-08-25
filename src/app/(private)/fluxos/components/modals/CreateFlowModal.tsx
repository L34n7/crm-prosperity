"use client";

import type {
  EscopoIntegracoesModo,
  GatilhoFluxo,
  IntegracaoWhatsappOpcao,
} from "../../types";
import InactivityFields from "../flow-settings/InactivityFields";
import IntegrationScopeFields from "../flow-settings/IntegrationScopeFields";
import styles from "../../fluxos.module.css";

type GatilhoNovoFluxo = {
  valor: string;
  condicao: GatilhoFluxo["condicao"];
  ativo?: boolean;
};

type CreateFlowModalProps = {
  nome: string;
  descricao: string;
  fluxoPadrao: boolean;
  jaExisteFluxoPadrao: boolean;
  mostrarEscopoIntegracoes: boolean;
  escopoModo: EscopoIntegracoesModo;
  integracoesIds: string[];
  integracoes: IntegracaoWhatsappOpcao[];
  carregandoIntegracoes: boolean;
  quantidadeInatividade: string;
  unidadeInatividade: "minutos" | "horas";
  mensagemInatividade: string;
  gatilhos: GatilhoNovoFluxo[];
  novoGatilhoValor: string;
  novoGatilhoCondicao: GatilhoFluxo["condicao"];
  erro: string;
  rotuloIntegracao: (integracao: IntegracaoWhatsappOpcao) => string;
  onNomeChange: (value: string) => void;
  onDescricaoChange: (value: string) => void;
  onFluxoPadraoChange: (value: boolean) => void;
  onEscopoModoChange: (value: EscopoIntegracoesModo) => void;
  onAlternarIntegracao: (integracaoId: string) => void;
  onQuantidadeInatividadeChange: (value: string) => void;
  onQuantidadeInatividadeBlur: () => void;
  onUnidadeInatividadeChange: (value: "minutos" | "horas") => void;
  onMensagemInatividadeChange: (value: string) => void;
  onNovoGatilhoValorChange: (value: string) => void;
  onNovoGatilhoCondicaoChange: (value: GatilhoFluxo["condicao"]) => void;
  onAdicionarGatilho: () => void;
  onAlternarGatilho: (index: number) => void;
  onRemoverGatilho: (index: number) => void;
  onCancelar: () => void;
  onCriar: () => void;
};

export default function CreateFlowModal({
  nome,
  descricao,
  fluxoPadrao,
  jaExisteFluxoPadrao,
  mostrarEscopoIntegracoes,
  escopoModo,
  integracoesIds,
  integracoes,
  carregandoIntegracoes,
  quantidadeInatividade,
  unidadeInatividade,
  mensagemInatividade,
  gatilhos,
  novoGatilhoValor,
  novoGatilhoCondicao,
  erro,
  rotuloIntegracao,
  onNomeChange,
  onDescricaoChange,
  onFluxoPadraoChange,
  onEscopoModoChange,
  onAlternarIntegracao,
  onQuantidadeInatividadeChange,
  onQuantidadeInatividadeBlur,
  onUnidadeInatividadeChange,
  onMensagemInatividadeChange,
  onNovoGatilhoValorChange,
  onNovoGatilhoCondicaoChange,
  onAdicionarGatilho,
  onAlternarGatilho,
  onRemoverGatilho,
  onCancelar,
  onCriar,
}: CreateFlowModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Novo fluxo</p>
            <h3 className={styles.modalTitle}>Criar automação</h3>
          </div>
          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onCancelar}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.field}>
            <span className={styles.label}>Nome do fluxo</span>
            <input
              className={styles.input}
              value={nome}
              onChange={(event) => onNomeChange(event.target.value)}
              placeholder="Ex: Atendimento inicial"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Descrição</span>
            <textarea
              className={styles.textarea}
              value={descricao}
              onChange={(event) => onDescricaoChange(event.target.value)}
              placeholder="Descrição opcional"
            />
          </label>

          {mostrarEscopoIntegracoes && (
            <IntegrationScopeFields
              modo={escopoModo}
              idsSelecionados={integracoesIds}
              integracoes={integracoes}
              carregando={carregandoIntegracoes}
              rotuloIntegracao={rotuloIntegracao}
              onModoChange={onEscopoModoChange}
              onAlternarIntegracao={onAlternarIntegracao}
            />
          )}

          <InactivityFields
            quantidade={quantidadeInatividade}
            unidade={unidadeInatividade}
            mensagem={mensagemInatividade}
            onQuantidadeChange={onQuantidadeInatividadeChange}
            onQuantidadeBlur={onQuantidadeInatividadeBlur}
            onUnidadeChange={onUnidadeInatividadeChange}
            onMensagemChange={onMensagemInatividadeChange}
          />

          {!jaExisteFluxoPadrao && (
            <label className={styles.switchField}>
              <input
                type="checkbox"
                checked={fluxoPadrao}
                onChange={(event) =>
                  onFluxoPadraoChange(event.target.checked)
                }
              />
              <div>
                <strong>Fluxo padrão</strong>
                <p>
                  Inicia automaticamente quando nenhuma palavra-chave de outro
                  fluxo for encontrada.
                </p>
              </div>
            </label>
          )}

          {!fluxoPadrao && (
            <div className={styles.gatilhosBox}>
              <div>
                <p className={styles.modalSectionTitle}>Gatilhos do fluxo</p>
                <p className={styles.help}>
                  Palavras que iniciam este fluxo quando o cliente envia uma
                  mensagem.
                </p>
              </div>

              <div className={styles.gatilhoCreateRow}>
                <input
                  className={styles.input}
                  value={novoGatilhoValor}
                  onChange={(event) =>
                    onNovoGatilhoValorChange(event.target.value)
                  }
                  placeholder="Ex: suporte, login, senha"
                />

                <div className={styles.gatilhoBottomRow}>
                  <select
                    className={styles.input}
                    value={novoGatilhoCondicao}
                    onChange={(event) =>
                      onNovoGatilhoCondicaoChange(
                        event.target.value as GatilhoFluxo["condicao"]
                      )
                    }
                  >
                    <option value="contem">Contém</option>
                    <option value="exata">Exata</option>
                    <option value="inicia_com">Inicia com</option>
                    <option value="regex">Regex</option>
                  </select>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={onAdicionarGatilho}
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {gatilhos.length === 0 ? (
                <div className={styles.emptyMini}>
                  Nenhum gatilho adicionado para este novo fluxo.
                </div>
              ) : (
                <div className={styles.gatilhosList}>
                  {gatilhos.map((gatilho, index) => (
                    <div
                      key={`${gatilho.valor}-${gatilho.condicao}-${index}`}
                      className={styles.gatilhoItem}
                    >
                      <div>
                        <strong className={styles.gatilhoValor}>
                          {gatilho.valor}
                        </strong>
                        <p className={styles.gatilhoMeta}>
                          Condição:{" "}
                          {gatilho.condicao === "contem"
                            ? "Contém a palavra"
                            : gatilho.condicao === "exata"
                            ? "Igual exatamente"
                            : gatilho.condicao === "inicia_com"
                            ? "Começa com"
                            : gatilho.condicao}{" "}
                          · {gatilho.ativo === false ? "Inativo" : "Ativo"}
                        </p>
                      </div>

                      <div className={styles.gatilhoActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => onAlternarGatilho(index)}
                        >
                          {gatilho.ativo === false ? "Ativar" : "Desativar"}
                        </button>
                        <button
                          type="button"
                          className={styles.dangerSmallButton}
                          onClick={() => onRemoverGatilho(index)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {erro && (
          <div className={styles.errorAlertBox}>
            <div className={styles.errorAlert}>{erro}</div>
          </div>
        )}

        <div className={styles.modalFooter}>
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
            onClick={onCriar}
          >
            Criar fluxo
          </button>
        </div>
      </div>
    </div>
  );
}
