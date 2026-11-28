"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera as Instagram, CheckCircle2, AlertCircle, RefreshCw, MessagesSquare, PlugZap, ExternalLink, ShieldCheck } from "lucide-react";
import styles from "./page.module.css";

type Integracao = {
  id: string;
  nome_conexao: string;
  username: string;
  foto_perfil_url: string | null;
  status: string;
  webhook_verificado: boolean;
  ultimo_webhook_em: string | null;
  token_expires_at: string | null;
  ultimo_erro: string | null;
};

export default function InstagramClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const response = await fetch("/api/integracoes-instagram", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Falha ao consultar contas Instagram.");
      setIntegracoes(json.integracoes || []);
      setErro("");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao buscar Instagram.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    const query = new URLSearchParams(window.location.search);
    if (query.get("conexao") === "sucesso") setFeedback("Conta conectada com sucesso. Faça um teste enviando Direct para confirmar o webhook.");
    if (query.get("erro")) setErro("Não foi possível concluir a conexão. Revise as configurações da Meta e tente novamente.");
    if (query.has("conexao") || query.has("erro")) window.history.replaceState(null, "", "/instagram");
  }, []);

  async function desconectar() {
    if (!confirmar || removendo) return;
    setRemovendo(true);
    try {
      const response = await fetch("/api/integracoes-instagram", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmar, confirmar: true })
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Falha ao desconectar.");
      setConfirmar(null);
      setFeedback(json.aviso || "Conta Instagram desconectada.");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao desconectar.");
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.brandIcon}><Instagram size={24} strokeWidth={1.8}/></div>
          <div>
            <span className={styles.kicker}>Canais de atendimento</span>
            <h1>Instagram</h1>
            <p>Conecte sua conta profissional à caixa de entrada do CRM Prosperity.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.outlineButton} disabled={carregando} onClick={() => void carregar()}><RefreshCw size={16}/> Atualizar</button>
          {podeGerenciar && <a className={styles.primaryButton} href="/api/integracoes-instagram/conectar"
            onClick={() => setConectando(true)}>
            <PlugZap size={17}/>{conectando ? "Redirecionando..." : "Conectar Instagram"}
          </a>}
        </div>
      </header>

      {erro && <div className={styles.error} role="alert"><AlertCircle size={18}/>{erro}</div>}
      {feedback && <div className={styles.success} role="status"><CheckCircle2 size={18}/>{feedback}</div>}

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div><h2>Contas do Instagram</h2><p>Gerencie os perfis profissionais autorizados pela Meta.</p></div>
            <span className={styles.counter}>{integracoes.filter((item) => item.status === "ativa").length} ativa(s)</span>
          </div>
          {carregando ? <div className={styles.empty}>Consultando suas conexões...</div> :
            integracoes.length === 0 ?
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Instagram size={30}/></div>
                <h3>Nenhum Instagram conectado</h3>
                <p>Conecte uma conta comercial ou de criador para receber mensagens pelo Direct dentro do CRM.</p>
                {podeGerenciar && <a className={styles.primaryButton} href="/api/integracoes-instagram/conectar">Conectar conta</a>}
              </div> :
              <div className={styles.accounts}>
                {integracoes.map((item) => (
                  <article className={styles.account} key={item.id}>
                    {item.foto_perfil_url ? <img className={styles.avatar} src={item.foto_perfil_url} alt="" /> : <div className={styles.avatarFallback}><Instagram size={24}/></div>}
                    <div className={styles.accountContent}>
                      <strong>@{item.username}</strong>
                      <span>{item.nome_conexao}</span>
                      <div className={styles.statusRow}>
                        <span className={item.status === "ativa" ? styles.activeStatus : styles.inactiveStatus}>
                          {item.status === "ativa" ? "Conectado" : "Indisponível"}
                        </span>
                        <span className={styles.muted}>Webhook: {item.webhook_verificado ? "recebimento confirmado" : "aguardando primeiro evento"}</span>
                      </div>
                      {item.token_expires_at && <span className={styles.muted}>Token válido até {new Date(item.token_expires_at).toLocaleDateString("pt-BR")}</span>}
                    </div>
                    <div className={styles.accountActions}>
                      <Link href="/conversas?canal=instagram" className={styles.outlineButton}><MessagesSquare size={15}/> Conversas</Link>
                      {podeGerenciar && <button className={styles.dangerButton} onClick={() => setConfirmar(item.id)}>Desconectar</button>}
                    </div>
                  </article>
                ))}
              </div>
          }
        </section>
        <aside className={styles.panel}>
          <div className={styles.asideTitle}><ShieldCheck size={20}/><h2>Como funciona</h2></div>
          <div className={styles.steps}>
            <div><span className={styles.stepNumber}>1</span><p><strong>Autorize a conta</strong><span>Entre com seu Instagram profissional pelo login oficial da Meta.</span></p></div>
            <div><span className={styles.stepNumber}>2</span><p><strong>Receba mensagens</strong><span>Novos Directs aparecem no módulo Conversas, identificados como Instagram.</span></p></div>
            <div><span className={styles.stepNumber}>3</span><p><strong>Atenda no CRM</strong><span>Assuma o atendimento e responda pela mesma caixa de entrada do WhatsApp.</span></p></div>
          </div>
          <Link href="/conversas?canal=instagram" className={styles.inlineLink}>Abrir conversas do Instagram <ExternalLink size={15}/></Link>
          <p className={styles.footnote}>Fase 1: conexão e atendimento humano. Fluxos, respostas por comentários e agente de IA serão habilitados nas próximas fases.</p>
        </aside>
      </div>
      {confirmar && <div className={styles.modalOverlay} role="presentation" onClick={() => !removendo && setConfirmar(null)}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Confirmar desconexão" onClick={(event) => event.stopPropagation()}>
          <h2>Desconectar Instagram?</h2>
          <p>O recebimento de novos Directs será interrompido. As conversas já registradas permanecerão no CRM.</p>
          <div className={styles.modalActions}>
            <button className={styles.outlineButton} disabled={removendo} onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className={styles.dangerSolid} disabled={removendo} onClick={() => void desconectar()}>{removendo ? "Desconectando..." : "Confirmar desconexão"}</button>
          </div>
        </div>
      </div>}
    </main>
  );
}
