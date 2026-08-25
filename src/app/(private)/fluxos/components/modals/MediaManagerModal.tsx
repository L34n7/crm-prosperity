"use client";

import type { MidiaOpcao } from "../../types";
import { LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES } from "../../constants";
import styles from "../../fluxos.module.css";

export type AbaMidias =
  | "todas"
  | "imagem"
  | "video"
  | "audio"
  | "arquivo";

type ResumoMidias = {
  total: number;
  imagens: number;
  videos: number;
  audios: number;
  arquivos: number;
  tamanhoTotal: number;
};

type MediaManagerModalProps = {
  midias: MidiaOpcao[];
  resumo: ResumoMidias;
  aba: AbaMidias;
  carregando: boolean;
  podeGerenciar: boolean;
  confirmandoExclusaoId: string | null;
  excluindoId: string | null;
  storageClassName: string;
  onAbaChange: (aba: AbaMidias) => void;
  onFechar: () => void;
  onPedirExclusao: (midiaId: string) => void;
  onConfirmarExclusao: (midia: MidiaOpcao) => void;
};

function formatarTamanhoArquivo(bytes?: number | null) {
  const valor = Number(bytes || 0);

  if (!Number.isFinite(valor) || valor <= 0) {
    return "Tamanho não informado";
  }

  if (valor < 1024) {
    return `${valor} B`;
  }

  if (valor < 1024 * 1024) {
    return `${(valor / 1024).toFixed(1)} KB`;
  }

  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function formatarStorageMidiasMb(bytes?: number | null) {
  const valor = Number(bytes || 0);

  if (!Number.isFinite(valor) || valor <= 0) {
    return "0";
  }

  return (valor / 1024 / 1024).toFixed(1);
}

function formatarDataMidia(data?: string | null) {
  if (!data) return "Data não informada";

  try {
    return new Date(data).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Data não informada";
  }
}

function labelTipoMidia(tipo: string) {
  if (tipo === "imagem") return "Imagem";
  if (tipo === "video") return "Vídeo";
  if (tipo === "audio") return "Áudio";
  if (tipo === "arquivo") return "Arquivo";
  return "Mídia";
}

function iconeTipoMidia(tipo: string) {
  if (tipo === "imagem") return "🖼️";
  if (tipo === "video") return "🎬";
  if (tipo === "audio") return "🎧";
  if (tipo === "arquivo") return "📄";
  return "📎";
}

export default function MediaManagerModal({
  midias,
  resumo,
  aba,
  carregando,
  podeGerenciar,
  confirmandoExclusaoId,
  excluindoId,
  storageClassName,
  onAbaChange,
  onFechar,
  onPedirExclusao,
  onConfirmarExclusao,
}: MediaManagerModalProps) {
  const midiasFiltradas =
    aba === "todas"
      ? midias
      : midias.filter((midia) => midia.tipo === aba);

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalCard} ${styles.mediaManagerModal}`}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Biblioteca de mídias</p>
            <h3 className={styles.modalTitle}>Gerenciar mídias</h3>
            <p className={styles.modalSubtitle}>
              Baixe, consulte ou exclua definitivamente mídias da empresa.
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

        <div className={styles.mediaSummaryGrid}>
          <div className={styles.mediaSummaryCard}>
            <span>Total</span>
            <strong>{resumo.total}</strong>
          </div>

          <div className={styles.mediaSummaryCard}>
            <span>Imagens</span>
            <strong>{resumo.imagens}</strong>
          </div>

          <div className={styles.mediaSummaryCard}>
            <span>Vídeos</span>
            <strong>{resumo.videos}</strong>
          </div>

          <div className={styles.mediaSummaryCard}>
            <span>Áudios</span>
            <strong>{resumo.audios}</strong>
          </div>

          <div className={styles.mediaSummaryCard}>
            <span>Arquivos</span>
            <strong>{resumo.arquivos}</strong>
          </div>

          <div
            className={`${styles.mediaSummaryCard} ${styles.mediaSummaryStorageCard} ${storageClassName}`}
          >
            <span>Storage</span>

            <div className={styles.mediaSummaryStorageValue}>
              <strong>{formatarStorageMidiasMb(resumo.tamanhoTotal)}</strong>
              <small>50 MB</small>
            </div>

            <div className={styles.mediaSummaryStorageTrack}>
              <div
                className={styles.mediaSummaryStorageBar}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (resumo.tamanhoTotal /
                        LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.mediaTabs}>
          <button
            type="button"
            className={aba === "todas" ? styles.mediaTabActive : styles.mediaTab}
            onClick={() => onAbaChange("todas")}
          >
            Todas ({resumo.total})
          </button>

          <button
            type="button"
            className={aba === "imagem" ? styles.mediaTabActive : styles.mediaTab}
            onClick={() => onAbaChange("imagem")}
          >
            Imagens ({resumo.imagens})
          </button>

          <button
            type="button"
            className={aba === "video" ? styles.mediaTabActive : styles.mediaTab}
            onClick={() => onAbaChange("video")}
          >
            Vídeos ({resumo.videos})
          </button>

          <button
            type="button"
            className={aba === "audio" ? styles.mediaTabActive : styles.mediaTab}
            onClick={() => onAbaChange("audio")}
          >
            Áudios ({resumo.audios})
          </button>

          <button
            type="button"
            className={
              aba === "arquivo" ? styles.mediaTabActive : styles.mediaTab
            }
            onClick={() => onAbaChange("arquivo")}
          >
            Arquivos ({resumo.arquivos})
          </button>
        </div>

        <div className={styles.mediaManagerList}>
          {carregando ? (
            <div className={styles.emptyMini}>Carregando mídias...</div>
          ) : midiasFiltradas.length === 0 ? (
            <div className={styles.emptyMini}>Nenhuma mídia encontrada.</div>
          ) : (
            midiasFiltradas.map((midia) => (
              <div key={midia.id} className={styles.mediaManagerItem}>
                <div className={styles.mediaManagerIcon}>
                  {iconeTipoMidia(midia.tipo)}
                </div>

                <div className={styles.mediaManagerInfo}>
                  <strong>{midia.nome}</strong>

                  <span>
                    {labelTipoMidia(midia.tipo)} ·{" "}
                    {formatarTamanhoArquivo(midia.tamanho_bytes)}
                  </span>

                  <small>
                    {midia.mime_type || "Tipo não informado"} ·{" "}
                    {formatarDataMidia(midia.created_at)}
                  </small>
                </div>

                <div className={styles.mediaManagerActions}>
                  <a
                    className={styles.smallButton}
                    href={midia.url}
                    download={midia.nome}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Baixar
                  </a>

                  {podeGerenciar &&
                    (confirmandoExclusaoId === midia.id ? (
                      <button
                        type="button"
                        className={styles.dangerSmallButton}
                        disabled={excluindoId === midia.id}
                        onClick={() => onConfirmarExclusao(midia)}
                      >
                        {excluindoId === midia.id
                          ? "Excluindo..."
                          : "Confirmar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.dangerSmallButton}
                        onClick={() => onPedirExclusao(midia.id)}
                      >
                        Excluir
                      </button>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>

        <p className={styles.help}>
          A exclusão é definitiva: remove o registro da tabela e o arquivo do
          Storage. Se algum bloco estiver usando essa mídia, ele ficará sem
          mídia selecionada e precisará ser ajustado antes de ativar/salvar o
          fluxo.
        </p>
      </div>
    </div>
  );
}
