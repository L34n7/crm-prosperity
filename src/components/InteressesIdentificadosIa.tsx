"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import type { InteresseIdentificadoIa } from "@/lib/agentes-ia/interesses-identificados";
import styles from "./InteressesIdentificadosIa.module.css";

type Props = {
  interesses: InteresseIdentificadoIa[];
  carregando?: boolean;
  compacto?: boolean;
  erro?: boolean;
};

function formatarData(valor: string | null) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

export default function InteressesIdentificadosIa({
  interesses,
  carregando = false,
  compacto = false,
  erro = false,
}: Props) {
  const [expandido, setExpandido] = useState(false);
  const itens = expandido ? interesses : interesses.slice(0, compacto ? 3 : 4);
  const faltantes = interesses.length - itens.length;

  return (
    <section className={`${styles.section} ${compacto ? styles.compacto : ""}`} aria-label="Interesses identificados pela IA">
      <div className={styles.header}>
        <span className={styles.icone}><Sparkles size={17} aria-hidden="true" /></span>
        <div className={styles.titulos}>
          <div className={styles.tituloLinha}>
            <strong>Interesses identificados pela IA</strong>
            {!carregando && interesses.length > 0 && <span className={styles.total}>{interesses.length}</span>}
          </div>
          <p>Preferências reconhecidas durante as conversas, separadas do campo Interesse manual.</p>
        </div>
      </div>

      {carregando ? (
        <p className={styles.vazio} role="status">Carregando interesses identificados...</p>
      ) : erro ? (
        <p className={styles.vazio} role="alert">Não foi possível carregar os interesses agora. Atualize os detalhes para tentar novamente.</p>
      ) : interesses.length === 0 ? (
        <p className={styles.vazio}>A IA ainda não identificou interesses para este contato.</p>
      ) : (
        <>
          <div className={styles.lista}>
            {itens.map((interesse) => {
              const data = formatarData(interesse.data_referencia);
              return (
                <article className={styles.item} key={interesse.id}>
                  <div className={styles.valor}>{interesse.texto}</div>
                  <div className={styles.rodape}>
                    <span className={styles.origem}>
                      {interesse.origem === "captura" ? "Registrado pela IA" : "Histórico da IA"}
                    </span>
                    {data && (
                      <span>
                        {interesse.tipo_data === "captura" ? "Capturado" : "Estado atualizado"} em {data}
                      </span>
                    )}
                    {interesse.conversa_id && (
                      <Link
                        href={`/conversas?id=${encodeURIComponent(interesse.conversa_id)}`}
                        className={styles.link}
                        title="Abrir conversa de origem"
                      >
                        <MessageCircle size={13} aria-hidden="true" />
                        Ver conversa
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {(faltantes > 0 || expandido) && (
            <button type="button" className={styles.verMais} onClick={() => setExpandido((valor) => !valor)}>
              {expandido ? "Mostrar menos" : `Ver todos os interesses (+${faltantes})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
