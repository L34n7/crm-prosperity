"use client";

import { useState } from "react";
import type { Fluxo } from "../types";
import { TIPO_NO_PERGUNTA_LIVRE_IA } from "../constants";
import { TIPO_NO_CONSULTAR_ESTOQUE } from "../consultar-estoque-editor";
import { TIPO_NO_CHECKOUT_PAGAMENTO } from "../checkout-pagamento-editor";
import IntencoesModal from "./modals/IntencoesModal";
import styles from "../fluxos.module.css";

type FluxoEditorHeaderProps = {
  fluxoSelecionado: Fluxo | null;
  fluxoSistema: boolean;
  salvando: boolean;
  ultimoSalvamentoTexto: string;
  podeCriarFluxos: boolean;
  podeEditarFluxos: boolean;
  podeAtivarFluxos: boolean;
  podeArquivarFluxos: boolean;
  podeExcluirFluxos: boolean;
  onAbrirAssistente: () => void;
  onAdicionarNo: (tipoNo: string) => void;
  onEditarFluxo: () => void;
  onSalvarEstrutura: () => void;
  onAlterarStatus: (fluxo: Fluxo, status: "ativo" | "pausado") => void;
  onRestaurarFluxo: (fluxo: Fluxo) => void;
  onApagarDefinitivo: (fluxo: Fluxo) => void;
  onDuplicarFluxo: (fluxo: Fluxo) => void;
  onCompartilharFluxo: (fluxo: Fluxo) => void;
  onArquivarFluxo: (fluxo: Fluxo) => void;
};

