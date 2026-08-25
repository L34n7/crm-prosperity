"use client";

import type {
  EscopoIntegracoesModo,
  GatilhoFluxo,
  IntegracaoWhatsappOpcao,
} from "../../types";
import InactivityFields from "../flow-settings/InactivityFields";
import IntegrationScopeFields from "../flow-settings/IntegrationScopeFields";
import styles from "../../fluxos.module.css";

type EditFlowModalProps = {
  nome: string;
  descricao: string;
  fluxoPadrao: boolean;
  outroFluxoPadraoExiste: boolean;
  mostrarEscopoIntegracoes: boolean;
  escopoModo: EscopoIntegracoesModo;
  integracoesIds: string[];
  integracoes: IntegracaoWhatsappOpcao[];
  carregandoIntegracoes: boolean;
  quantidadeInatividade: string;
  unidadeInatividade: "minutos" | "horas";
  mensagemInatividade: string;
  gatilhos: GatilhoFluxo[];
  novoGatilhoValor: string;
  novoGatilhoCondicao: GatilhoFluxo["condicao"];
  podeGerenciarGatilhos: boolean;
  podeEditar: boolean;
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
  onAlternarGatilho: (gatilho: GatilhoFluxo) => void;
  onRemoverGatilho: (gatilhoId: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
};

export default function EditFlowModal({
  nome,
  descricao,
  fluxoPadrao,
  outroFluxoPadraoExiste,
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
  podeGerenciarGatilhos,
  podeEditar,
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
  onSalvar,
}: EditFlowModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Editar fluxo</p>
            <h3 className={styles.modalTitle}>Nome e descrição</h3>
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
          {erro && <div className={styles.errorAlert}>{erro}</div>}

          <label className={styles.field}>
            <span className={styles.label}>Nome</span>
            <input
              className={styles.input}
              value={nome}
              onChange={(event) => onNomeChange(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Descrição</span>
            <textarea
              className={styles.textareadesc}
              value={descricao}
              onChange={(event) => onDescricaoChange(event.target.value)}
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

          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={fluxoPadrao}
              disabled={!fluxoPadrao && outroFluxoPadraoExiste}
              onChange={(event) =>
                onFluxoPadraoChange(event.target.checked)
              }
            />

            <div>
              <strong>Tornar este fluxo padrão</strong>
              <p>
                O fluxo padrão é iniciado automaticamente quando nenhuma
                palavra-chave de outro fluxo for encontrada.
              </p>

              {!fluxoPadrao && outroFluxoPadraoExiste && (
                <p className={styles.help}>
                  Já existe outro fluxo padrão nesta empresa. Só pode existir
                  1 fluxo padrão por empresa.
                </p>
              )}
            </div>
          </label>

          {fluxoPadrao ? (
            <div className={styles.defaultFlowNotice}>
              <div className={styles.defaultFlowIcon}>↪</div>
              <div className={styles.defaultFlowContent}>
                <div className={styles.defaultFlowTop}>
                  <strong>Fluxo padrão de fallback</strong>
                  <span className={styles.defaultFlowBadge}>Padrão</span>
                </div>
                <p>
                  Este fluxo é iniciado automaticamente quando nenhuma
                  palavra-chave de outro fluxo for encontrada.
                </p>
                <p>Por isso, ele não usa gatilhos próprios.</p>
              </div>
            </div>
          ) : (
            <div className={styles.gatilhosBox}>
              <div>
                <p className={styles.modalSectionTitle}>Gatilhos do fluxo</p>
                <p className={styles.help}>
                  Palavras que iniciam este fluxo quando o cliente envia uma
                  mensagem.
                </p>
              </div>

              {podeGerenciarGatilhos && (
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
                      <option value="contem">Contém a palavra</option>
                      <option value="exata">Igual exatamente</option>
                      <option value="inicia_com">Começa com</option>
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
              )}

              {gatilhos.length === 0 ? (
                <div className={styles.emptyMini}>
                  Nenhum gatilho cadastrado para este fluxo.
                </div>
              ) : (
                <div className={styles.gatilhosList}>
                  {gatilhos.map((gatilho) => (
                    <div key={gatilho.id} className={styles.gatilhoItem}>
                      <div>
                        <strong className={styles.gatilhoValor}>
                          {gatilho.valor}
                        </strong>
                        <p className={styles.gatilhoMeta}>
                          Condição: {gatilho.condicao} ·{" "}
                          {gatilho.ativo ? "Ativo" : "Inativo"}
                        </p>
                      </div>

                      {podeGerenciarGatilhos && (
                        <div className={styles.gatilhoActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => onAlternarGatilho(gatilho)}
                          >
                            {gatilho.ativo ? "Desativar" : "Ativar"}
                          </button>

                          <button
                            type="button"
                            className={styles.dangerSmallButton}
                            onClick={() => onRemoverGatilho(gatilho.id)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancelar}
          >
            Cancelar
          </button>

          {podeEditar && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onSalvar}
            >
              Salvar alterações
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
