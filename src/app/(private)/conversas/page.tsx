"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
import styles from "./conversas.module.css";
import { can } from "@/lib/permissoes/frontend";

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

type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

type UsuarioOpcao = {
  id: string;
  nome: string;
  setor_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

type UsuarioLogado = {
  id: string;
  empresa_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  setor_principal_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

type PoliticaAtendimento = {
  permitir_transferir_sem_assumir?: boolean;
  permitir_transferir_para_mesmo_setor?: boolean;
  limpar_responsavel_ao_transferir?: boolean;
  voltar_fila_ao_transferir?: boolean;

  pode_transferir?: boolean;
  pode_reatribuir?: boolean;
  pode_atribuir?: boolean;
  pode_assumir?: boolean;

  permitir_assumir_conversa_em_fila?: boolean;
  permitir_assumir_conversa_sem_responsavel?: boolean;
  permitir_assumir_conversa_ja_atribuida?: boolean;

  exigir_mesmo_setor_para_reatribuicao?: boolean;
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

function getStatusLabel(status?: string | null) {
  if (!status) return "Sem status";

  switch (status) {
    case "aberta":
      return "Aberta";
    case "fila":
      return "Fila";
    case "bot":
      return "Bot";
    case "em_atendimento":
      return "Em atendimento";
    case "aguardando_cliente":
      return "Aguardando cliente";
    case "encerrada":
      return "Encerrada";
    default:
      return status;
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

function getIniciais(nome?: string | null) {
  const valor = nome?.trim() || "Contato";
  const partes = valor.split(" ").filter(Boolean);

  if (partes.length === 0) return "CT";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export default function ConversasPage() {
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);
  const [politicaAtendimento, setPoliticaAtendimento] =
    useState<PoliticaAtendimento | null>(null);

  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaSelecionada, setConversaSelecionada] =
    useState<Conversa | null>(null);

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
  const [assumindo, setAssumindo] = useState(false);
  const [infoExpandida, setInfoExpandida] = useState(false);

  const [acaoAberta, setAcaoAberta] = useState<
    null | "transferir" | "atribuir" | "encerrar"
  >(null);
  const [novoSetorId, setNovoSetorId] = useState("");
  const [novoResponsavelId, setNovoResponsavelId] = useState("");
  const [salvandoAcao, setSalvandoAcao] = useState(false);

  const mensagensRef = useRef<HTMLDivElement | null>(null);

  async function carregarUsuarioLogado() {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar usuário logado");
        return;
      }

      setUsuarioLogado(data.usuario || null);
    } catch {
      setErro("Erro ao carregar usuário logado");
    }
  }

  async function carregarPoliticaAtendimento() {
    try {
      const res = await fetch("/api/me/politica", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        return;
      }

      setPoliticaAtendimento(data.politica || null);
    } catch {}
  }

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

  async function carregarUsuariosPorSetor(setorId: string) {
    try {
      const res = await fetch(
        `/api/usuarios/opcoes-atribuicao?setor_id=${setorId}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        setUsuarios([]);
        return;
      }

      setUsuarios(data.usuarios || []);
    } catch {
      setUsuarios([]);
    }
  }

  async function assumirConversa() {
    if (!conversaSelecionada?.id) return;

    try {
      setAssumindo(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/assumir`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao assumir conversa");
        return;
      }

      setMensagemSucesso(data.message || "Conversa assumida com sucesso.");
      setAcaoAberta(null);

      await carregarConversas();
      await carregarMensagens(conversaSelecionada.id, true);
    } catch {
      setErro("Erro ao assumir conversa");
    } finally {
      setAssumindo(false);
    }
  }

  async function enviarMensagem() {
    setMensagemSucesso("");
    setErro("");

    if (!conversaSelecionada?.id) {
      setErro("Selecione uma conversa.");
      return;
    }

    if (!podeEnviarMensagem) {
      setErro("Você não pode enviar mensagem nesta conversa.");
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
    if (!conversaSelecionada?.id) return;

    if (!novoSetorId) {
      setErro("Selecione um setor.");
      return;
    }

    try {
      setSalvandoAcao(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(
        `/api/conversas/${conversaSelecionada.id}/transferir`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            setor_id: novoSetorId,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao transferir conversa");
        return;
      }

      setMensagemSucesso(data.message || "Conversa transferida com sucesso.");
      setAcaoAberta(null);

      await carregarConversas();
      await carregarMensagens(conversaSelecionada.id, true);
    } catch {
      setErro("Erro ao transferir conversa");
    } finally {
      setSalvandoAcao(false);
    }
  }

  async function confirmarAtribuicao() {
    if (!novoResponsavelId || !conversaSelecionada?.id) {
      setErro("Selecione um responsável.");
      return;
    }

    try {
      setSalvandoAcao(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(
        `/api/conversas/${conversaSelecionada.id}/atribuir`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            responsavel_id: novoResponsavelId,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atribuir responsável");
        return;
      }

      setMensagemSucesso(data.message || "Responsável atribuído com sucesso.");
      setAcaoAberta(null);

      await carregarConversas();
      await carregarMensagens(conversaSelecionada.id, true);
    } catch {
      setErro("Erro ao atribuir responsável");
    } finally {
      setSalvandoAcao(false);
    }
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
    setNovoSetorId(
      conversaSelecionada?.setor_id || conversaSelecionada?.setores?.id || ""
    );
    setAcaoAberta("transferir");
  }

  async function abrirAtribuir() {
    setErro("");
    setMensagemSucesso("");

    const setorAtual =
      conversaSelecionada?.setor_id || conversaSelecionada?.setores?.id || "";

    setNovoResponsavelId(
      conversaSelecionada?.responsavel_id ||
        conversaSelecionada?.responsavel?.id ||
        ""
    );

    setAcaoAberta("atribuir");

    if (setorAtual) {
      await carregarUsuariosPorSetor(setorAtual);
    } else {
      setUsuarios([]);
    }
  }

  function abrirEncerrar() {
    setErro("");
    setMensagemSucesso("");
    setAcaoAberta("encerrar");
  }

  function onKeyDownMensagem(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!enviando && podeEnviarMensagem) {
        enviarMensagem();
      }
    }
  }

  function rolarParaFinal() {
    const el = mensagensRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  const conversaSetorId =
    conversaSelecionada?.setor_id || conversaSelecionada?.setores?.id || null;

  const conversaResponsavelId =
    conversaSelecionada?.responsavel_id ||
    conversaSelecionada?.responsavel?.id ||
    null;

  const permissoes = usuarioLogado?.permissoes || [];
  const usuarioId = usuarioLogado?.id || null;

  const usuarioSetoresIds = useMemo(() => {
    if (!usuarioLogado) return [];

    const idsDiretos = Array.isArray(usuarioLogado.setores_ids)
      ? usuarioLogado.setores_ids
      : [];

    const idsViaVinculo = Array.isArray(usuarioLogado.usuarios_setores)
      ? usuarioLogado.usuarios_setores.map((item) => item.setor_id)
      : [];

    return Array.from(new Set([...idsDiretos, ...idsViaVinculo].filter(Boolean)));
  }, [usuarioLogado]);

  const nomesPerfisDinamicos = Array.isArray(usuarioLogado?.perfis_dinamicos)
    ? usuarioLogado.perfis_dinamicos.map((perfil) => perfil.nome)
    : [];

  const ehAdministrador = nomesPerfisDinamicos.includes("Administrador");

  const podeAssumirPermissao = can(permissoes, "conversas.assumir");
  const podeTransferirPermissao = can(permissoes, "conversas.transferir");
  const podeAtribuirPermissao = can(permissoes, "conversas.atribuir");
  const podeEncerrarPermissao = can(permissoes, "conversas.encerrar");
  const podeEnviarMensagemPermissao = can(permissoes, "mensagens.enviar");

  const conversaEhMinha = !!usuarioId && conversaResponsavelId === usuarioId;
  const conversaEhDeUmDosMeusSetores =
    !!conversaSetorId && usuarioSetoresIds.includes(conversaSetorId);
  const conversaEncerrada = conversaSelecionada?.status === "encerrada";
  const conversaNaFila = conversaSelecionada?.status === "fila";
  const conversaSemResponsavel = !conversaResponsavelId;

  const politicaPodeAssumir = politicaAtendimento?.pode_assumir ?? true;
  const politicaPermiteAssumirEmFila =
    politicaAtendimento?.permitir_assumir_conversa_em_fila ?? true;
  const politicaPermiteAssumirSemResponsavel =
    politicaAtendimento?.permitir_assumir_conversa_sem_responsavel ?? true;
  const politicaPermiteAssumirJaAtribuida =
    politicaAtendimento?.permitir_assumir_conversa_ja_atribuida ?? false;

  const conversaJaAtribuidaParaOutroUsuario =
    !!conversaResponsavelId && !!usuarioId && conversaResponsavelId !== usuarioId;

  const regraStatusParaAssumir =
    (conversaNaFila && politicaPermiteAssumirEmFila) ||
    (!conversaNaFila && politicaPermiteAssumirJaAtribuida);

  const regraResponsavelParaAssumir =
    (conversaSemResponsavel && politicaPermiteAssumirSemResponsavel) ||
    conversaJaAtribuidaParaOutroUsuario ||
    conversaEhMinha;

  const podeAssumirConversa =
    !!conversaSelecionada &&
    !!usuarioLogado &&
    !conversaEncerrada &&
    politicaPodeAssumir &&
    (ehAdministrador ||
      (podeAssumirPermissao &&
        conversaEhDeUmDosMeusSetores &&
        regraStatusParaAssumir &&
        regraResponsavelParaAssumir));

  const podeAtribuir =
    !!conversaSelecionada &&
    !!usuarioLogado &&
    !conversaEncerrada &&
    (ehAdministrador ||
      (podeAtribuirPermissao && conversaEhDeUmDosMeusSetores));

  const podeTransferir =
    !!conversaSelecionada &&
    !!usuarioLogado &&
    !conversaEncerrada &&
    (ehAdministrador ||
      (podeTransferirPermissao &&
        (conversaEhDeUmDosMeusSetores || conversaEhMinha)));

  const podeEncerrar =
    !!conversaSelecionada &&
    !!usuarioLogado &&
    !conversaEncerrada &&
    (ehAdministrador ||
      (podeEncerrarPermissao &&
        (conversaEhDeUmDosMeusSetores || conversaEhMinha)));

  const podeEnviarMensagem =
    !!conversaSelecionada &&
    !!usuarioLogado &&
    !conversaEncerrada &&
    (ehAdministrador ||
      (podeEnviarMensagemPermissao &&
        (conversaEhDeUmDosMeusSetores || conversaEhMinha)));

  const setoresDisponiveisParaTransferencia = useMemo(() => {
    if (ehAdministrador) {
      return setores;
    }

    return setores.filter((setor) => usuarioSetoresIds.includes(setor.id));
  }, [setores, ehAdministrador, usuarioSetoresIds]);

  const usuariosFiltradosPorSetor = useMemo(() => {
    if (acaoAberta !== "atribuir") return [];
    return usuarios;
  }, [usuarios, acaoAberta]);

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
    carregarUsuarioLogado();
    carregarPoliticaAtendimento();
    carregarConversas();
    carregarSetores();
  }, []);

  useEffect(() => {
    if (!conversaSelecionada?.id) {
      setMensagens([]);
      return;
    }

    setInfoExpandida(false);
    carregarMensagens(conversaSelecionada.id);
  }, [conversaSelecionada?.id]);

  /*
  useEffect(() => {
    if (!conversaSelecionada?.id) return;

    const interval = setInterval(() => {
      carregarMensagens(conversaSelecionada.id, true);
      carregarConversas();
    }, 4000);

    return () => clearInterval(interval);
  }, [conversaSelecionada?.id]);
  */

  useEffect(() => {
    rolarParaFinal();
  }, [mensagens, loadingMensagens]);

  return (
    <CrmShell>
      <Header
        title="Conversas"
        subtitle="Central operacional de atendimento com fila, timeline e ações de gestão."
      />

      <div className={styles.pageContent}>
        <div className={styles.chatLayout}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <div className={styles.sidebarHeaderTop}>
                <div>
                  <p className={styles.sidebarEyebrow}>Atendimento</p>
                  <h2 className={styles.sidebarTitle}>Fila de conversas</h2>
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
                  <option value="fila">Fila</option>
                  <option value="bot">Bot</option>
                  <option value="em_atendimento">Em atendimento</option>
                  <option value="aguardando_cliente">Aguardando cliente</option>
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
                        <div className={styles.conversationAvatar}>
                          {getIniciais(c.contatos?.nome)}
                        </div>

                        <div className={styles.conversationIdentity}>
                          <div className={styles.conversationNameRow}>
                            <p className={styles.contactName}>
                              {c.contatos?.nome || "Sem nome"}
                            </p>
                            <span className={styles.timeLabel}>
                              {formatarHora(c.last_message_at)}
                            </span>
                          </div>

                          <p className={styles.contactPhone}>
                            {c.contatos?.telefone || "Sem telefone"}
                          </p>
                        </div>
                      </div>

                      <p className={styles.subjectLine}>
                        {c.assunto || "Sem assunto"}
                      </p>

                      <div className={styles.metaRow}>
                        <span className={styles.metaChip}>
                          {c.setores?.nome || "Sem setor"}
                        </span>
                        <span className={styles.metaChip}>
                          {c.responsavel?.nome || "Sem responsável"}
                        </span>
                      </div>

                      <div className={styles.metaRowBottom}>
                        <span className={styles.channelBadge}>
                          {getCanalLabel(c.canal)}
                        </span>

                        <span
                          className={`${styles.statusBadge} ${
                            c.status === "aberta"
                              ? styles.statusOpen
                              : c.status === "fila"
                              ? styles.statusWaiting
                              : c.status === "em_atendimento"
                              ? styles.statusInProgress
                              : c.status === "aguardando_cliente"
                              ? styles.statusWaiting
                              : styles.statusClosed
                          }`}
                        >
                          {getStatusLabel(c.status)}
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
                      {podeAssumirConversa && (
                        <button
                          className={styles.primaryButton}
                          onClick={assumirConversa}
                          disabled={assumindo}
                        >
                          {assumindo ? "Assumindo..." : "Assumir"}
                        </button>
                      )}

                      {podeTransferir && (
                        <button className={styles.secondaryButton} onClick={abrirTransferir}>
                          Transferir
                        </button>
                      )}

                      {podeAtribuir && (
                        <button className={styles.secondaryButton} onClick={abrirAtribuir}>
                          Atribuir
                        </button>
                      )}

                      {podeEncerrar && (
                        <button className={styles.dangerButton} onClick={abrirEncerrar}>
                          Encerrar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.infoSummaryBar}>
                    <div className={styles.infoSummaryText}>
                      <span className={styles.infoSummaryItem}>
                        <strong>Assunto:</strong>{" "}
                        {conversaSelecionada.assunto || "Sem assunto"}
                      </span>
                      <span className={styles.infoSummaryItem}>
                        <strong>Canal:</strong>{" "}
                        {getCanalLabel(conversaSelecionada.canal)}
                      </span>
                      <span className={styles.infoSummaryItem}>
                        <strong>Status:</strong>{" "}
                        {getStatusLabel(conversaSelecionada.status)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.infoToggleButton}
                      onClick={() => setInfoExpandida((prev) => !prev)}
                    >
                      {infoExpandida ? "Minimizar" : "Expandir"}
                    </button>
                  </div>

                  {infoExpandida && (
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
                  )}

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
                              {setoresDisponiveisParaTransferencia.map((setor) => (
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

                    {!podeEnviarMensagem && conversaSelecionada.status !== "encerrada" && (
                      <div className={styles.timelineInfo}>
                        Você só poderá responder quando a conversa estiver sob sua responsabilidade.
                      </div>
                    )}

                    {conversaSelecionada.status === "encerrada" && (
                      <div className={styles.timelineInfo}>
                        Esta conversa está encerrada e não aceita novas mensagens.
                      </div>
                    )}

                    <div className={styles.composerRow}>
                      <textarea
                        className={styles.messageInput}
                        rows={2}
                        value={conteudo}
                        onChange={(e) => setConteudo(e.target.value)}
                        onKeyDown={onKeyDownMensagem}
                        placeholder={
                          podeEnviarMensagem
                            ? "Digite uma mensagem"
                            : "Você não pode responder esta conversa"
                        }
                        disabled={!podeEnviarMensagem || enviando}
                      />

                      <button
                        onClick={enviarMensagem}
                        disabled={enviando || !conteudo.trim() || !podeEnviarMensagem}
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
      </div>
    </CrmShell>
  );
}