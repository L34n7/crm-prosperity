"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./conversas.module.css";
type Lista = { id: string; nome: string; exibir_atalho_conversas: boolean };
type Props = { listas: Lista[]; selecionada: string | null; onSelecionar: (id: string) => void };

export default function AtalhosListasPersonalizadas({ listas, selecionada, onSelecionar }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; scroll: number; ativo: boolean } | null>(null);
  const ignorarClique = useRef(false);
  const [setas, setSetas] = useState({ esquerda: false, direita: false });
  const visiveis = listas.filter(l => l.exibir_atalho_conversas);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const atualizar = () => setSetas({
      esquerda: elemento.scrollLeft > 3,
      direita: elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 3,
    });
    atualizar();
    const resize = new ResizeObserver(atualizar);
    resize.observe(elemento);
    elemento.addEventListener("scroll", atualizar, { passive: true });
    return () => { resize.disconnect(); elemento.removeEventListener("scroll", atualizar); };
  }, [listas]);

  if (!visiveis.length) return null;

  return <div className={styles.listaAtalhosWrap} aria-label="Atalhos de listas personalizadas">
    {setas.esquerda && <button type="button" className={`${styles.listaAtalhosSeta} ${styles.listaAtalhosSetaEsq}`}
      title="Rolar atalhos para a esquerda" aria-label="Rolar atalhos para a esquerda"
      onClick={() => ref.current?.scrollBy({ left: -180, behavior: "smooth" })}>‹</button>}
    <div ref={ref} className={styles.listaAtalhosScroll}
      onPointerDown={e => {
        if(e.pointerType !== "mouse" || e.button !== 0) return;
        drag.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft, ativo: false };
      }}
      onPointerMove={e => {
        const d=drag.current;
        if (!d) return;
        const dist = e.clientX-d.x;
        if (Math.abs(dist)>5) {
          d.ativo=true;
          ignorarClique.current=true;
          e.currentTarget.scrollLeft=d.scroll-dist;
        }
      }}
      onPointerUp={() => { drag.current=null; }}
      onPointerCancel={() => { drag.current=null; }}
      onPointerLeave={() => { drag.current=null; }}
      onClickCapture={e => {
        if (!ignorarClique.current) return;
        ignorarClique.current=false;
        e.preventDefault();
        e.stopPropagation();
      }}>
      {visiveis.map(lista => <button key={lista.id} type="button"
        className={`${styles.quickChip} ${styles.listaAtalhosChip} ${selecionada === lista.id ? styles.quickChipActive : ""}`}
        title={lista.nome} aria-pressed={selecionada===lista.id}
        onClick={() => onSelecionar(lista.id)}>{lista.nome}</button>)}
    </div>
    {setas.direita && <button type="button" className={`${styles.listaAtalhosSeta} ${styles.listaAtalhosSetaDir}`}
      title="Rolar atalhos para a direita" aria-label="Rolar atalhos para a direita"
      onClick={() => ref.current?.scrollBy({ left: 180, behavior: "smooth" })}>›</button>}
  </div>;
}
