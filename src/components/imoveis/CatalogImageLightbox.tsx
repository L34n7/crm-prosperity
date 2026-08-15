"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import styles from "@/app/(private)/imoveis/imoveis.module.css";
import lightboxStyles from "./CatalogImageLightbox.module.css";

type Props = {
  catalogoId: string;
  fotos: string[];
  fotoAtiva: number;
  titulo: string;
  onFotoAtivaChange: (indice: number) => void;
  onClose: () => void;
};

export default function CatalogImageLightbox({
  catalogoId,
  fotos,
  fotoAtiva,
  titulo,
  onFotoAtivaChange,
  onClose,
}: Props) {
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const foto = fotos[fotoAtiva];
  const umaFileira = fotos.length <= 12;
  const linhasThumb = umaFileira ? 1 : 2;
  const colunasThumb = umaFileira ? fotos.length : Math.ceil(fotos.length / 2);
  const colunasLaterais = Math.max(1, Math.ceil(fotos.length / 12));

  const desktopMenuWidth =
    colunasLaterais * 86 + Math.max(0, colunasLaterais - 1) * 6;
  const desktopArrowLeft = 18 + desktopMenuWidth + 20 + 28;
  const desktopStagePaddingLeft = desktopArrowLeft + 52 + 20;
  const desktopStageCenterOffset = (desktopStagePaddingLeft - 78) / 2;

  const tabletMenuWidth =
    colunasLaterais * 78 + Math.max(0, colunasLaterais - 1) * 6;
  const tabletArrowLeft = 12 + tabletMenuWidth + 18 + 24;
  const tabletStagePaddingLeft = tabletArrowLeft + 52 + 16;
  const tabletStageCenterOffset = (tabletStagePaddingLeft - 58) / 2;

  const lightboxStyle = {
    "--thumb-columns": colunasThumb,
    "--thumb-rows": linhasThumb,
    "--desktop-thumb-menu-width": `${desktopMenuWidth}px`,
    "--desktop-arrow-left": `${desktopArrowLeft}px`,
    "--desktop-stage-padding-left": `${desktopStagePaddingLeft}px`,
    "--desktop-stage-center-offset": `${desktopStageCenterOffset}px`,
    "--tablet-thumb-menu-width": `${tabletMenuWidth}px`,
    "--tablet-arrow-left": `${tabletArrowLeft}px`,
    "--tablet-stage-padding-left": `${tabletStagePaddingLeft}px`,
    "--tablet-stage-center-offset": `${tabletStageCenterOffset}px`,
  } as CSSProperties;

  useEffect(() => {
    thumbRefs.current[fotoAtiva]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [fotoAtiva]);

  if (!foto) return null;

  const downloadHref = `/api/imoveis/catalogo/imagem?imovel=${encodeURIComponent(
    catalogoId,
  )}&indice=${fotoAtiva}`;

  return (
    <div
      className={`${styles.catalogLightbox} ${lightboxStyles.lightboxWithThumbs} ${
        umaFileira ? lightboxStyles.lightboxSingleThumbRow : ""
      }`}
      style={lightboxStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Galeria de fotos do imóvel"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <a
        className={lightboxStyles.downloadButton}
        href={downloadHref}
        aria-label={`Baixar foto ${fotoAtiva + 1}`}
        title="Baixar imagem"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Download size={22} />
      </a>

      <button
        className={styles.catalogLightboxClose}
        type="button"
        onClick={onClose}
        aria-label="Fechar galeria"
        autoFocus
      >
        <X size={24} />
      </button>

      {fotos.length > 1 ? (
        <nav
          className={lightboxStyles.thumbMenu}
          aria-label="Miniaturas das fotos do imóvel"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={lightboxStyles.thumbGrid}>
            {fotos.map((thumb, indice) => (
              <button
                key={`${thumb}-${indice}`}
                ref={(element) => {
                  thumbRefs.current[indice] = element;
                }}
                className={
                  indice === fotoAtiva ? lightboxStyles.thumbActive : undefined
                }
                type="button"
                onClick={() => onFotoAtivaChange(indice)}
                aria-label={`Exibir foto ${indice + 1}`}
                aria-current={indice === fotoAtiva ? "true" : undefined}
              >
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <span>{indice + 1}</span>
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <div
        className={`${styles.catalogLightboxStage} ${lightboxStyles.stage}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <img
          src={foto}
          alt={`${titulo} — foto ${fotoAtiva + 1}`}
          referrerPolicy="no-referrer"
        />
      </div>

      {fotos.length > 1 ? (
        <>
          <button
            className={`${styles.catalogLightboxArrow} ${styles.catalogLightboxArrowLeft}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFotoAtivaChange(
                fotoAtiva === 0 ? fotos.length - 1 : fotoAtiva - 1,
              );
            }}
            aria-label="Foto anterior"
          >
            <ChevronLeft size={30} />
          </button>
          <button
            className={`${styles.catalogLightboxArrow} ${styles.catalogLightboxArrowRight}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFotoAtivaChange((fotoAtiva + 1) % fotos.length);
            }}
            aria-label="Próxima foto"
          >
            <ChevronRight size={30} />
          </button>
        </>
      ) : null}

      <span
        className={`${styles.catalogLightboxCounter} ${lightboxStyles.counter}`}
      >
        {fotoAtiva + 1} / {fotos.length}
      </span>
    </div>
  );
}
