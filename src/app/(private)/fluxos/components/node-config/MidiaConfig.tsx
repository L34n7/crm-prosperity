"use client";

import type { MidiaOpcao } from "../../types";
import {
  ACCEPT_ARQUIVOS,
  LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES,
} from "../../constants";
import styles from "../../fluxos.module.css";

type TipoMidia = "imagem" | "video" | "audio" | "arquivo";

type MidiaConfigProps = {
  tipoNode: string;
  midiaUrl: string;
  midiaNome: string;
  midias: MidiaOpcao[];
  carregando: boolean;
  enviando: boolean;
  podeGerenciar: boolean;
  limiteStorageAtingido: boolean;
  storageUsadoBytes: number;
  storageClassName: string;
  onSelecionar: (url: string, nome: string) => void;
  onRemover: () => void;
  onArquivoSelecionado: (arquivo: File) => void;
  onAbrirGerenciador: (tipo: TipoMidia) => void;
};

function tipoMidiaDoNode(tipoNode: string): TipoMidia {
  if (tipoNode === "enviar_imagem") return "imagem";
  if (tipoNode === "enviar_video") return "video";
  if (tipoNode === "enviar_audio") return "audio";
  return "arquivo";
}

function tituloTipo(tipo: TipoMidia) {
  if (tipo === "imagem") return "Imagem";
  if (tipo === "video") return "Vídeo";
  if (tipo === "audio") return "Áudio";
  return "Arquivo";
}

function iconeTipo(tipo: TipoMidia) {
  if (tipo === "imagem") return "🖼️";
  if (tipo === "video") return "🎬";
  if (tipo === "audio") return "🎧";
  return "📄";
}

function acceptTipo(tipo: TipoMidia) {
  if (tipo === "imagem") {
    return "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
  }
  if (tipo === "video") return "video/mp4,.mp4";
  if (tipo === "audio") return "audio/*";
  return ACCEPT_ARQUIVOS;
}

function ajudaTipo(tipo: TipoMidia) {
  if (tipo === "imagem") {
    return "São aceitas imagens de até 5MB nos formatos JPG, JPEG, PNG ou WEBP.";
  }
  if (tipo === "video") {
    return "São aceitos vídeos de até 16MB no formato MP4, com vídeo H.264/AVC e áudio AAC. Arquivos incompatíveis serão recusados.";
  }
  if (tipo === "audio") {
    return "São aceitos arquivos de áudio de até 16MB.";
  }
  return "São aceitos PDF, TXT, CSV, Word, Excel e PowerPoint, respeitando o espaço disponível da cota de 50MB.";
}

function formatarStorageMb(bytes: number) {
  const valor = Number(bytes || 0);
  if (!Number.isFinite(valor) || valor <= 0) return "0";
  return (valor / 1024 / 1024).toFixed(1);
}

export default function MidiaConfig({
  tipoNode,
  midiaUrl,
  midiaNome,
  midias,
  carregando,
  enviando,
  podeGerenciar,
  limiteStorageAtingido,
  storageUsadoBytes,
  storageClassName,
  onSelecionar,
  onRemover,
  onArquivoSelecionado,
  onAbrirGerenciador,
}: MidiaConfigProps) {
  const tipo = tipoMidiaDoNode(tipoNode);
  const titulo = tituloTipo(tipo);
  const midiasCompativeis = midias.filter((midia) => midia.tipo === tipo);

  return (
    <div className={styles.field}>
      <span className={styles.label}>{titulo}</span>

      {midiaUrl ? (
        <div className={styles.midiaSelecionadaBox}>
          <div className={styles.midiaSelecionadaInfo}>
            <div className={styles.midiaSelecionadaIcone}>{iconeTipo(tipo)}</div>
            <div>
              <strong className={styles.midiaSelecionadaTitulo}>
                {titulo} selecionad{tipo === "imagem" ? "a" : tipo === "arquivo" ? "o" : "o"}
              </strong>
              <p className={styles.midiaSelecionadaNome}>
                {midiaNome || "Mídia selecionada"}
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.dangerSmallButton}
            onClick={onRemover}
          >
            Remover
          </button>
        </div>
      ) : (
        <div
          className={`${styles.optionsBox} ${
            tipo === "imagem"
              ? styles.mediaOptionsBoxImagem
              : tipo === "video"
              ? styles.mediaOptionsBoxVideo
              : tipo === "audio"
              ? styles.mediaOptionsBoxAudio
              : styles.mediaOptionsBoxArquivo
          }`}
        >
          <select
            className={styles.input}
            value={midiaUrl}
            onChange={(e) => {
              const url = e.target.value;
              const selecionada = midias.find((midia) => midia.url === url);
              onSelecionar(url, selecionada?.nome || "");
            }}
            disabled={carregando || enviando}
          >
            <option value="">
              {carregando ? "Carregando mídias..." : "Selecione uma mídia"}
            </option>
            {midiasCompativeis.map((midia) => (
              <option key={midia.id} value={midia.url}>
                {midia.nome}
              </option>
            ))}
          </select>

          {podeGerenciar && (
            <label
              className={`${styles.secondaryButton} ${
                limiteStorageAtingido ? styles.disabledButton : ""
              }`}
            >
              {enviando ? "Enviando..." : "Subir nova mídia"}
              <input
                type="file"
                accept={acceptTipo(tipo)}
                style={{ display: "none" }}
                disabled={enviando || limiteStorageAtingido}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) onArquivoSelecionado(arquivo);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          <span className={styles.help}>{ajudaTipo(tipo)}</span>

          <div className={styles.mediaLimitPremiumRow}>
            <button
              type="button"
              className={styles.mediaManagePremiumCard}
              onClick={() => onAbrirGerenciador(tipo)}
            >
              <span className={styles.mediaManagePremiumIcon}>{iconeTipo(tipo)}</span>
              <span className={styles.mediaManagePremiumContent}>
                <strong>Gerenciar mídias</strong>
                <small>Abrir biblioteca</small>
              </span>
            </button>

            <div className={`${styles.mediaLimitPremiumCard} ${storageClassName}`}>
              <div className={styles.mediaLimitPremiumNumbers}>
                <strong>{formatarStorageMb(storageUsadoBytes)} /</strong>
                <span>{Math.round(LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES / 1024 / 1024)} MB</span>
              </div>
              <small>Limite usado</small>
            </div>
          </div>

          {limiteStorageAtingido && (
            <span className={styles.help}>
              Limite de 50 MB atingido. Exclua uma mídia no gerenciador antes de subir outra.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
