"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileCheck2,
  PlayCircle,
  X,
} from "lucide-react";
import styles from "./GuiaDisparos.module.css";
import VideoTutoriais from "@/components/VideoTutoriais";
import { obterVideosDoModulo } from "@/lib/central-de-conhecimento/videos";

type Passo = { titulo: string; descricao: string; ancora?: string };

const etapas: { titulo: string; passos: Passo[] }[] = [
  {
    titulo: "Mensagem e variáveis",
    passos: [
      { titulo: "Integração WhatsApp", descricao: "Se houver mais de um número conectado, escolha qual enviará as mensagens.", ancora: "integracao" },
      { titulo: "Template aprovado", descricao: "Selecione a mensagem aprovada pela Meta que deseja utilizar.", ancora: "template-aprovado" },
      { titulo: "Nome do disparo", descricao: "Identifique a campanha no histórico. O preenchimento é opcional." },
      { titulo: "Variáveis", descricao: "Escolha os dados que vão preencher os campos da mensagem, como o nome do contato.", ancora: "variaveis" },
    ],
  },
  {
    titulo: "Capacidade e agendamento",
    passos: [
      { titulo: "Capacidade de envio", descricao: "Confira quantos contatos o número pode alcançar e as próximas liberações.", ancora: "capacidade" },
      { titulo: "Quantidade desejada", descricao: "Informe quantas pessoas pretende alcançar." },
      { titulo: "Quando enviar", descricao: "Envie agora ou escolha data e hora futuras, conforme a capacidade prevista.", ancora: "agendamento" },
    ],
  },
  {
    titulo: "Contatos",
    passos: [
      { titulo: "Filtrar contatos", descricao: "Encontre os destinatários por origem, campanha, interesse e outros filtros.", ancora: "filtros" },
      { titulo: "Selecionar destinatários", descricao: "Adicione os contatos à campanha e confira possíveis restrições.", ancora: "selecionar" },
      { titulo: "Contatos reserva (opcional)", descricao: "Selecione contatos extras para compensar falhas definitivas, sem ampliar a meta de envio.", ancora: "contatos-reserva" },
    ],
  },
  {
    titulo: "Revisão e confirmação",
    passos: [
      { titulo: "Revisar campanha", descricao: "Confira mensagem, destinatários, quantidade e horário." },
      { titulo: "Custo estimado", descricao: "Veja a estimativa de cobrança da Meta antes de confirmar.", ancora: "cobranca" },
      { titulo: "Confirmar envio", descricao: "Confirme a ciência da cobrança para enfileirar ou agendar a campanha.", ancora: "confirmacao" },
    ],
  },
];

type GuiaDisparosProps = {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  etapaAtual: number | null;
};