export default function FluxoEditorHeader({
  fluxoSelecionado,
  fluxoSistema,
  salvando,
  ultimoSalvamentoTexto,
  podeCriarFluxos,
  podeEditarFluxos,
  podeAtivarFluxos,
  podeArquivarFluxos,
  podeExcluirFluxos,
  onAbrirAssistente,
  onAdicionarNo,
  onEditarFluxo,
  onSalvarEstrutura,
  onAlterarStatus,
  onRestaurarFluxo,
  onApagarDefinitivo,
  onDuplicarFluxo,
  onCompartilharFluxo,
  onArquivarFluxo,
}: FluxoEditorHeaderProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [intencoesAberto, setIntencoesAberto] = useState(false);

  function adicionarNo(tipoNo: string) {
    setMenuAberto(false);
    onAdicionarNo(tipoNo);
  }

  return (
    <>
    <header className={styles.editorHeader}>
      <div>
        <p className={styles.eyebrow}>Construtor visual</p>
        <h2 className={styles.editorTitle}>
          {fluxoSelecionado?.nome || "Selecione um fluxo"}
        </h2>

        {fluxoSistema && (
          <span
            className={`${styles.badge} ${styles.systemFlowBadge}`}
            data-system-flow-badge="CRM_SYSTEM_FLOW_STRONG_BADGE_V1"
          >
            FLUXO DO SISTEMA
          </span>
        )}

        <p className={styles.editorSubtitle}>
          Adicione blocos, arraste no painel e conecte um bloco no outro.
        </p>
      </div>

      <div className={styles.headerActions}>
        <div className={styles.headerActionsButtons}>
          {fluxoSelecionado?.status === "arquivado" ? (
            <>
              {podeAtivarFluxos && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => onRestaurarFluxo(fluxoSelecionado)}
                >
                  Restaurar
                </button>
              )}

              {podeExcluirFluxos && (
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => onApagarDefinitivo(fluxoSelecionado)}
                >
                  Apagar definitivo
                </button>
              )}
            </>
          ) : (
            <>
              {podeCriarFluxos && (
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.aiHeaderButton}`}
                  onClick={onAbrirAssistente}
                >
                  ✨ Assistente IA
                </button>
              )}

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIntencoesAberto(true)}
                disabled={!fluxoSelecionado}
              >
                Intenções
              </button>

              {podeEditarFluxos && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => onAdicionarNo("enviar_texto")}
                  disabled={!fluxoSelecionado}
                >
                  + Bloco
                </button>
              )}

              {podeEditarFluxos && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={onEditarFluxo}
                  disabled={!fluxoSelecionado}
                >
                  Editar fluxo
                </button>
              )}

              {podeEditarFluxos && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={onSalvarEstrutura}
                  disabled={!fluxoSelecionado || salvando}
                >
                  {salvando ? "Salvando..." : "Salvar fluxo"}
                </button>
              )}

              {podeAtivarFluxos &&
                fluxoSelecionado &&
                fluxoSelecionado.status !== "ativo" && (
                  <button
                    type="button"
                    className={styles.primaryButtonActv}
                    onClick={() => onAlterarStatus(fluxoSelecionado, "ativo")}
                  >
                    Ativar fluxo
                  </button>
                )}

              {podeEditarFluxos && (
                <div className={styles.headerMenuWrapper}>
                  <button
                    type="button"
                    className={styles.headerMenuButton}
                    disabled={!fluxoSelecionado}
                    onClick={() => setMenuAberto((atual) => !atual)}
                  >
                    ⋮
                  </button>

                  {menuAberto && fluxoSelecionado && (
                    <div className={styles.headerDropdownMenu}>
                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("enviar_texto")}
                      >
                        + Mensagem
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("pergunta_opcoes")}
                      >
                        + Pergunta
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo(TIPO_NO_PERGUNTA_LIVRE_IA)}
                      >
                        + Pergunta IA
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("capturar_resposta")}
                      >
                        + Capturar resposta
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo(TIPO_NO_CONSULTAR_ESTOQUE)}
                      >
                        + Consultar estoque
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo(TIPO_NO_CHECKOUT_PAGAMENTO)}
                      >
                        + Checkout / pagamento
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("transferir_setor")}
                      >
                        + Transferência
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("encerrar")}
                      >
                        + Encerramento
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("enviar_imagem")}
                      >
                        + Imagem
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("enviar_video")}
                      >
                        + Vídeo
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("enviar_audio")}
                      >
                        + Áudio
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("enviar_arquivo")}
                      >
                        + Arquivo
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("enviar_botoes")}
                      >
                        + Pergunta com botões
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("botao_redirect")}
                      >
                        + Botão redirect
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("agendar_disparo")}
                      >
                        + Agendar disparo
                      </button>

                      <div className={styles.headerSubmenuWrapper}>
                        <button
                          type="button"
                          className={`${styles.headerDropdownItem} ${styles.headerSubmenuTrigger}`}
                        >
                          <span>+ Agendar Dia/hora</span>
                          <span className={styles.headerSubmenuArrow}>‹</span>
                        </button>

                        <div className={styles.headerSubmenuLeft}>
                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => adicionarNo("agenda_buscar_agendamento")}
                          >
                            + Buscar agendamento
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => adicionarNo("agenda_escolher_horario")}
                          >
                            + Escolher horário
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => adicionarNo("agenda_criar_agendamento")}
                          >
                            + Criar agendamento
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => adicionarNo("agenda_remarcar_agendamento")}
                          >
                            + Remarcar agendamento
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => adicionarNo("agenda_cancelar_agendamento")}
                          >
                            + Cancelar agendamento
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("avaliacao")}
                      >
                        + Avaliação
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => adicionarNo("interpretar_arquivo_ia")}
                      >
                        + Interpretar arquivo IA
                      </button>

                      <div className={styles.headerDropdownDivider} />

                      {podeCriarFluxos && (
                        <button
                          type="button"
                          className={styles.headerDropdownItem}
                          onClick={() => {
                            setMenuAberto(false);
                            onDuplicarFluxo(fluxoSelecionado);
                          }}
                        >
                          Clonar fluxo
                        </button>
                      )}

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuAberto(false);
                          onCompartilharFluxo(fluxoSelecionado);
                        }}
                      >
                        Compartilhar fluxo
                      </button>

                      {podeAtivarFluxos && (
                        <button
                          type="button"
                          className={styles.headerDropdownItem}
                          disabled={fluxoSistema}
                          title={
                            fluxoSistema
                              ? "Fluxos fixos do sistema não podem ser pausados."
                              : undefined
                          }
                          onClick={() => {
                            setMenuAberto(false);
                            onAlterarStatus(
                              fluxoSelecionado,
                              fluxoSelecionado.status === "ativo"
                                ? "pausado"
                                : "ativo"
                            );
                          }}
                        >
                          {fluxoSelecionado.status === "ativo"
                            ? "Pausar fluxo"
                            : "Ativar fluxo"}
                        </button>
                      )}

                      {podeArquivarFluxos && (
                        <button
                          type="button"
                          className={`${styles.headerDropdownItem} ${styles.headerDropdownDanger}`}
                          disabled={fluxoSistema}
                          title={
                            fluxoSistema
                              ? "Fluxos fixos do sistema não podem ser arquivados."
                              : undefined
                          }
                          onClick={() => {
                            setMenuAberto(false);
                            onArquivarFluxo(fluxoSelecionado);
                          }}
                        >
                          Apagar fluxo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <span className={styles.lastSaveText}>
          {salvando ? "Salvando..." : ultimoSalvamentoTexto}
        </span>
      </div>
    </header>

    {intencoesAberto && fluxoSelecionado && (
      <IntencoesModal
        fluxo={fluxoSelecionado}
        podeEditar={podeEditarFluxos}
        onFechar={() => setIntencoesAberto(false)}
      />
    )}
    </>
  );
}
