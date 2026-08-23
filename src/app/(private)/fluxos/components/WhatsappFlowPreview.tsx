"use client";

import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import styles from "../fluxos.module.css";
import type { PreviaWhatsappFluxo } from "../whatsapp-preview";

type WhatsappFlowPreviewProps = {
  fluxoNome: string;
  previa: PreviaWhatsappFluxo;
  recolhida: boolean;
  onRecolher: () => void;
  onExpandir: () => void;
  onSelecionarResposta: (sourceNodeId: string, edgeId: string) => void;
};

export default function WhatsappFlowPreview({
  fluxoNome,
  previa,
  recolhida,
  onRecolher,
  onExpandir,
  onSelecionarResposta,
}: WhatsappFlowPreviewProps) {
  if (recolhida) {
    return (
      <button
        type="button"
        className={styles.whatsappFlowPreviewCollapsed}
        onClick={onExpandir}
        title="Expandir previa"
        aria-label="Expandir previa do WhatsApp"
        aria-expanded="false"
      >
        <MessageCircle size={16} />
        <span>Previa</span>
        <ChevronLeft size={16} />
      </button>
    );
  }

  return (
    <aside className={styles.whatsappFlowPreviewPanel}>
      <div className={styles.whatsappFlowPhone}>
        <div className={styles.whatsappFlowPhoneHeader}>
          <div className={styles.whatsappFlowAvatar}>
            <MessageCircle size={16} />
          </div>

          <div className={styles.whatsappFlowPhoneContact}>
            <strong>{fluxoNome}</strong>
            <span>online</span>
          </div>

          <button
            type="button"
            className={styles.whatsappFlowPhoneToggle}
            onClick={onRecolher}
            title="Recolher previa"
            aria-label="Recolher previa do WhatsApp"
            aria-expanded="true"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className={styles.whatsappFlowChat}>
          {previa.mensagens.length === 0 ? (
            <div className={styles.whatsappFlowEmpty}>
              Nenhuma mensagem visivel neste fluxo.
            </div>
          ) : (
            previa.mensagens.map((mensagem) =>
              mensagem.tipo === "divisoria" ? (
                <div key={mensagem.id} className={styles.whatsappFlowDivider}>
                  <span>{mensagem.texto}</span>
                </div>
              ) : mensagem.tipo === "seletor" ? (
                <div
                  key={mensagem.id}
                  className={styles.whatsappFlowJourneySelector}
                >
                  <span>{mensagem.texto}</span>

                  <div className={styles.whatsappFlowJourneyOptions}>
                    {(mensagem.opcoesJornada || []).map((opcao) => (
                      <button
                        key={opcao.edgeId}
                        type="button"
                        className={
                          opcao.selecionada
                            ? styles.whatsappFlowJourneyOptionActive
                            : styles.whatsappFlowJourneyOption
                        }
                        onClick={() => {
                          if (!mensagem.sourceNodeId) return;
                          onSelecionarResposta(
                            mensagem.sourceNodeId,
                            opcao.edgeId
                          );
                        }}
                      >
                        {opcao.texto}
                      </button>
                    ))}
                  </div>
                </div>
              ) : mensagem.tipo === "sistema" ? (
                <div key={mensagem.id} className={styles.whatsappFlowSystem}>
                  {mensagem.texto}
                </div>
              ) : (
                <div
                  key={mensagem.id}
                  className={`${styles.whatsappFlowBubbleRow} ${
                    mensagem.tipo === "contato"
                      ? styles.whatsappFlowBubbleRowContact
                      : ""
                  }`}
                >
                  <div
                    className={`${styles.whatsappFlowBubble} ${
                      mensagem.tipo === "contato"
                        ? styles.whatsappFlowBubbleContact
                        : styles.whatsappFlowBubbleBot
                    }`}
                  >
                    {mensagem.delayLabel && (
                      <span className={styles.whatsappFlowDelay}>
                        {mensagem.delayLabel}
                      </span>
                    )}

                    {mensagem.midiaTipo && (
                      <div className={styles.whatsappFlowMedia}>
                        <span>{mensagem.midiaTipo}</span>
                        {mensagem.titulo && <strong>{mensagem.titulo}</strong>}
                      </div>
                    )}

                    {mensagem.titulo && !mensagem.midiaTipo && (
                      <strong className={styles.whatsappFlowBubbleTitle}>
                        {mensagem.titulo}
                      </strong>
                    )}

                    <p>{mensagem.texto}</p>

                    {mensagem.rodape && (
                      <span className={styles.whatsappFlowFooter}>
                        {mensagem.rodape}
                      </span>
                    )}

                    {mensagem.botoes && mensagem.botoes.length > 0 && (
                      <div className={styles.whatsappFlowButtons}>
                        {mensagem.botoes.map((botao, index) => (
                          <span key={`${mensagem.id}-${botao}-${index}`}>
                            {botao}
                          </span>
                        ))}
                      </div>
                    )}

                    <span className={styles.whatsappFlowTime}>09:41</span>
                  </div>
                </div>
              )
            )
          )}

          {previa.truncado && (
            <div className={styles.whatsappFlowSystem}>
              Previa interrompida pelo limite de tamanho desta jornada.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