export default function GuiaDisparos({ aberto, onAbertoChange, etapaAtual }: GuiaDisparosProps) {
  const [etapaExpandida, setEtapaExpandida] = useState(1);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (aberto && etapaAtual && etapaAtual >= 1 && etapaAtual <= 4) {
      setEtapaExpandida(etapaAtual);
    }
  }, [aberto, etapaAtual]);

  useEffect(() => {
    if (!aberto) return;
    fecharRef.current?.focus();
    const fecharAoEscapar = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onAbertoChange(false);
      }
    };
    document.addEventListener("keydown", fecharAoEscapar, true);
    return () => document.removeEventListener("keydown", fecharAoEscapar, true);
  }, [aberto, onAbertoChange]);

  return (
    <>
      {!aberto && (
        <button
          type="button"
          className={styles.abaFechada}
          onClick={() => onAbertoChange(true)}
          aria-label="Abrir guia de ajuda sobre disparos"
          aria-expanded={false}
          aria-controls="guia-disparos"
        >
          <span>Ajuda</span>
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
      )}
      <aside
        id="guia-disparos"
        className={`${styles.drawer} ${aberto ? styles.drawerAberto : ""}`}
        aria-label="Guia de disparos WhatsApp"
        aria-hidden={!aberto}
        inert={!aberto}
      >
        <button
          type="button"
          className={styles.abaRecolher}
          onClick={() => onAbertoChange(false)}
          aria-label="Recolher guia de disparos"
          tabIndex={aberto ? 0 : -1}
        >
          <ChevronRight size={18} />
        </button>
        <div className={styles.scroll}>
          <div className={styles.cabecalho}>
            <div>
              <span className={styles.sobretitulo}>Orientações</span>
              <h2>Guia de Disparos</h2>
            </div>
            <button
              ref={fecharRef}
              type="button"
              className={styles.fechar}
              onClick={() => onAbertoChange(false)}
              aria-label="Fechar guia de disparos"
              tabIndex={aberto ? 0 : -1}
            >
              <X size={19} />
            </button>
          </div>
          <p className={styles.introducao}>Consulte cada campo enquanto prepara sua campanha.</p>

          <section className={styles.preRequisitos} aria-labelledby="disparos-requisitos">
            <h3 id="disparos-requisitos">Etapas obrigatórias para disparar</h3>
            <div className={styles.preRequisito}>
              <FileCheck2 size={19} aria-hidden="true" />
              <div>
                <strong>1. Criar um template</strong>
                <p>Tenha uma mensagem aprovada pela Meta.</p>
                <Link href="/central-de-conhecimento/disparos#templates" onClick={() => onAbertoChange(false)}>Saiba mais</Link>
              </div>
            </div>
            <div className={styles.preRequisito}>
              <CreditCard size={19} aria-hidden="true" />
              <div>
                <strong>2. Configurar pagamento</strong>
                <p>Cadastre o pagamento na conta comercial da Meta.</p>
                <Link href="/central-de-conhecimento/disparos#pagamento" onClick={() => onAbertoChange(false)}>Saiba mais</Link>
              </div>
            </div>
          </section>

          <div className={styles.etapas} aria-label="Etapas do envio">
            {etapas.map((etapa, indice) => {
              const numero = indice + 1;
              const expandida = etapaExpandida === numero;
              return (
                <section key={etapa.titulo} className={styles.etapa}>
                  <button
                    type="button"
                    className={`${styles.etapaBotao} ${expandida ? styles.etapaBotaoAtivo : ""}`}
                    onClick={() => setEtapaExpandida(expandida ? 0 : numero)}
                    aria-expanded={expandida}
                    aria-controls={`guia-disparos-etapa-${numero}`}
                  >
                    <span className={styles.numero}>{numero}</span>
                    <span className={styles.etapaNome}>{etapa.titulo}</span>
                    <ChevronDown size={17} className={expandida ? styles.girar : ""} aria-hidden="true" />
                  </button>
                  {expandida && (
                    <ol id={`guia-disparos-etapa-${numero}`} className={styles.passos}>
                      {etapa.passos.map((passo, passoIndice) => (
                        <li key={passo.titulo}>
                          <strong>{passoIndice + 1}. {passo.titulo}</strong>
                          <p>{passo.descricao}</p>
                          {passo.ancora && (
                            <Link
                              href={`/central-de-conhecimento/disparos#${passo.ancora}`}
                              onClick={() => onAbertoChange(false)}
                            >
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

          <section className={styles.resultados}>
            <strong>Depois do envio</strong>
            <p>Veja os resultados no histórico e consulte o motivo de cada falha.</p>
            <Link href="/central-de-conhecimento/disparos#historico" onClick={() => onAbertoChange(false)}>Saiba mais</Link>
          </section>

          <section className={styles.video}>
            <div className={styles.videoTitulo}><PlayCircle size={19} /><h3>Vídeos tutoriais</h3></div>
            <VideoTutoriais videos={obterVideosDoModulo("disparos")} tituloPendente="Como realizar um disparo" compacto />
          </section>
          <Link href="/central-de-conhecimento/disparos" className={styles.linkPrincipal} onClick={() => onAbertoChange(false)}>
            <BookOpen size={18} />
            Ver documentação completa
            <ChevronRight size={17} />
          </Link>
        </div>
      </aside>
    </>
  );
}
