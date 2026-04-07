"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./mensagens.module.css";

type ConversaOpcao = {
  id: string;
  assunto: string | null;
  status: string;
  contatos?: {
    nome: string | null;
    telefone: string;
  } | null;
};

type Mensagem = {
  id: string;
  conversa_id: string;
  remetente_tipo: "contato" | "bot" | "ia" | "usuario" | "sistema";
  remetente_id: string | null;
  conteudo: string;
  tipo_mensagem: string;
  origem: "recebida" | "enviada" | "automatica";
  status_envio: "pendente" | "enviada" | "entregue" | "lida" | "falha";
  created_at: string;
};

function formatarDataHora(data: string) {
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarHora(data: string) {
  return new Date(data).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarDataSeparador(data: string) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusLabel(status: Mensagem["status_envio"]) {
  switch (status) {
    case "pendente":
      return "⏳";
    case "enviada":
      return "✓";
    case "entregue":
      return "✓✓";
    case "lida":
      return "✓✓";
    case "falha":
      return "!";
    default:
      return "";
  }
}

function getNomeRemetente(remetenteTipo: Mensagem["remetente_tipo"]) {
  switch (remetenteTipo) {
    case "contato":
      return "Contato";
    case "usuario":
      return "Atendente";
    case "bot":
      return "Bot";
    case "ia":
      return "IA";
    case "sistema":
      return "Sistema";
    default:
      return remetenteTipo;
  }
}

export default function MensagensPage() {
  const [conversas, setConversas] = useState<ConversaOpcao[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaId, setConversaId] = useState("");

  const [conteudo, setConteudo] = useState("");
  const [remetenteTipo, setRemetenteTipo] =
    useState<Mensagem["remetente_tipo"]>("usuario");
  const [origem, setOrigem] = useState<Mensagem["origem"]>("enviada");
  const [statusEnvio, setStatusEnvio] =
    useState<Mensagem["status_envio"]>("enviada");

  const [loadingConversas, setLoadingConversas] = useState(false);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editConteudo, setEditConteudo] = useState("");

  const [buscaConversa, setBuscaConversa] = useState("");
  const [mostrarConfigTeste, setMostrarConfigTeste] = useState(false);

  const mensagensContainerRef = useRef<HTMLDivElement | null>(null);

  const conversaSelecionada = useMemo(() => {
    return conversas.find((c) => c.id === conversaId) || null;
  }, [conversas, conversaId]);

  const conversasFiltradas = useMemo(() => {
    const termo = buscaConversa.trim().toLowerCase();

    if (!termo) return conversas;

    return conversas.filter((conversa) => {
      const nome = conversa.contatos?.nome?.toLowerCase() || "";
      const telefone = conversa.contatos?.telefone?.toLowerCase() || "";
      const assunto = conversa.assunto?.toLowerCase() || "";

      return (
        nome.includes(termo) ||
        telefone.includes(termo) ||
        assunto.includes(termo)
      );
    });
  }, [conversas, buscaConversa]);

  async function carregarConversas() {
    try {
      setLoadingConversas(true);

      const res = await fetch("/api/conversas", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar conversas");
        return;
      }

      setConversas(data.conversas || []);
    } catch {
      setErro("Erro ao carregar conversas");
    } finally {
      setLoadingConversas(false);
    }
  }

  async function carregarMensagens(conversaIdAtual?: string, silencioso = false) {
    const id = conversaIdAtual || conversaId;

    if (!id) {
      setMensagens([]);
      return;
    }

    try {
      if (!silencioso) {
        setLoadingMensagens(true);
      }

      setErro("");

      const res = await fetch(`/api/mensagens?conversa_id=${id}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar mensagens");
        return;
      }

      setMensagens(data.mensagens || []);
    } catch {
      setErro("Erro ao carregar mensagens");
    } finally {
      if (!silencioso) {
        setLoadingMensagens(false);
      }
    }
  }

  async function criarMensagem() {
    setMensagem("");
    setErro("");

    if (!conversaId) {
      setErro("Selecione uma conversa.");
      return;
    }

    if (!conteudo.trim()) {
      setErro("Digite o conteúdo da mensagem.");
      return;
    }

    try {
      setEnviando(true);

      const res = await fetch("/api/mensagens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversa_id: conversaId,
          remetente_tipo: remetenteTipo,
          conteudo: conteudo.trim(),
          tipo_mensagem: "texto",
          origem,
          status_envio: statusEnvio,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao criar mensagem");
        return;
      }

      setMensagem(data.message || "Mensagem criada com sucesso.");
      setConteudo("");

      await carregarMensagens(conversaId, true);
      await carregarConversas();
    } catch {
      setErro("Erro ao criar mensagem");
    } finally {
      setEnviando(false);
    }
  }

  function iniciarEdicao(msg: Mensagem) {
    setEditandoId(msg.id);
    setEditConteudo(msg.conteudo);
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditConteudo("");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editConteudo.trim()) {
      setErro("Digite o conteúdo da mensagem.");
      return;
    }

    try {
      const res = await fetch(`/api/mensagens/${editandoId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conteudo: editConteudo.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar mensagem");
        return;
      }

      setMensagem(data.message || "Mensagem atualizada com sucesso.");
      cancelarEdicao();
      await carregarMensagens(conversaId, true);
    } catch {
      setErro("Erro ao atualizar mensagem");
    }
  }

  function onKeyDownMensagem(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!enviando) {
        criarMensagem();
      }
    }
  }

  function isMensagemSaida(msg: Mensagem) {
    return msg.origem === "enviada";
  }

  const mensagensAgrupadas = useMemo(() => {
    const grupos: Array<
      | { tipo: "data"; valor: string }
      | { tipo: "mensagem"; valor: Mensagem }
    > = [];

    let ultimaData = "";

    for (const msg of mensagens) {
      const dataAtual = formatarDataSeparador(msg.created_at);

      if (dataAtual !== ultimaData) {
        grupos.push({ tipo: "data", valor: dataAtual });
        ultimaData = dataAtual;
      }

      grupos.push({ tipo: "mensagem", valor: msg });
    }

    return grupos;
  }, [mensagens]);

  useEffect(() => {
    carregarConversas();
  }, []);

  useEffect(() => {
    carregarMensagens();
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId) return;

    const interval = setInterval(() => {
      carregarMensagens(conversaId, true);
    }, 3000);

    return () => clearInterval(interval);
  }, [conversaId]);

  useEffect(() => {
    const el = mensagensContainerRef.current;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }, [mensagens, editandoId]);

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeaderTop}>
              <div>
                <h1 className={styles.sidebarTitle}>Mensagens</h1>
                <p className={styles.sidebarSubtitle}>Central de atendimento</p>
              </div>

              <button onClick={carregarConversas} className={styles.refreshButton}>
                Atualizar
              </button>
            </div>

            <div className={styles.searchWrapper}>
              <input
                type="text"
                value={buscaConversa}
                onChange={(e) => setBuscaConversa(e.target.value)}
                placeholder="Buscar conversa por nome, telefone ou assunto"
                className={styles.searchInput}
              />
            </div>
          </div>

          <div className={styles.sidebarList}>
            {loadingConversas ? (
              <div className={styles.sidebarMessage}>Carregando conversas...</div>
            ) : conversasFiltradas.length === 0 ? (
              <div className={styles.sidebarMessage}>
                Nenhuma conversa encontrada.
              </div>
            ) : (
              conversasFiltradas.map((conversa) => {
                const selecionada = conversa.id === conversaId;
                const nome = conversa.contatos?.nome || "Sem nome";
                const telefone = conversa.contatos?.telefone || "Sem telefone";
                const assunto = conversa.assunto || "Sem assunto";

                return (
                  <button
                    key={conversa.id}
                    onClick={() => setConversaId(conversa.id)}
                    className={`${styles.conversationButton} ${
                      selecionada ? styles.conversationButtonActive : ""
                    }`}
                  >
                    <div className={styles.conversationRow}>
                      <div className={styles.conversationContent}>
                        <p className={styles.conversationName}>{nome}</p>
                        <p className={styles.conversationPhone}>{telefone}</p>
                        <p className={styles.conversationSubject}>{assunto}</p>
                      </div>

                      <span
                        className={`${styles.statusBadge} ${
                          conversa.status === "aberta"
                            ? styles.statusBadgeOpen
                            : styles.statusBadgeDefault
                        }`}
                      >
                        {conversa.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={styles.desktopChat}>
          {conversaSelecionada ? (
            <>
              <header className={styles.chatHeader}>
                <div className={styles.chatHeaderTop}>
                  <div className={styles.chatHeaderInfo}>
                    <h2 className={styles.chatHeaderTitle}>
                      {conversaSelecionada.contatos?.nome || "Sem nome"}
                    </h2>
                    <p className={styles.chatHeaderSubtitle}>
                      {conversaSelecionada.contatos?.telefone || "Sem telefone"} •{" "}
                      {conversaSelecionada.assunto || "Sem assunto"}
                    </p>
                  </div>

                  <button
                    onClick={() => setMostrarConfigTeste((prev) => !prev)}
                    className={styles.testButton}
                  >
                    {mostrarConfigTeste ? "Ocultar ajustes" : "Ajustes de teste"}
                  </button>
                </div>

                {mostrarConfigTeste && (
                  <div className={styles.testPanel}>
                    <div>
                      <label className={styles.fieldLabel}>Remetente</label>
                      <select
                        className={styles.fieldSelect}
                        value={remetenteTipo}
                        onChange={(e) =>
                          setRemetenteTipo(
                            e.target.value as Mensagem["remetente_tipo"]
                          )
                        }
                      >
                        <option value="usuario">Usuário</option>
                        <option value="contato">Contato</option>
                        <option value="bot">Bot</option>
                        <option value="ia">IA</option>
                        <option value="sistema">Sistema</option>
                      </select>
                    </div>

                    <div>
                      <label className={styles.fieldLabel}>Origem</label>
                      <select
                        className={styles.fieldSelect}
                        value={origem}
                        onChange={(e) =>
                          setOrigem(e.target.value as Mensagem["origem"])
                        }
                      >
                        <option value="enviada">Enviada</option>
                        <option value="recebida">Recebida</option>
                        <option value="automatica">Automática</option>
                      </select>
                    </div>

                    <div>
                      <label className={styles.fieldLabel}>Status envio</label>
                      <select
                        className={styles.fieldSelect}
                        value={statusEnvio}
                        onChange={(e) =>
                          setStatusEnvio(
                            e.target.value as Mensagem["status_envio"]
                          )
                        }
                      >
                        <option value="pendente">Pendente</option>
                        <option value="enviada">Enviada</option>
                        <option value="entregue">Entregue</option>
                        <option value="lida">Lida</option>
                        <option value="falha">Falha</option>
                      </select>
                    </div>
                  </div>
                )}
              </header>

              <div ref={mensagensContainerRef} className={styles.messagesArea}>
                {loadingMensagens ? (
                  <div className={styles.messagesInfo}>Carregando mensagens...</div>
                ) : mensagens.length === 0 ? (
                  <div className={styles.emptyConversationCard}>
                    Nenhuma mensagem cadastrada ainda nessa conversa.
                  </div>
                ) : (
                  <div className={styles.messagesStack}>
                    {mensagensAgrupadas.map((item, index) => {
                      if (item.tipo === "data") {
                        return (
                          <div key={`data-${item.valor}-${index}`} className={styles.dateRow}>
                            <div className={styles.dateBadge}>{item.valor}</div>
                          </div>
                        );
                      }

                      const msg = item.valor;
                      const saida = isMensagemSaida(msg);

                      return (
                        <div
                          key={msg.id}
                          className={`${styles.messageRow} ${
                            saida ? styles.messageRowOutgoing : styles.messageRowIncoming
                          }`}
                        >
                          <div
                            className={`${styles.messageBubble} ${
                              saida
                                ? styles.messageBubbleOutgoing
                                : msg.origem === "automatica"
                                ? styles.messageBubbleAutomatic
                                : styles.messageBubbleIncoming
                            }`}
                          >
                            {editandoId === msg.id ? (
                              <div>
                                <textarea
                                  className={styles.editTextarea}
                                  rows={4}
                                  value={editConteudo}
                                  onChange={(e) => setEditConteudo(e.target.value)}
                                />

                                <div className={styles.editActions}>
                                  <button
                                    onClick={salvarEdicao}
                                    className={styles.saveButton}
                                  >
                                    Salvar
                                  </button>

                                  <button
                                    onClick={cancelarEdicao}
                                    className={styles.cancelButton}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className={styles.messageMetaTop}>
                                  <span className={styles.senderLabel}>
                                    {getNomeRemetente(msg.remetente_tipo)}
                                  </span>

                                  {msg.origem === "automatica" && (
                                    <span className={styles.automaticBadge}>
                                      automática
                                    </span>
                                  )}
                                </div>

                                <p className={styles.messageText}>{msg.conteudo}</p>

                                <div className={styles.messageMetaBottom}>
                                  <span title={formatarDataHora(msg.created_at)}>
                                    {formatarHora(msg.created_at)}
                                  </span>

                                  {saida && (
                                    <span
                                      title={`Status: ${msg.status_envio}`}
                                      className={`${styles.statusIcon} ${
                                        msg.status_envio === "lida"
                                          ? styles.statusIconRead
                                          : msg.status_envio === "falha"
                                          ? styles.statusIconError
                                          : styles.statusIconDefault
                                      }`}
                                    >
                                      {statusLabel(msg.status_envio)}
                                    </span>
                                  )}
                                </div>

                                <div className={styles.messageActions}>
                                  <button
                                    onClick={() => iniciarEdicao(msg)}
                                    className={styles.editButton}
                                  >
                                    Editar
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <footer className={styles.chatFooter}>
                {mensagem && (
                  <div className={styles.successAlert}>{mensagem}</div>
                )}

                {erro && <div className={styles.errorAlert}>{erro}</div>}

                <div className={styles.inputRow}>
                  <textarea
                    className={styles.messageInput}
                    rows={2}
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    onKeyDown={onKeyDownMensagem}
                    placeholder="Digite uma mensagem"
                  />

                  <button
                    onClick={criarMensagem}
                    disabled={enviando || !conteudo.trim()}
                    className={styles.sendButton}
                  >
                    {enviando ? "Enviando..." : "Enviar"}
                  </button>
                </div>

                <p className={styles.footerHint}>
                  Enter envia a mensagem • Shift + Enter quebra linha
                </p>
              </footer>
            </>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateContent}>
                <h2 className={styles.emptyStateTitle}>Selecione uma conversa</h2>
                <p className={styles.emptyStateText}>
                  Escolha uma conversa na lateral para visualizar o histórico e
                  enviar novas mensagens.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className={styles.mobileChat}>
          {conversaSelecionada ? (
            <>
              <header className={styles.mobileHeader}>
                <h2 className={styles.mobileHeaderTitle}>
                  {conversaSelecionada.contatos?.nome || "Sem nome"}
                </h2>
                <p className={styles.mobileHeaderSubtitle}>
                  {conversaSelecionada.contatos?.telefone || "Sem telefone"}
                </p>
              </header>

              <div ref={mensagensContainerRef} className={styles.mobileMessagesArea}>
                <div className={styles.messagesStack}>
                  {mensagensAgrupadas.map((item, index) => {
                    if (item.tipo === "data") {
                      return (
                        <div key={`m-data-${item.valor}-${index}`} className={styles.dateRow}>
                          <div className={styles.dateBadge}>{item.valor}</div>
                        </div>
                      );
                    }

                    const msg = item.valor;
                    const saida = isMensagemSaida(msg);

                    return (
                      <div
                        key={msg.id}
                        className={`${styles.messageRow} ${
                          saida ? styles.messageRowOutgoing : styles.messageRowIncoming
                        }`}
                      >
                        <div
                          className={`${styles.mobileMessageBubble} ${
                            saida
                              ? styles.messageBubbleOutgoing
                              : styles.messageBubbleIncoming
                          }`}
                        >
                          <p className={styles.mobileMessageText}>{msg.conteudo}</p>
                          <div className={styles.mobileMessageMeta}>
                            <span>{formatarHora(msg.created_at)}</span>
                            {saida && <span>{statusLabel(msg.status_envio)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <footer className={styles.mobileFooter}>
                <div className={styles.inputRow}>
                  <textarea
                    className={styles.messageInput}
                    rows={2}
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    onKeyDown={onKeyDownMensagem}
                    placeholder="Digite uma mensagem"
                  />
                  <button
                    onClick={criarMensagem}
                    disabled={enviando || !conteudo.trim()}
                    className={styles.sendButton}
                  >
                    {enviando ? "..." : "Enviar"}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className={styles.mobileEmptyState}>
              Selecione uma conversa.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}