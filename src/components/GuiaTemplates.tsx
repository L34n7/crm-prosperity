"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  PlayCircle,
  X,
} from "lucide-react";
import styles from "./GuiaDisparos.module.css";

type Passo = { titulo: string; descricao: string; ancora?: string };

const etapas: { titulo: string; passos: Passo[] }[] = [
  {
    titulo: "Imagem e cabeçalho",
    passos: [
      {
        titulo: "Adicionar imagem (opcional)",
        descricao: "Ative a opção se quiser incluir uma imagem JPG ou PNG de até 5 MB.",
        ancora: "imagem",
      },
      {
        titulo: "Cabeçalho (opcional)",
        descricao: "Digite uma frase curta de destaque, com até 60 caracteres.",
        ancora: "cabecalho",
      },
    ],
  },
  {
    titulo: "Corpo, rodapé e botões",
    passos: [
      {
        titulo: "Corpo da mensagem",
        descricao: "Escreva o texto principal que seus contatos receberão.",
        ancora: "corpo",
      },
      {
        titulo: "Variáveis e exemplos",
        descricao: "Use até 6 variáveis e informe um exemplo de cada uma para análise da Meta.",
        ancora: "variaveis",
      },
      {
        titulo: "Rodapé",
        descricao: "É preenchido automaticamente pelo CRM com a orientação de opt-out.",
        ancora: "rodape",
      },
      {
        titulo: "Botões (opcional)",
        descricao: "Adicione até 3 botões de resposta rápida ou para abrir um site.",
        ancora: "botoes",
      },
    ],
  },
  {
    titulo: "Integração, nome e categoria",
    passos: [
      {
        titulo: "Número WhatsApp",
        descricao: "Escolha a integração em que o template será cadastrado.",
        ancora: "numero",
      },
      {
        titulo: "Nome do template",
        descricao: "Dê um nome interno sem espaços. O CRM substitui espaços por _.",
        ancora: "nome",
      },
      {
        titulo: "Categoria",
        descricao: "Selecione Utilidade para mensagens operacionais ou Marketing para promoções.",
        ancora: "categoria",
      },
      {
        titulo: "Criar template",
        descricao: "Envie o modelo para análise da Meta e acompanhe seu status.",
        ancora: "aprovacao",
      },
    ],
  },
];

type Props = {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  etapaAtual: number | null;
};

export default function GuiaTemplates({ aberto, onAbertoChange, etapaAtual }: Props) {
  const [etapaExpandida, setEtapaExpandida] = useState(1);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (aberto && etapaAtual && etapaAtual >= 1 && etapaAtual <= 3) {
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
          aria-label="Abrir guia de Templates WhatsApp"
          aria-expanded={false}
          aria-controls="guia-templates"
        >
          <CircleHelp size={19} aria-hidden="true" />
          <span>Guia</span>
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
      )}
      <aside
        id="guia-templates"
        className={`${styles.drawer} ${aberto ? styles.drawerAberto : ""}`}
        aria-label="Guia de criação de Templates WhatsApp"
        aria-hidden={!aberto}
        inert={!aberto}
      >
        <button
          type="button"
          className={styles.abaRecolher}
          onClick={() => onAbertoChange(false)}
          aria-label="Recolher guia de Templates"
          tabIndex={aberto ? 0 : -1}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <div className={styles.scroll}>
          <header className={styles.cabecalho}>
            <div>
              <span className={styles.sobretitulo}>Orientações</span>
              <h2>Guia de Templates</h2>
            </div>
            <button
              ref={fecharRef}
              type="button"
              className={styles.fechar}
              onClick={() => onAbertoChange(false)}
              aria-label="Fechar guia de Templates"
              tabIndex={aberto ? 0 : -1}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </header>
          <p className={styles.introducao}>
            Crie uma mensagem para aprovação da Meta e utilize-a em seus disparos.
          </p>
          <section className={styles.preRequisitos} aria-labelledby="requisitos-templates">
            <h3 id="requisitos-templates">Antes de criar um template</h3>
            <div className={styles.preRequisito}>
              <FileCheck2 size={19} aria-hidden="true" />
              <div>
                <strong>Tenha uma integração WhatsApp</strong>
                <p>O número deve estar conectado ao CRM para cadastrar o modelo.</p>
                <Link href="/central-de-conhecimento/templates#preparacao" onClick={() => onAbertoChange(false)}>
                  Saiba mais
                </Link>
              </div>
            </div>
          </section>

          <div className={styles.etapas} aria-label="Etapas para criar templates">
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
                    aria-controls={`guia-templates-etapa-${numero}`}
                  >
                    <span className={styles.numero}>{numero}</span>
                    <span className={styles.etapaNome}>{etapa.titulo}</span>
                    <ChevronDown size={17} className={expandida ? styles.girar : ""} aria-hidden="true" />
                  </button>
                  {expandida && (
                    <ol className={styles.passos} id={`guia-templates-etapa-${numero}`}>
                      {etapa.passos.map((passo, passoIndice) => (
                        <li key={passo.titulo}>
                          <strong>{passoIndice + 1}. {passo.titulo}</strong>
                          <p>{passo.descricao}</p>
                          {passo.ancora && (
                            <Link
                              href={`/central-de-conhecimento/templates#${passo.ancora}`}
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
            <strong>Acompanhe a aprovação</strong>
            <p>Consulte os status Aprovado, Pendente e Rejeitado. Sincronize com a Meta quando necessário.</p>
            <Link href="/central-de-conhecimento/templates#status" onClick={() => onAbertoChange(false)}>
              Saiba mais
            </Link>
          </section>

          <section className={styles.video}>
            <div className={styles.videoTitulo}><PlayCircle size={19} /><h3>Vídeo tutorial</h3></div>
            <div className={styles.videoPlaceholder}>
              <PlayCircle size={30} strokeWidth={1.5} aria-hidden="true" />
              <strong>Como criar um template</strong>
              <span>Vídeo demonstrativo em preparação.</span>
            </div>
          </section>

          <Link href="/central-de-conhecimento/templates" className={styles.linkPrincipal} onClick={() => onAbertoChange(false)}>
            <BookOpen size={18} aria-hidden="true" />
            Ver documentação completa
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </aside>
    </>
  );
}
