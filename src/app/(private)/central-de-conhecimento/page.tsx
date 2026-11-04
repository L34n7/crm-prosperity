"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, ContactRound, FileCheck2, MessageCircle, Search, Send } from "lucide-react";
import Header from "@/components/Header";
import styles from "./central-de-conhecimento.module.css";

const artigos = [
  {
    titulo: "Disparos WhatsApp",
    descricao: "Aprenda a preparar campanhas, escolher destinatários, agendar envios, consultar cobranças e entender os resultados.",
    caminho: "/central-de-conhecimento/disparos",
    assuntos: ["Integração", "Templates", "Capacidade", "Contatos", "Agendamentos", "Custos", "Falhas"],
  },
  {
    titulo: "Templates WhatsApp",
    descricao: "Crie modelos de mensagem, configure imagens, variáveis e botões e acompanhe a aprovação da Meta.",
    caminho: "/central-de-conhecimento/templates",
    assuntos: ["Imagem", "Cabeçalho", "Corpo", "Variáveis", "Rodapé", "Botões", "Categorias", "Aprovação", "Sincronização"],
  },
  {
    titulo: "Contatos",
    descricao: "Cadastre e importe contatos, utilize filtros, organize listas e confira os dados de atendimento e consentimento.",
    caminho: "/central-de-conhecimento/contatos",
    assuntos: ["Cadastro", "Filtros", "Importação", "E-mails", "Listas", "Opt-in", "Revisão"],
  },
  {
    titulo: "Perfil WhatsApp",
    descricao: "Configure dados comerciais, foto, nome de exibição e acompanhe a saúde das integrações conectadas.",
    caminho: "/central-de-conhecimento/perfil-whatsapp",
    assuntos: ["Foto", "Nome", "Categoria", "Qualidade", "Coexistência", "Meta", "Desconexão"],
  },
];

export default function CentralDeConhecimentoPage() {
  const [busca, setBusca] = useState("");
  const artigosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return artigos;
    return artigos.filter((artigo) =>
      [artigo.titulo, artigo.descricao, ...artigo.assuntos].some((valor) =>
        valor.toLocaleLowerCase("pt-BR").includes(termo),
      ),
    );
  }, [busca]);

  return (
    <>
      <Header title="Central de Conhecimento" subtitle="Encontre guias e orientações para utilizar o CRM Prosperity." />
      <main className={styles.pagina}>
        <section className={styles.hero}>
          <div className={styles.heroConteudo}>
            <span className={styles.sobretitulo}><BookOpen size={16} /> Ajuda e documentação</span>
            <h1>Tudo o que você precisa saber, em um só lugar.</h1>
            <p>Consulte instruções completas para configurar, operar e acompanhar os recursos do CRM.</p>
            <label className={styles.busca}>
              <Search size={20} aria-hidden="true" />
              <span className={styles.visualmenteOculto}>Pesquisar documentação</span>
              <input
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar assuntos, por exemplo: agendamento, custo, falhas..."
              />
            </label>
          </div>
          <span className={styles.heroIcone} aria-hidden="true"><BookOpen size={82} strokeWidth={1.15} /></span>
        </section>

        <section aria-labelledby="titulo-artigos" className={styles.colecao}>
          <div className={styles.colecaoCabecalho}>
            <div>
              <span className={styles.rotulo}>Biblioteca</span>
              <h2 id="titulo-artigos">Documentação por módulo</h2>
              <p>Escolha um módulo para explorar tutoriais, respostas e recomendações.</p>
            </div>
            <span className={styles.contagem}>{artigosFiltrados.length} {artigosFiltrados.length === 1 ? "guia disponível" : "guias disponíveis"}</span>
          </div>
          <div className={styles.gradeArtigos}>
            {artigosFiltrados.map((artigo) => (
              <Link key={artigo.caminho} href={artigo.caminho} className={styles.cardArtigo}>
                <span className={styles.cardIcone}>
                  {artigo.caminho.endsWith("/templates") ? <FileCheck2 size={23} /> :
                   artigo.caminho.endsWith("/contatos") ? <ContactRound size={23} /> :
                   artigo.caminho.endsWith("/perfil-whatsapp") ? <MessageCircle size={23} /> :
                   <Send size={23} />}
                </span>
                <span className={styles.cardEtiqueta}>Guia completo</span>
                <h3>{artigo.titulo}</h3>
                <p>{artigo.descricao}</p>
                <span className={styles.assuntos}>{artigo.assuntos.slice(0, 5).map((assunto) => <span key={assunto}>{assunto}</span>)}</span>
                <span className={styles.cardRodape}>Explorar documentação <ArrowRight size={17} /></span>
              </Link>
            ))}
          </div>
          {artigosFiltrados.length === 0 && (
            <div className={styles.semResultados}>
              <Search size={25} aria-hidden="true" />
              <strong>Nenhum guia encontrado</strong>
              <p>Tente buscar por outro assunto ou módulo.</p>
              <button type="button" onClick={() => setBusca("")}>Limpar busca</button>
            </div>
          )}
        </section>

      </main>
    </>
  );
}
