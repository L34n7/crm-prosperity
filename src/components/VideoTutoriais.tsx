"use client";

import { useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import { type VideoTutorial } from "@/lib/central-de-conhecimento/videos";
import styles from "./VideoTutoriais.module.css";

type Props = {
  videos: readonly VideoTutorial[];
  tituloPendente?: string;
  compacto?: boolean;
};

export default function VideoTutoriais({
  videos,
  tituloPendente = "Novo tutorial",
  compacto = false,
}: Props) {
  const [selecionadoId, setSelecionadoId] = useState(videos[0]?.id || "");
  const selecionado = videos.find((video) => video.id === selecionadoId) ?? videos[0];

  if (!selecionado) {
    return (
      <div className={`${styles.semVideos} ${compacto ? styles.compacto : ""}`}>
        <PlayCircle size={30} strokeWidth={1.5} aria-hidden="true" />
        <strong>{tituloPendente}</strong>
        <span>Vídeo demonstrativo em preparação.</span>
      </div>
    );
  }

  return (
    <div className={`${styles.bloco} ${compacto ? styles.compacto : ""}`}>
      {videos.length > 1 && (
        <div className={styles.seletor} role="group" aria-label="Escolher vídeo tutorial">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => setSelecionadoId(video.id)}
              aria-pressed={selecionado.id === video.id}
              className={`${styles.opcao} ${selecionado.id === video.id ? styles.opcaoAtiva : ""}`}
            >
              <PlayCircle size={16} aria-hidden="true" />
              <span>{video.titulo}</span>
              <small>{video.assunto}</small>
            </button>
          ))}
        </div>
      )}

      <div className={styles.informacoes}>
        <span className={styles.assunto}>{selecionado.assunto}</span>
        <strong>{selecionado.titulo}</strong>
        {selecionado.descricao && <p>{selecionado.descricao}</p>}
      </div>

      <div className={styles.player}>
        <iframe
          key={selecionado.id}
          title={`Vídeo tutorial: ${selecionado.titulo}`}
          src={`https://www.youtube-nocookie.com/embed/${selecionado.id}?rel=0`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      <a
        className={styles.abrirYouTube}
        href={`https://www.youtube.com/watch?v=${selecionado.id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Assistir no YouTube <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}
