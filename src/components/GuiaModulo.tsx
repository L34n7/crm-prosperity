"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronRight, FileCheck2, PlayCircle, X,
} from "lucide-react";
import type { GuiaModuloConfig } from "@/lib/central-de-conhecimento/guias";
import styles from "./GuiaDisparos.module.css";

type Props = {
  guia: GuiaModuloConfig;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  etapaAtual?: number | null;
};

export default function GuiaModulo({
  guia, aberto, onAbertoChange, etapaAtual = null,
}: Props) {
  const [etapaExpandida, setEtapaExpandida] = useState(1);
  const botaoFecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (aberto && etapaAtual && etapaAtual >= 1 && etapaAtual <= guia.etapas.length) {
      setEtapaExpandida(etapaAtual);
    }
  }, [aberto, etapaAtual, guia.etapas.length]);

  useEffect(() => {
    if (!aberto) return;
    botaoFecharRef.current?.focus();
    const fecharAoEscapar = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onAbertoChange(false);
      }
    };
    document.addEventListener("keydown", fecharAoEscapar, true);
    return () => document.removeEventListener("keydown", fecharAoEscapar, true);
  }, [aberto, onAbertoChange]);

  const linkAssunto = (ancora: string) => `${guia.documentoUrl}#${ancora}`;

  return (
    <>
      {!aberto && (
        <button
          type="button"
          className={styles.abaFechada}
          aria-label={`Abrir ajuda de ${guia.titulo}`}
          aria-expanded={false}
          aria-controls={`guia-${guia.id}`}
          onClick={() => onAbertoChange(true)}
        >
          <span>Ajuda</span>
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
      )}

      <aside
        id={`guia-${guia.id}`}
        className={`${styles.drawer} ${aberto ? styles.drawerAberto : ""}`}
        aria-label={`Ajuda de ${guia.titulo}`}
        aria-hidden={!aberto}
        inert={!aberto}
      >
        <button
          type="button"
          className={styles.abaRecolher}
          aria-label="Recolher ajuda"
          onClick={() => onAbertoChange(false)}
          tabIndex={aberto ? 0 : -1}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <div className={styles.scroll}>
          <header className={styles.cabecalho}>
            <div>
              <span className={styles.sobretitulo}>Orientações</span>
              <h2>{guia.titulo}</h2>
            </div>
            <button
              ref={botaoFecharRef}
              type="button"
              className={styles.fechar}
              aria-label="Fechar ajuda"
              onClick={() => onAbertoChange(false)}
              tabIndex={aberto ? 0 : -1}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </header>

          <p className={styles.introducao}>{guia.introducao}</p>

          {guia.preRequisitos && guia.preRequisitos.length > 0 && (
            <section
              className={styles.preRequisitos}
              aria-labelledby={`requisitos-${guia.id}`}
            >
              <h3 id={`requisitos-${guia.id}`}>{guia.tituloPreRequisitos || "Antes de começar"}</h3>
              {guia.preRequisitos.map((requisito) => (
                <div className={styles.preRequisito} key={requisito.titulo}>
                  <FileCheck2 size={19} aria-hidden="true" />
                  <div>
                    <strong>{requisito.titulo}</strong>
                    <p>{requisito.descricao}</p>
                    {requisito.ancora && (
                      <Link href={linkAssunto(requisito.ancora)} onClick={() => onAbertoChange(false)}>
                        Saiba mais
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          <div className={styles.etapas} aria-label="Tópicos do guia">
            {guia.etapas.map((etapa, indice) => {
              const numero = indice + 1;
              const expandida = etapaExpandida === numero;
              return (
                <section key={etapa.titulo} className={styles.etapa}>
                  <button
                    type="button"
                    className={`${styles.etapaBotao} ${expandida ? styles.etapaBotaoAtivo : ""}`}
                    aria-expanded={expandida}
                    aria-controls={`guia-${guia.id}-etapa-${numero}`}
                    onClick={() => setEtapaExpandida(expandida ? 0 : numero)}
                  >
                    <span className={styles.numero}>{numero}</span>
                    <span className={styles.etapaNome}>{etapa.titulo}</span>
                    <ChevronDown size={17} className={expandida ? styles.girar : ""} aria-hidden="true" />
                  </button>
                  {expandida && (
                    <ol id={`guia-${guia.id}-etapa-${numero}`} className={styles.passos}>
                      {etapa.passos.map((passo, passoIndice) => (
                        <li key={passo.titulo}>
                          <strong>{passoIndice + 1}. {passo.titulo}</strong>
                          <p>{passo.descricao}</p>
                          {passo.ancora && (
                            <Link href={linkAssunto(passo.ancora)} onClick={() => onAbertoChange(false)}>
                              Saiba mais
                            </Link>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>

          {guia.resumo && (
            <section className={styles.resultados}>
              <strong>{guia.resumo.titulo}</strong>
              <p>{guia.resumo.descricao}</p>
              {guia.resumo.ancora && (
                <Link href={linkAssunto(guia.resumo.ancora)} onClick={() => onAbertoChange(false)}>
                  Saiba mais
                </Link>
              )}
            </section>
          )}

          <section className={styles.video}>
            <div className={styles.videoTitulo}>
              <PlayCircle size={19} aria-hidden="true" /><h3>Vídeo tutorial</h3>
            </div>
            <div className={styles.videoPlaceholder}>
              <PlayCircle size={30} strokeWidth={1.5} aria-hidden="true" />
              <strong>{guia.videoTitulo}</strong>
              <span>Vídeo demonstrativo em preparação.</span>
            </div>
          </section>

          <Link
            href={guia.documentoUrl}
            className={styles.linkPrincipal}
            onClick={() => onAbertoChange(false)}
          >
            <BookOpen size={18} aria-hidden="true" />
            Ver documentação completa
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </aside>
    </>
  );
}
