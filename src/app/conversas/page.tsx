"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./conversas.module.css";

type Conversa = {
  id: string;
  assunto: string | null;
  status: string;
  prioridade: string | null;
  canal: string | null;
  origem_atendimento?: string | null;
  last_message_at: string | null;
  setor_id?: string | null;
  responsavel_id?: string | null;

  contatos: {
    nome: string | null;
    telefone: string;
  } | null;

  setores: {
    id?: string;
    nome: string;
  } | null;

  responsavel: {
    id?: string;
    nome: string;
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

type SetorOpcao = {
  id: string;
  nome: string;
};

type UsuarioOpcao = {
  id: string;
  nome: string;
  perfil?: string;
  setor_id?: string | null;
};

function formatarHora(data?: string | null) {
  if (!data) return "";
  return new Date(data).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarDataCompleta(data?: string | null) {
  if (!data) return "Sem atividade";
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarDataSeparador(data?: string | null) {
  if (!data) return "";
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getPrioridadeLabel(prioridade?: string | null) {
  if (!prioridade) return "Normal";

  switch (prioridade) {
    case "baixa":
      return "Baixa";
    case "media":
      return "Média";
    case "alta":
      return "Alta";
    case "urgente":
      return "Urgente";
    default:
      return prioridade;
  }
}

function getCanalLabel(canal?: string | null) {
  if (!canal) return "Não informado";

  switch (canal) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "site":
      return "Site";
    case "email":
      return "E-mail";
    default:
      return canal;
  }
}

function getRemetenteLabel(remetente: Mensagem["remetente_tipo"]) {
  switch (remetente) {
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
      return remetente;
  }
}

function getStatusEnvioLabel(status: Mensagem["status_envio"]) {
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

export default function ConversasPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaSelecionada, setConversaSelecionada] = useState<Conversa | null>(null);

  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [canalFiltro, setCanalFiltro] = useState("todos");

  const [conteudo, setConteudo] = useState("");
  const [loadingConversas, setLoadingConversas] = useState(false);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagemSucesso, setMensagemSucesso] = useState("");

  const [acaoAberta, setAcaoAberta] = useState<null | "transferir" | "atribuir" | "encerrar">(null);
  const [novoSetorId, setNovoSetorId] = useState("");
  const [novoResponsavelId, setNovoResponsavelId] = useState("");
  const [salvandoAcao, setSalvandoAcao] = useState(false);

  const mensagensRef = useRef<HTMLDivElement | null>(null);

  async function carregarConversas() {
    try {
      setLoadingConversas(true);
      setErro("");

      const res = await fetch("/api/conversas", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar conversas");
        return;
      }

      const lista = data.conversas || [];
      setConversas(lista);

      setConversaSelecionada((atual) => {
        if (!lista.length) return null;
        if (!atual) return lista[0];

        const encontrada = lista.find((c: Conversa) => c.id === atual.id);
        return encontrada || lista[0];
      });
    } catch {
      setErro("Erro ao carregar conversas");
    } finally {
      setLoadingConversas(false);
    }
  }

  async function carregarMensagens(conversaId: string, silencioso = false) {
    try {
      if (!silencioso) {
        setLoadingMensagens(true);
      }

      const res = await fetch(`/api/mensagens?conversa_id=${conversaId}`, {
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

  async function carregarSetores() {
    try {
      const res = await fetch("/api/setores", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setSetores(data.setores || []);
      }
    } catch {}
  }

  async function carregarUsuarios() {
    try {
      const res = await fetch("/api/usuarios", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setUsuarios(data.usuarios || []);
      }
    } catch {}
  }

  async function enviarMensagem() {
    setMensagemSucesso("");
    setErro("");

    if (!conversaSelecionada?.id) {
      setErro("Selecione uma conversa.");
      return;
    }

    if (!conteudo.trim()) {
      setErro("Digite uma mensagem.");
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
          conversa_id: conversaSelecionada.id,
          conteudo: conteudo.trim(),
          remetente_tipo: "usuario",
          tipo_mensagem: "texto",
          origem: "enviada",
          status_envio: "enviada",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao enviar mensagem");
        return;
      }

      setConteudo("");
      setMensagemSucesso(data.message || "Mensagem enviada com sucesso.");

      await carregarMensagens(conversaSelecionada.id, true);
      await carregarConversas();
    } catch {
      setErro("Erro ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  }

  async function atualizarConversa(payload: Record<string, unknown>, sucesso: string) {
    if (!conversaSelecionada?.id) return;

    try {
      setSalvandoAcao(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar conversa");
        return;
      }

      setMensagemSucesso(data.message || sucesso);
      setAcaoAberta(null);

      await carregarConversas();

      if (conversaSelecionada?.id) {
        await carregarMensagens(conversaSelecionada.id, true);
      }
    } catch {
      setErro("Erro ao atualizar conversa");
    } finally {
      setSalvandoAcao(false);
    }
  }

  async function confirmarTransferencia() {
    if (!novoSetorId) {
      setErro("Selecione um setor.");
      return;
    }

    await atualizarConversa(
      { setor_id: novoSetorId },
      "Conversa transferida com sucesso."
    );
  }

  async function confirmarAtribuicao() {
    if (!novoResponsavelId) {
      setErro("Selecione um responsável.");
      return;
    }

    await atualizarConversa(
      { responsavel_id: novoResponsavelId },
      "Responsável atribuído com sucesso."
    );
  }

  async function confirmarEncerramento() {
    await atualizarConversa(
      { status: "encerrada" },
      "Conversa encerrada com sucesso."
    );
  }

  function abrirTransferir() {
    setErro("");
    setMensagemSucesso("");
    setNovoSetorId(conversaSelecionada?.setor_id || conversaSelecionada?.setores?.id || "");
    setAcaoAberta("transferir");
  }

  function abrirAtribuir() {
    setErro("");
    setMensagemSucesso("");
    setNovoResponsavelId(
      conversaSelecionada?.responsavel_id || conversaSelecionada?.responsavel?.id || ""
    );
    setAcaoAberta("atribuir");
  }

  function abrirEncerrar() {
    setErro("");
    setMensagemSucesso("");
    setAcaoAberta("encerrar");
  }

  function onKeyDownMensagem(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!enviando) {
        enviarMensagem();
      }
    }
  }

  const usuariosFiltradosPorSetor = useMemo(() => {
    if (!conversaSelecionada) return usuarios;

    const setorAtual = acaoAberta === "transferir" ? novoSetorId : (
      conversaSelecionada.setor_id || conversaSelecionada.setores?.id || ""
    );

    if (!setorAtual) return usuarios;

    const filtrados = usuarios.filter((u) => {
      if (!u.setor_id) return true;
      return u.setor_id === setorAtual;
    });

    return filtrados.length > 0 ? filtrados : usuarios;
  }, [usuarios, conversaSelecionada, acaoAberta, novoSetorId]);

  const conversasFiltradas = useMemo(() => {
    let lista = [...conversas];

    if (statusFiltro !== "todas") {
      lista = lista.filter((c) => c.status === statusFiltro);
    }

    if (canalFiltro !== "todos") {
      lista = lista.filter((c) => (c.canal || "") === canalFiltro);
    }

    if (busca.trim()) {
      const termo = busca.toLowerCase();

      lista = lista.filter((c) => {
        const nome = c.contatos?.nome?.toLowerCase() || "";
        const telefone = c.contatos?.telefone?.toLowerCase() || "";
        const assunto = c.assunto?.toLowerCase() || "";
        const setor = c.setores?.nome?.toLowerCase() || "";
        const responsavel = c.responsavel?.nome?.toLowerCase() || "";

        return (
          nome.includes(termo) ||
          telefone.includes(termo) ||
          assunto.includes(termo) ||
          setor.includes(termo) ||
          responsavel.includes(termo)
        );
      });
    }

    lista.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    return lista;
  }, [conversas, busca, statusFiltro, canalFiltro]);

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
    carregarSetores();
    carregarUsuarios();
  }, []);

  useEffect(() => {
    if (!conversaSelecionada?.id) {
      setMensagens([]);
      return;
    }

    carregarMensagens(conversaSelecionada.id);
  }, [conversaSelecionada?.id]);

  useEffect(() => {
    if (!conversaSelecionada?.id) return;

    const interval = setInterval(() => {
      carregarMensagens(conversaSelecionada.id, true);
      carregarConversas();
    }, 4000);

    return () => clearInterval(interval);
  }, [conversaSelecionada?.id]);

  useEffect(() => {
    if (!mensagensRef.current) return;
    mensagensRef.current.scrollTop = mensagensRef.current.scrollHeight;
  }, [mensagens]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeaderTop}>
              <div>
                <h1 className={styles.pageTitle}>Conversas</h1>
                <p className={styles.pageSubtitle}>Central operacional de atendimento</p>
              </div>

              <button onClick={carregarConversas} className={styles.refreshButton}>
                Atualizar
              </button>
            </div>

            <div className={styles.searchArea}>
              <input
                placeholder="Buscar por nome, telefone, assunto, setor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.filtersGrid}>
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="todas">Todas</option>
                <option value="aberta">Abertas</option>
                <option value="em_atendimento">Em atendimento</option>
                <option value="aguardando">Aguardando</option>
                <option value="encerrada">Encerradas</option>
              </select>

              <select
                value={canalFiltro}
                onChange={(e) => setCanalFiltro(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="todos">Todos os canais</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="site">Site</option>
                <option value="email">E-mail</option>
              </select>
            </div>
          </div>

          <div className={styles.sidebarBody}>
            {loadingConversas ? (
              <div className={styles.emptyListState}>Carregando conversas...</div>
            ) : conversasFiltradas.length === 0 ? (
              <div className={styles.emptyListState}>Nenhuma conversa encontrada.</div>
            ) : (
              conversasFiltradas.map((c) => {
                const ativo = conversaSelecionada?.id === c.id;

                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setMensagemSucesso("");
                      setErro("");
                      setConversaSelecionada(c);
                    }}
                    className={`${styles.conversationCard} ${
                      ativo ? styles.conversationCardActive : ""
                    }`}
                  >
                    <div className={styles.conversationTop}>
                      <div className={styles.conversationIdentity}>
                        <p className={styles.contactName}>{c.contatos?.nome || "Sem nome"}</p>
                        <p className={styles.contactPhone}>
                          {c.contatos?.telefone || "Sem telefone"}
                        </p>
                      </div>

                      <span className={styles.timeLabel}>
                        {formatarHora(c.last_message_at)}
                      </span>
                    </div>

                    <p className={styles.subjectLine}>{c.assunto || "Sem assunto"}</p>

                    <div className={styles.metaRow}>
                      <span className={styles.metaChip}>{c.setores?.nome || "Sem setor"}</span>
                      <span className={styles.metaChip}>
                        {c.responsavel?.nome || "Sem responsável"}
                      </span>
                    </div>

                    <div className={styles.metaRowBottom}>
                      <span className={styles.channelBadge}>{getCanalLabel(c.canal)}</span>

                      <span
                        className={`${styles.statusBadge} ${
                          c.status === "aberta"
                            ? styles.statusOpen
                            : c.status === "em_atendimento"
                            ? styles.statusInProgress
                            : c.status === "aguardando"
                            ? styles.statusWaiting
                            : styles.statusClosed
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={styles.content}>
          {conversaSelecionada ? (
            <>
              <header className={styles.contentHeader}>
                <div className={styles.contentHeaderMain}>
                  <div>
                    <h2 className={styles.contentTitle}>
                      {conversaSelecionada.contatos?.nome || "Sem nome"}
                    </h2>
                    <p className={styles.contentSubtitle}>
                      {conversaSelecionada.contatos?.telefone || "Sem telefone"}
                    </p>
                  </div>

                  <div className={styles.headerActions}>
                    <button className={styles.secondaryButton} onClick={abrirTransferir}>
                      Transferir
                    </button>
                    <button className={styles.secondaryButton} onClick={abrirAtribuir}>
                      Atribuir
                    </button>
                    <button className={styles.dangerButton} onClick={abrirEncerrar}>
                      Encerrar
                    </button>
                  </div>
                </div>

                <div className={styles.infoGrid}>
                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Assunto</span>
                    <strong className={styles.infoValue}>
                      {conversaSelecionada.assunto || "Sem assunto"}
                    </strong>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Canal</span>
                    <strong className={styles.infoValue}>
                      {getCanalLabel(conversaSelecionada.canal)}
                    </strong>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Setor</span>
                    <strong className={styles.infoValue}>
                      {conversaSelecionada.setores?.nome || "Sem setor"}
                    </strong>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Responsável</span>
                    <strong className={styles.infoValue}>
                      {conversaSelecionada.responsavel?.nome || "Sem responsável"}
                    </strong>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Prioridade</span>
                    <strong className={styles.infoValue}>
                      {getPrioridadeLabel(conversaSelecionada.prioridade)}
                    </strong>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Última atividade</span>
                    <strong className={styles.infoValue}>
                      {formatarDataCompleta(conversaSelecionada.last_message_at)}
                    </strong>
                  </div>
                </div>

                {acaoAberta && (
                  <div className={styles.actionPanel}>
                    {acaoAberta === "transferir" && (
                      <>
                        <div className={styles.actionPanelHeader}>
                          <h3 className={styles.actionPanelTitle}>Transferir conversa</h3>
                          <button
                            className={styles.actionClose}
                            onClick={() => setAcaoAberta(null)}
                          >
                            Fechar
                          </button>
                        </div>

                        <div className={styles.actionPanelBody}>
                          <label className={styles.actionLabel}>Novo setor</label>
                          <select
                            value={novoSetorId}
                            onChange={(e) => setNovoSetorId(e.target.value)}
                            className={styles.actionSelect}
                          >
                            <option value="">Selecione um setor</option>
                            {setores.map((setor) => (
                              <option key={setor.id} value={setor.id}>
                                {setor.nome}
                              </option>
                            ))}
                          </select>

                          <div className={styles.actionButtons}>
                            <button
                              className={styles.secondaryButton}
                              onClick={() => setAcaoAberta(null)}
                              disabled={salvandoAcao}
                            >
                              Cancelar
                            </button>
                            <button
                              className={styles.primaryButton}
                              onClick={confirmarTransferencia}
                              disabled={salvandoAcao}
                            >
                              {salvandoAcao ? "Salvando..." : "Confirmar transferência"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {acaoAberta === "atribuir" && (
                      <>
                        <div className={styles.actionPanelHeader}>
                          <h3 className={styles.actionPanelTitle}>Atribuir responsável</h3>
                          <button
                            className={styles.actionClose}
                            onClick={() => setAcaoAberta(null)}
                          >
                            Fechar
                          </button>
                        </div>

                        <div className={styles.actionPanelBody}>
                          <label className={styles.actionLabel}>Novo responsável</label>
                          <select
                            value={novoResponsavelId}
                            onChange={(e) => setNovoResponsavelId(e.target.value)}
                            className={styles.actionSelect}
                          >
                            <option value="">Selecione um responsável</option>
                            {usuariosFiltradosPorSetor.map((usuario) => (
                              <option key={usuario.id} value={usuario.id}>
                                {usuario.nome}
                              </option>
                            ))}
                          </select>

                          <div className={styles.actionButtons}>
                            <button
                              className={styles.secondaryButton}
                              onClick={() => setAcaoAberta(null)}
                              disabled={salvandoAcao}
                            >
                              Cancelar
                            </button>
                            <button
                              className={styles.primaryButton}
                              onClick={confirmarAtribuicao}
                              disabled={salvandoAcao}
                            >
                              {salvandoAcao ? "Salvando..." : "Confirmar atribuição"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {acaoAberta === "encerrar" && (
                      <>
                        <div className={styles.actionPanelHeader}>
                          <h3 className={styles.actionPanelTitle}>Encerrar conversa</h3>
                          <button
                            className={styles.actionClose}
                            onClick={() => setAcaoAberta(null)}
                          >
                            Fechar
                          </button>
                        </div>

                        <div className={styles.actionPanelBody}>
                          <p className={styles.actionText}>
                            Tem certeza que deseja encerrar esta conversa?
                          </p>

                          <div className={styles.actionButtons}>
                            <button
                              className={styles.secondaryButton}
                              onClick={() => setAcaoAberta(null)}
                              disabled={salvandoAcao}
                            >
                              Cancelar
                            </button>
                            <button
                              className={styles.dangerButton}
                              onClick={confirmarEncerramento}
                              disabled={salvandoAcao}
                            >
                              {salvandoAcao ? "Encerrando..." : "Confirmar encerramento"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </header>

              <div className={styles.timelineWrapper}>
                <div ref={mensagensRef} className={styles.timelineArea}>
                  {loadingMensagens ? (
                    <div className={styles.timelineInfo}>Carregando mensagens...</div>
                  ) : mensagens.length === 0 ? (
                    <div className={styles.emptyTimelineCard}>
                      Nenhuma mensagem cadastrada nessa conversa ainda.
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
                        const isOutgoing = msg.origem === "enviada";

                        return (
                          <div
                            key={msg.id}
                            className={`${styles.messageRow} ${
                              isOutgoing
                                ? styles.messageRowOutgoing
                                : styles.messageRowIncoming
                            }`}
                          >
                            <div
                              className={`${styles.messageBubble} ${
                                isOutgoing
                                  ? styles.messageBubbleOutgoing
                                  : msg.origem === "automatica"
                                  ? styles.messageBubbleAutomatic
                                  : styles.messageBubbleIncoming
                              }`}
                            >
                              <div className={styles.messageMetaTop}>
                                <span className={styles.senderLabel}>
                                  {getRemetenteLabel(msg.remetente_tipo)}
                                </span>

                                {msg.origem === "automatica" && (
                                  <span className={styles.automaticBadge}>
                                    automática
                                  </span>
                                )}
                              </div>

                              <p className={styles.messageText}>{msg.conteudo}</p>

                              <div className={styles.messageMetaBottom}>
                                <span>{formatarHora(msg.created_at)}</span>

                                {isOutgoing && (
                                  <span
                                    className={`${styles.statusIcon} ${
                                      msg.status_envio === "lida"
                                        ? styles.statusIconRead
                                        : msg.status_envio === "falha"
                                        ? styles.statusIconError
                                        : styles.statusIconDefault
                                    }`}
                                    title={msg.status_envio}
                                  >
                                    {getStatusEnvioLabel(msg.status_envio)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={styles.composerArea}>
                  {mensagemSucesso && (
                    <div className={styles.successAlert}>{mensagemSucesso}</div>
                  )}

                  {erro && <div className={styles.errorAlert}>{erro}</div>}

                  <div className={styles.composerRow}>
                    <textarea
                      className={styles.messageInput}
                      rows={2}
                      value={conteudo}
                      onChange={(e) => setConteudo(e.target.value)}
                      onKeyDown={onKeyDownMensagem}
                      placeholder="Digite uma mensagem"
                    />

                    <button
                      onClick={enviarMensagem}
                      disabled={enviando || !conteudo.trim()}
                      className={styles.primaryButton}
                    >
                      {enviando ? "Enviando..." : "Enviar"}
                    </button>
                  </div>

                  <p className={styles.footerHint}>
                    Enter envia a mensagem • Shift + Enter quebra linha
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateCard}>
                <div className={styles.placeholderIcon}>📭</div>
                <h2 className={styles.emptyStateTitle}>Selecione uma conversa</h2>
                <p className={styles.emptyStateText}>
                  Escolha uma conversa na lateral para visualizar os detalhes e a
                  timeline de mensagens.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}