"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  started_at?: string | null;
  created_at?: string | null;
  protocolo?: string | null;
  ultima_mensagem?: string | null;
  unread_count?: number | null;
  setor_id?: string | null;
  responsavel_id?: string | null;
  favorita?: boolean;
  listas?: {
    id: string;
    nome: string;
  }[];

  contatos: {
    nome: string | null;
    telefone: string;
    email?: string | null;
    empresa?: string | null;
    tags?: string[] | null;
    observacoes?: string | null;
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
  favorita?: boolean;
  metadata_json?: {
    tipo_original_whatsapp?: string | null;
    media_id?: string | null;
    mime_type?: string | null;
    sha256?: string | null;
    caption?: string | null;
    filename?: string | null;
    url?: string | null;
    voice?: boolean | null;
    contacts?: Array<{
      name?: {
        formatted_name?: string;
        first_name?: string;
        last_name?: string;
      };
      phones?: Array<{
        phone?: string;
        wa_id?: string;
        type?: string;
      }>;
      emails?: Array<{
        email?: string;
        type?: string;
      }>;
      addresses?: Array<{
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
        country_code?: string;
        type?: string;
      }>;
      org?: {
        company?: string;
        department?: string;
        title?: string;
      };
    }> | null;
  } | null;
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

type ListaConversa = {
  id: string;
  nome: string;
  marcada: boolean;
};

type ListaEmpresa = {
  id: string;
  nome: string;
};


type AbaPainelDireito =
  | "detalhes"
  | "contato"
  | "historico"
  | "notas"
  | "mensagens_favoritas"
  | "listas";

type NotaConversa = {
  id: string;
  empresa_id: string;
  conversa_id: string;
  autor_id: string;
  conteudo: string;
  created_at: string;
  updated_at: string;
  autor?: {
    id: string;
    nome: string | null;
    email: string | null;
  } | null;
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
      return "Você";
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

function formatarTempoRelativo(data?: string | null) {
  if (!data) return "—";

  const agora = Date.now();
  const referencia = new Date(data).getTime();

  if (Number.isNaN(referencia)) return "—";

  const diffMs = Math.max(agora - referencia, 0);
  const minutos = Math.floor(diffMs / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (dias > 0) return `${dias}d`;
  if (horas > 0) return `${horas}h`;
  return `${Math.max(minutos, 1)}min`;
}

function getSlaNivel(conversa?: Conversa | null) {
  if (!conversa?.last_message_at) return "ok";

  const diffMin =
    (Date.now() - new Date(conversa.last_message_at).getTime()) / 60000;

  if (diffMin >= 240) return "critico";
  if (diffMin >= 60) return "alerta";
  return "ok";
}

function getPreviewConversa(conversa: Conversa) {
  return (
    conversa.ultima_mensagem?.trim() ||
    conversa.assunto?.trim() ||
    conversa.contatos?.telefone ||
    "Sem prévia"
  );
}

function getSharedContactName(msg: Mensagem) {
  const primeiro = msg.metadata_json?.contacts?.[0];
  if (!primeiro) return "Contato compartilhado";

  return (
    primeiro.name?.formatted_name ||
    [primeiro.name?.first_name, primeiro.name?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Contato compartilhado"
  );
}

function getSharedContactPhones(msg: Mensagem) {
  const primeiro = msg.metadata_json?.contacts?.[0];
  return primeiro?.phones || [];
}

function getSharedContactEmails(msg: Mensagem) {
  const primeiro = msg.metadata_json?.contacts?.[0];
  return primeiro?.emails || [];
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
  const [statusFiltro, setStatusFiltro] = useState("Tudo");
  const [canalFiltro, setCanalFiltro] = useState("todos");
  const [setorFiltro, setSetorFiltro] = useState("todos");
  const [responsavelFiltro, setResponsavelFiltro] = useState("todos");
  const [chipRapido, setChipRapido] = useState<
    "Tudo" | "minhas" | "favoritos" | "fila" | "nao_lidas" | "sem_responsavel" | "urgentes"
  >("Tudo");

  const [conteudo, setConteudo] = useState("");
  const [loadingConversas, setLoadingConversas] = useState(false);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagemSucesso, setMensagemSucesso] = useState("");
  const [assumindo, setAssumindo] = useState(false);
  const [infoExpandida, setInfoExpandida] = useState(false);

  const [painelDireitoAberto, setPainelDireitoAberto] = useState(false);
  const [abaPainelDireito, setAbaPainelDireito] =
    useState<AbaPainelDireito>("contato");

  const [acaoAberta, setAcaoAberta] = useState<
    null | "transferir" | "atribuir" | "encerrar"
  >(null);
  const [novoSetorId, setNovoSetorId] = useState("");
  const [novoResponsavelId, setNovoResponsavelId] = useState("");
  const [salvandoAcao, setSalvandoAcao] = useState(false);

  const mensagensRef = useRef<HTMLDivElement | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [menuContatoAberto, setMenuContatoAberto] = useState(false);
  const menuContatoRef = useRef<HTMLDivElement | null>(null);
  const mensagensFavoritas = useMemo(() => {
    return mensagens.filter((msg) => msg.favorita);
  }, [mensagens]);
  const impedirAutoScrollRef = useRef(false);

  const quantidadeMensagensFavoritas = useMemo(() => {
    return mensagens.filter((msg) => msg.favorita).length;
  }, [mensagens]);

  const [listasConversa, setListasConversa] = useState<ListaConversa[]>([]);
  const [novaListaNome, setNovaListaNome] = useState("");
  const [salvandoLista, setSalvandoLista] = useState(false);

  const [listasEmpresa, setListasEmpresa] = useState<ListaEmpresa[]>([]);

  const [listaFiltroId, setListaFiltroId] = useState<string | null>(null);
    
  const [listaEditandoId, setListaEditandoId] = useState<string | null>(null);
  const [listaEditandoNome, setListaEditandoNome] = useState("");
  const [listaConfirmandoExclusaoId, setListaConfirmandoExclusaoId] = useState<string | null>(null);

  const [notaInterna, setNotaInterna] = useState("");
  const [notasConversa, setNotasConversa] = useState<NotaConversa[]>([]);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [notaEditandoId, setNotaEditandoId] = useState<string | null>(null);
  const [notaEditandoTexto, setNotaEditandoTexto] = useState("");

  function renderizarConteudoMensagem(msg: Mensagem) {
    const url = msg.metadata_json?.url || null;
    const caption = msg.metadata_json?.caption || null;
    const fileName = msg.metadata_json?.filename || "documento";
    const contatoNome = getSharedContactName(msg);
    const contatoTelefones = getSharedContactPhones(msg);
    const contatoEmails = getSharedContactEmails(msg);

    if (msg.tipo_mensagem === "imagem") {
      return (
        <div>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              <img
                src={url}
                alt={caption || "Imagem recebida"}
                style={{
                  maxWidth: "260px",
                  width: "100%",
                  borderRadius: "12px",
                  display: "block",
                  marginBottom: caption ? "8px" : "0",
                }}
              />
            </a>
          ) : (
            <p className={styles.messageText}>{msg.conteudo}</p>
          )}

          {caption && <p className={styles.messageText}>{caption}</p>}
        </div>
      );
    }

    if (msg.tipo_mensagem === "audio") {
      return (
        <div>
          {url ? (
            <audio controls preload="none" style={{ maxWidth: "260px", width: "100%" }}>
              <source src={url} type={msg.metadata_json?.mime_type || "audio/mpeg"} />
              Seu navegador não suporta áudio.
            </audio>
          ) : (
            <p className={styles.messageText}>{msg.conteudo}</p>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "video") {
      return (
        <div>
          {url ? (
            <video
              controls
              preload="metadata"
              style={{
                maxWidth: "260px",
                width: "100%",
                borderRadius: "12px",
                display: "block",
                marginBottom: caption ? "8px" : "0",
              }}
            >
              <source src={url} type={msg.metadata_json?.mime_type || "video/mp4"} />
              Seu navegador não suporta vídeo.
            </video>
          ) : (
            <p className={styles.messageText}>{msg.conteudo}</p>
          )}

          {caption && <p className={styles.messageText}>{caption}</p>}
        </div>
      );
    }

    if (msg.tipo_mensagem === "documento") {
      return (
        <div>
          <p className={styles.messageText}>📄 {fileName}</p>

          {caption && <p className={styles.messageText}>{caption}</p>}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "14px",
                textDecoration: "underline",
                wordBreak: "break-word",
              }}
            >
              Abrir documento
            </a>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "contato") {
      return (
        <div>
          <p className={styles.messageText}>👤 {contatoNome}</p>

          {contatoTelefones.map((telefone, index) => (
            <p key={`tel-${index}`} className={styles.messageText}>
              {telefone.phone || telefone.wa_id || "Telefone não informado"}
            </p>
          ))}

          {contatoEmails.map((email, index) => (
            <p key={`email-${index}`} className={styles.messageText}>
              {email.email || "E-mail não informado"}
            </p>
          ))}
        </div>
      );
    }

    return <p className={styles.messageText}>{msg.conteudo}</p>;
  }

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

      if (!res.ok) return;

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

  async function atualizarConversa(
    payload: Record<string, unknown>,
    sucesso: string
  ) {
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

  async function reabrirConversa() {
    await atualizarConversa({ status: "aberta" }, "Conversa reaberta com sucesso.");
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

  async function alternarFavorito() {
    if (!conversaSelecionada?.id) return;

    try {
      setErro("");
      setMensagemSucesso("");

      const favoritaAtual = !!conversaSelecionada.favorita;

      const res = await fetch(
        `/api/conversas/${conversaSelecionada.id}/favorito`,
        {
          method: favoritaAtual ? "DELETE" : "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar favorito");
        return;
      }

      setMensagemSucesso(
        data.message ||
          (favoritaAtual
            ? "Conversa removida dos favoritos."
            : "Conversa adicionada aos favoritos.")
      );

      await carregarConversas();

      if (conversaSelecionada?.id) {
        await carregarMensagens(conversaSelecionada.id, true);
      }
    } catch {
      setErro("Erro ao atualizar favorito");
    }
  }

  async function alternarMensagemFavorita(mensagem: Mensagem) {
    try {
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/mensagens/${mensagem.id}/favorito`, {
        method: mensagem.favorita ? "DELETE" : "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar favorito da mensagem");
        return;
      }

      if (conversaSelecionada?.id) {
        impedirAutoScrollRef.current = true;
        await carregarMensagens(conversaSelecionada.id, true);
      }
    } catch {
      setErro("Erro ao atualizar favorito da mensagem");
    }
  }

  async function carregarListasDaConversa() {
    if (!conversaSelecionada?.id) return;

    try {
      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/listas`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar listas");
        return;
      }

      setListasConversa(data.listas || []);
    } catch {
      setErro("Erro ao carregar listas");
    }
  }

  async function carregarListasEmpresa() {
    try {
      const res = await fetch("/api/conversas/listas", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar listas");
        return;
      }

      setListasEmpresa(data.listas || []);
    } catch {
      setErro("Erro ao carregar listas");
    }
  }

  async function carregarNotasDaConversa() {
    if (!conversaSelecionada?.id) return;

    try {
      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/notas`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar notas");
        return;
      }

      setNotasConversa(data.notas || []);
    } catch {
      setErro("Erro ao carregar notas");
    }
  }

  async function salvarNovaNota() {
    if (!conversaSelecionada?.id) return;
    if (!notaInterna.trim()) {
      setErro("Digite uma nota.");
      return;
    }

    try {
      setSalvandoNota(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/notas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conteudo: notaInterna.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar nota");
        return;
      }

      setNotaInterna("");
      setMensagemSucesso(data.message || "Nota criada com sucesso");
      await carregarNotasDaConversa();
    } catch {
      setErro("Erro ao salvar nota");
    } finally {
      setSalvandoNota(false);
    }
  }

  async function atualizarNota() {
    if (!conversaSelecionada?.id || !notaEditandoId) return;
    if (!notaEditandoTexto.trim()) {
      setErro("Digite o conteúdo da nota.");
      return;
    }

    try {
      setSalvandoNota(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/notas`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nota_id: notaEditandoId,
          conteudo: notaEditandoTexto.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar nota");
        return;
      }

      setMensagemSucesso(data.message || "Nota atualizada com sucesso");
      setNotaEditandoId(null);
      setNotaEditandoTexto("");
      await carregarNotasDaConversa();
    } catch {
      setErro("Erro ao atualizar nota");
    } finally {
      setSalvandoNota(false);
    }
  }

  async function excluirNota(notaId: string) {
    if (!conversaSelecionada?.id) return;

    const confirmou = window.confirm("Deseja excluir esta nota?");
    if (!confirmou) return;

    try {
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/notas`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nota_id: notaId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao excluir nota");
        return;
      }

      setMensagemSucesso(data.message || "Nota excluída com sucesso");
      await carregarNotasDaConversa();
    } catch {
      setErro("Erro ao excluir nota");
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

  function scrollParaMensagem(mensagemId: string) {
    const elemento = document.getElementById(`mensagem-${mensagemId}`);

    if (!elemento) return;

    elemento.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    elemento.classList.remove(styles.messageHighlight);
    void elemento.offsetWidth;
    elemento.classList.add(styles.messageHighlight);

    window.setTimeout(() => {
      elemento.classList.remove(styles.messageHighlight);
    }, 1800);
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
    conversaJaAtribuidaParaOutroUsuario;

  const podeAssumirConversa =
    !!conversaSelecionada &&
    !!usuarioLogado &&
    !conversaEncerrada &&
    !conversaEhMinha &&
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

  const setoresUnicos = useMemo(() => {
    return Array.from(
      new Map(
        conversas
          .filter((c) => c.setores?.id && c.setores?.nome)
          .map((c) => [c.setores?.id, { id: c.setores!.id!, nome: c.setores!.nome }])
      ).values()
    );
  }, [conversas]);

  const responsaveisUnicos = useMemo(() => {
    return Array.from(
      new Map(
        conversas
          .filter((c) => c.responsavel?.id && c.responsavel?.nome)
          .map((c) => [
            c.responsavel?.id,
            { id: c.responsavel!.id!, nome: c.responsavel!.nome },
          ])
      ).values()
    );
  }, [conversas]);

  const conversasFiltradas = useMemo(() => {
    let lista = [...conversas];

    if (statusFiltro !== "Tudo") {
      lista = lista.filter((c) => c.status === statusFiltro);
    }

    if (canalFiltro !== "todos") {
      lista = lista.filter((c) => (c.canal || "") === canalFiltro);
    }

    if (setorFiltro !== "todos") {
      lista = lista.filter((c) => (c.setores?.id || "") === setorFiltro);
    }

    if (responsavelFiltro !== "todos") {
      lista = lista.filter((c) => (c.responsavel?.id || "") === responsavelFiltro);
    }

    if (chipRapido === "minhas" && usuarioId) {
      lista = lista.filter((c) => {
        const responsavelAtual =
          c.responsavel_id || c.responsavel?.id || null;
        return responsavelAtual === usuarioId;
      });
    }

    if (chipRapido === "favoritos") {
      lista = lista.filter((c) => c.favorita === true);
    }

    if (chipRapido === "fila") {
      lista = lista.filter((c) => c.status === "fila");
    }

    if (chipRapido === "nao_lidas") {
      lista = lista.filter((c) => (c.unread_count || 0) > 0);
    }

    if (chipRapido === "sem_responsavel") {
      lista = lista.filter((c) => !c.responsavel_id && !c.responsavel?.id);
    }

    if (chipRapido === "urgentes") {
      lista = lista.filter((c) => c.prioridade === "urgente" || c.prioridade === "alta");
    }

    if (listaFiltroId) {
      lista = lista.filter((c) =>
        Array.isArray(c.listas) &&
        c.listas.some((item) => item.id === listaFiltroId)
      );
    }

    if (busca.trim()) {
      const termo = busca.toLowerCase();

      lista = lista.filter((c) => {
        const nome = c.contatos?.nome?.toLowerCase() || "";
        const telefone = c.contatos?.telefone?.toLowerCase() || "";
        const assunto = c.assunto?.toLowerCase() || "";
        const protocolo = c.protocolo?.toLowerCase() || "";
        const preview = getPreviewConversa(c).toLowerCase();

        return (
          nome.includes(termo) ||
          telefone.includes(termo) ||
          assunto.includes(termo) ||
          protocolo.includes(termo) ||
          preview.includes(termo)
        );
      });
    }

    lista.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    return lista;
  }, [
    conversas,
    busca,
    statusFiltro,
    canalFiltro,
    setorFiltro,
    responsavelFiltro,
    chipRapido,
    usuarioId,
  ]);

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

  const historicoExemplo = useMemo(() => {
    if (!conversaSelecionada) return [];

    return [
      {
        titulo: "Atendimento anterior",
        descricao:
          conversaSelecionada.setores?.nome
            ? `Última passagem registrada no setor ${conversaSelecionada.setores.nome}.`
            : "Sem setor anterior identificado.",
      },
      {
        titulo: "Último responsável",
        descricao:
          conversaSelecionada.responsavel?.nome || "Sem responsável anterior identificado.",
      },
      {
        titulo: "Última atividade",
        descricao: formatarDataCompleta(conversaSelecionada.last_message_at),
      },
    ];
  }, [conversaSelecionada]);

  const alertaSemResponsavel = !!conversaSelecionada && !conversaResponsavelId;
  const alertaClienteAguardando =
    conversaSelecionada?.status === "aguardando_cliente";
  const alertaPrioridadeAlta =
    conversaSelecionada?.prioridade === "alta" ||
    conversaSelecionada?.prioridade === "urgente";

  const alertaParadaMuitoTempo = useMemo(() => {
    if (!conversaSelecionada?.last_message_at) return false;

    const diffMin =
      (Date.now() - new Date(conversaSelecionada.last_message_at).getTime()) / 60000;

    return diffMin >= 120;
  }, [conversaSelecionada?.last_message_at]);

  const slaNivel = getSlaNivel(conversaSelecionada);

  const quantidadeNotas = notasConversa.length;
  const conversaTemNotas = quantidadeNotas > 0;
  

  useEffect(() => {
    carregarUsuarioLogado();
    carregarPoliticaAtendimento();
    carregarConversas();
    carregarSetores();
    carregarListasEmpresa();
  }, []);

  useEffect(() => {
    if (!conversaSelecionada?.id) {
      setMensagens([]);
      return;
    }

    setInfoExpandida(false);
    setAbaPainelDireito("contato");
    setMenuContatoAberto(false);
    carregarMensagens(conversaSelecionada.id);
    carregarNotasDaConversa();
    setNotasConversa([]);
    setNotaInterna("");
    setNotaEditandoId(null);
    setNotaEditandoTexto("");
  }, [conversaSelecionada?.id]);

  useEffect(() => {
    if (impedirAutoScrollRef.current) {
      impedirAutoScrollRef.current = false;
      return;
    }

    rolarParaFinal();
  }, [mensagens, loadingMensagens]);

  useEffect(() => {
  function handleClickOutside(event: MouseEvent) {
    if (!menuContatoRef.current) return;

    const target = event.target as Node;

    if (!menuContatoRef.current.contains(target)) {
      setMenuContatoAberto(false);
    }
  }

  document.addEventListener("mousedown", handleClickOutside);

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);


  return (
    <>
      <Header
        title="Conversas"
        subtitle="Atendimento com visual mais limpo, foco na operação e contexto do contato."
      />

      <div className={styles.pageContent}>
        <div
          className={`${styles.chatLayout} ${
            painelDireitoAberto ? styles.chatLayoutWithPanel : ""
          }`}
        >
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <div className={styles.sidebarTopRow}>
                <div>
                  <h2 className={styles.sidebarTitle}>Conversas</h2>
                  <p className={styles.sidebarCount}>
                    {conversasFiltradas.length} conversa(s)
                  </p>
                </div>

                <div className={styles.sidebarHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setFiltrosAbertos((prev) => !prev)}
                    className={styles.iconButton}
                  >
                    {filtrosAbertos ? "Ocultar filtros" : "Mostrar filtros"}
                  </button>

                  <button
                    type="button"
                    onClick={carregarConversas}
                    className={styles.iconButton}
                  >
                    Atualizar
                  </button>
                </div>
              </div>

              <input
                placeholder="Buscar por nome, telefone, assunto ou protocolo"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={styles.searchInput}
              />

              {filtrosAbertos && (
                <>
                  <div className={styles.filtersGrid}>
                    <select
                      value={statusFiltro}
                      onChange={(e) => setStatusFiltro(e.target.value)}
                      className={styles.filterSelect}
                    >
                      <option value="Tudo">Tudo</option>
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

                    <select
                      value={setorFiltro}
                      onChange={(e) => setSetorFiltro(e.target.value)}
                      className={styles.filterSelect}
                    >
                      <option value="todos">Todos os setores</option>
                      {setoresUnicos.map((setor) => (
                        <option key={setor.id} value={setor.id}>
                          {setor.nome}
                        </option>
                      ))}
                    </select>

                    <select
                      value={responsavelFiltro}
                      onChange={(e) => setResponsavelFiltro(e.target.value)}
                      className={styles.filterSelect}
                    >
                      <option value="todos">Todos os responsáveis</option>
                      {responsaveisUnicos.map((responsavel) => (
                        <option key={responsavel.id} value={responsavel.id}>
                          {responsavel.nome}
                        </option>
                      ))}
                    </select>

                    <button
                      className={`${styles.quickChip} ${
                        chipRapido === "fila" ? styles.quickChipActive : ""
                      }`}
                      onClick={() => setChipRapido("fila")}
                    >
                      Fila
                    </button>

                    <button
                      className={`${styles.quickChip} ${
                        chipRapido === "sem_responsavel" ? styles.quickChipActive : ""
                      }`}
                      onClick={() => setChipRapido("sem_responsavel")}
                    >
                      Sem responsável
                    </button>

                    <button
                      className={`${styles.quickChip} ${
                        chipRapido === "urgentes" ? styles.quickChipActive : ""
                      }`}
                      onClick={() => setChipRapido("urgentes")}
                    >
                      Urgentes
                    </button>
                  </div>
                </>
              )}
              
              <div className={styles.quickFilters}>
                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "Tudo" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => setChipRapido("Tudo")}
                >
                  Tudo
                </button>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "minhas" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => setChipRapido("minhas")}
                >
                  Minhas
                </button>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "favoritos" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => setChipRapido("favoritos")}
                >
                  Favoritos
                </button>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "nao_lidas" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => setChipRapido("nao_lidas")}
                >
                  Não lidas
                </button>     

                {listasEmpresa.map((lista) => (
                  <button
                    key={lista.id}
                    className={`${styles.quickChip} ${
                      listaFiltroId === lista.id ? styles.quickChipActive : ""
                    }`}
                    onClick={() => {
                      setListaFiltroId((atual) => (atual === lista.id ? null : lista.id));
                      setChipRapido("Tudo");
                    }}
                  >
                    {lista.nome}
                  </button>
                ))}          
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
                  const unreadCount = c.unread_count || 0;

                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setMensagemSucesso("");
                        setErro("");
                        setConversaSelecionada(c);
                      }}
                      className={`${styles.conversationItem} ${
                        ativo ? styles.conversationItemActive : ""
                      }`}
                    >
                      <div className={styles.conversationAvatar}>
                        {getIniciais(c.contatos?.nome)}
                      </div>

                      <div className={styles.conversationMain}>
                        <div className={styles.conversationTopLine}>
                          <p className={styles.contactName}>
                            {c.favorita && (
                              <span className={styles.favoriteStarInline} title="Conversa favorita">
                                ★
                              </span>
                            )}
                            {c.contatos?.nome || "Sem nome"}
                          </p>

                          <span className={styles.timeLabel}>
                            {formatarHora(c.last_message_at)}
                          </span>
                        </div>

                        <div className={styles.conversationPreviewRow}>
                          <p className={styles.previewLine}>{getPreviewConversa(c)}</p>

                          {unreadCount > 0 && (
                            <span className={styles.unreadBadge}>{unreadCount}</span>
                          )}
                        </div>

                        <div className={styles.conversationBottomLine}>
                          <span
                            className={`${styles.statusMiniBadge} ${
                              c.status === "encerrada"
                                ? styles.statusMiniClosed
                                : c.status === "fila"
                                ? styles.statusMiniWaiting
                                : c.status === "aguardando_cliente"
                                ? styles.statusMiniWaiting
                                : styles.statusMiniDefault
                            }`}
                          >
                            {getStatusLabel(c.status)}
                          </span>

                          {(c.prioridade === "alta" || c.prioridade === "urgente") && (
                            <span className={styles.priorityMiniBadge}>
                              {getPrioridadeLabel(c.prioridade)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className={styles.content}>
            {conversaSelecionada ? (
              <div className={styles.chatShell}>
                <div className={styles.chatMainColumn}>
                  <header className={styles.chatHeader}>
                    <div className={styles.chatHeaderLeft}>
                      <button
                        type="button"
                        className={styles.chatAvatarButton}
                        onClick={() => setPainelDireitoAberto((prev) => !prev)}
                      >
                        <div className={styles.chatAvatar}>
                          {getIniciais(conversaSelecionada.contatos?.nome)}
                        </div>
                      </button>

                      <div className={styles.chatIdentityWrap}>
                        <div className={styles.chatIdentityBlock}>
                          <button
                            type="button"
                            className={styles.chatIdentityButton}
                            onClick={() => setPainelDireitoAberto((prev) => !prev)}
                          >
                            <div className={styles.chatIdentity}>
                              <h2 className={styles.chatTitle}>
                                {conversaSelecionada.favorita && (
                                  <span className={styles.favoriteStar} title="Conversa favorita">
                                    ★
                                  </span>
                                )}
                                {conversaSelecionada.contatos?.nome || "Sem nome"}
                              </h2>
                              <p className={styles.chatSubtitle}>
                                {conversaSelecionada.contatos?.telefone || "Sem telefone"}
                              </p>
                            </div>
                          </button>
                        </div>

                        <div className={styles.chatHeaderAlerts}>
                          {alertaSemResponsavel && (
                            <span className={`${styles.alertChip} ${styles.alertChipWarn}`}>
                              Sem responsável
                            </span>
                          )}

                          {alertaClienteAguardando && (
                            <span className={`${styles.alertChip} ${styles.alertChipInfo}`}>
                              Aguardando cliente
                            </span>
                          )}

                          {alertaPrioridadeAlta && (
                            <span className={`${styles.alertChip} ${styles.alertChipDanger}`}>
                              Prioridade alta
                            </span>
                          )}

                          {alertaParadaMuitoTempo && (
                            <span className={`${styles.alertChip} ${styles.alertChipWarn}`}>
                              Conversa parada há muito tempo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chatHeaderActions}>
                      {conversaSelecionada.status === "encerrada" ? (
                        <button className={styles.primaryButton} onClick={reabrirConversa}>
                          Reabrir
                        </button>
                      ) : (
                        <>

                          {conversaTemNotas && (
                            <button
                              type="button"
                              className={styles.noteShortcutButton}
                              title="Abrir notas"
                              onClick={async () => {
                                setPainelDireitoAberto(true);
                                setAbaPainelDireito("notas");
                                await carregarNotasDaConversa();
                              }}
                            >
                              📝
                            </button>
                          )}

                          {podeAssumirConversa && (
                            <button
                              className={styles.primaryButton}
                              onClick={assumirConversa}
                              disabled={assumindo}
                            >
                              {assumindo ? "Assumindo..." : "Assumir"}
                            </button>
                          )}

                          <div className={styles.headerMenuWrap} ref={menuContatoRef}>
                            <button
                              type="button"
                              className={styles.moreButton}
                              onClick={() => setMenuContatoAberto((prev) => !prev)}
                              title="Mais opções"
                            >
                              ⋮
                            </button>

                            {menuContatoAberto && (
                              <div className={styles.headerDropdownMenu}>
                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={() => {
                                    setAbaPainelDireito("contato");
                                    setPainelDireitoAberto(true);
                                    setMenuContatoAberto(false);
                                  }}
                                >
                                  Dados do contato
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={async () => {
                                    setMenuContatoAberto(false);
                                    await alternarFavorito();
                                  }}
                                >
                                  {conversaSelecionada?.favorita
                                    ? "★ Remover dos favoritos"
                                    : "✰ Adicionar aos favoritos"}
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={async () => {
                                    setPainelDireitoAberto(true);
                                    setAbaPainelDireito("listas");
                                    setMenuContatoAberto(false);
                                    await carregarListasDaConversa();
                                  }}
                                >
                                  Adicionar à lista
                                </button>

                                <div className={styles.headerDropdownDivider} />

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={() => {
                                    setAbaPainelDireito("detalhes");
                                    setPainelDireitoAberto(true);
                                    setMenuContatoAberto(false);
                                  }}
                                >
                                  Detalhes
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={() => {
                                    setAbaPainelDireito("historico");
                                    setPainelDireitoAberto(true);
                                    setMenuContatoAberto(false);
                                  }}
                                >
                                  Histórico
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={async () => {
                                    setAbaPainelDireito("notas");
                                    setPainelDireitoAberto(true);
                                    setMenuContatoAberto(false);
                                    await carregarNotasDaConversa();
                                  }}
                                >
                                  <span className={styles.dropdownItemContent}>
                                    <span>Notas</span>
                                    {quantidadeNotas > 0 && (
                                      <span className={styles.dropdownBadge}>
                                        {quantidadeNotas}
                                      </span>
                                    )}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={() => {
                                    setPainelDireitoAberto(true);
                                    setAbaPainelDireito("mensagens_favoritas");
                                    setMenuContatoAberto(false);
                                  }}
                                >
                                  <span className={styles.dropdownItemContent}>
                                    <span>Mensagens favoritas</span>
                                    {quantidadeMensagensFavoritas > 0 && (
                                      <span className={styles.dropdownBadge}>
                                        {quantidadeMensagensFavoritas}
                                      </span>
                                    )}
                                  </span>
                                </button>

                                <div className={styles.headerDropdownDivider} />

                                {podeAtribuir && (
                                  <button
                                    type="button"
                                    className={styles.headerDropdownItem}
                                    onClick={async () => {
                                      setMenuContatoAberto(false);

                                      if (acaoAberta === "atribuir") {
                                        setAcaoAberta(null);
                                        return;
                                      }

                                      await abrirAtribuir();
                                    }}
                                  >
                                    Atribuir
                                  </button>
                                )}

                                {podeTransferir && (
                                  <button
                                    type="button"
                                    className={styles.headerDropdownItem}
                                    onClick={() => {
                                      setMenuContatoAberto(false);

                                      if (acaoAberta === "transferir") {
                                        setAcaoAberta(null);
                                        return;
                                      }

                                      abrirTransferir();
                                    }}
                                  >
                                    Transferir
                                  </button>
                                )}

                                {podeEncerrar && (
                                  <button
                                    type="button"
                                    className={`${styles.headerDropdownItem} ${styles.headerDropdownDanger}`}
                                    onClick={() => {
                                      setMenuContatoAberto(false);
                                      abrirEncerrar();
                                    }}
                                  >
                                    Encerrar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </header>

                  {acaoAberta && (
                    <div className={styles.actionPanel}>
                      {acaoAberta === "transferir" && (
                        <>
                          <div className={styles.actionPanelHeader}>
                            <h3 className={styles.actionPanelTitle}>Transferir conversa</h3>
                            <button
                              className={styles.textButton}
                              onClick={() => setAcaoAberta(null)}
                            >
                              ×
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
                                {salvandoAcao ? "Salvando..." : "Confirmar"}
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
                              className={styles.textButton}
                              onClick={() => setAcaoAberta(null)}
                            >
                              ×
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
                                {salvandoAcao ? "Salvando..." : "Confirmar"}
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
                              className={styles.textButton}
                              onClick={() => setAcaoAberta(null)}
                            >
                              ×
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
                                {salvandoAcao ? "Encerrando..." : "Confirmar"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className={styles.mainBody}>
                    <div className={styles.chatCenter}>
                      <div className={styles.timelineWrapper}>
                        <div ref={mensagensRef} className={styles.timelineArea}>
                          {loadingMensagens ? (
                            <div className={styles.timelineInfo}>
                              Carregando mensagens...
                            </div>
                          ) : mensagens.length === 0 ? (
                            <div className={styles.emptyTimelineCard}>
                              Nenhuma mensagem cadastrada nessa conversa ainda.
                            </div>
                          ) : (
                            <div className={styles.messagesStack}>
                              {mensagensAgrupadas.map((item, index) => {
                                if (item.tipo === "data") {
                                  return (
                                    <div
                                      key={`data-${item.valor}-${index}`}
                                      className={styles.dateRow}
                                    >
                                      <div className={styles.dateBadge}>{item.valor}</div>
                                    </div>
                                  );
                                }

                                const msg = item.valor;
                                const isOutgoing = msg.origem === "enviada";
                                const isAutomatic = msg.origem === "automatica";
                                const isSystem = msg.remetente_tipo === "sistema";

                                if (isSystem) {
                                  return (
                                    <div key={msg.id} className={styles.systemMessageRow}>
                                      <div className={styles.systemMessageBadge}>
                                        {msg.conteudo}
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                    <div
                                      id={`mensagem-${msg.id}`}
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
                                          : isAutomatic
                                          ? styles.messageBubbleAutomatic
                                          : styles.messageBubbleIncoming
                                      }`}
                                    >
                                      {!isOutgoing &&
                                        (msg.remetente_tipo === "bot" ||
                                          msg.remetente_tipo === "ia") && (
                                          <div className={styles.messageMetaTop}>
                                            <span className={styles.senderLabel}>
                                              {getRemetenteLabel(msg.remetente_tipo)}
                                            </span>

                                            {isAutomatic && (
                                              <span className={styles.automaticBadge}>
                                                automática
                                              </span>
                                            )}
                                          </div>
                                        )}

                                      <div className={styles.messageContentRow}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          {renderizarConteudoMensagem(msg)}
                                        </div>

                                        {(msg.remetente_tipo === "usuario" || msg.remetente_tipo === "contato") && (
                                          <button
                                            type="button"
                                            className={`${styles.messageFavoriteButton} ${
                                              msg.favorita ? styles.messageFavoriteButtonActive : ""
                                            }`}
                                            onClick={() => alternarMensagemFavorita(msg)}
                                            title={msg.favorita ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                          >
                                            ☆
                                          </button>
                                        )}
                                      </div>

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

                          {!podeEnviarMensagem &&
                            conversaSelecionada.status !== "encerrada" && (
                              <div className={styles.timelineInfoSmall}>
                                Você só poderá responder quando a conversa estiver sob sua
                                responsabilidade.
                              </div>
                            )}

                          {conversaSelecionada.status === "encerrada" && (
                            <div className={styles.timelineInfoSmall}>
                              Esta conversa está encerrada e não aceita novas mensagens.
                            </div>
                          )}

                          <div className={styles.composerTools}>
                            <button
                              type="button"
                              className={styles.toolButton}
                              title="Anexar arquivo"
                            >
                              📎
                            </button>
                            <button
                              type="button"
                              className={styles.toolButton}
                              title="Enviar imagem"
                            >
                              🖼️
                            </button>
                            <button
                              type="button"
                              className={styles.toolButton}
                              title="Gravar áudio"
                            >
                              🎤
                            </button>
                            <button
                              type="button"
                              className={styles.toolButton}
                              title="Emoji"
                            >
                              🙂
                            </button>
                          </div>

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
                              className={styles.sendButton}
                            >
                              {enviando ? "Enviando..." : "Enviar"}
                            </button>
                          </div>

                          <p className={styles.footerHint}>
                            Enter envia • Shift + Enter quebra linha
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {painelDireitoAberto && (
                  <aside className={styles.rightPanel}>
                    <div className={styles.rightPanelHeader}>
                      <div className={styles.rightPanelHeaderLeft}>
                        {abaPainelDireito !== "contato" && (
                          <button
                            type="button"
                            className={styles.backButton}
                            onClick={() => setAbaPainelDireito("contato")}
                            title="Voltar para contatos"
                          >
                            ←
                          </button>
                        )}

                        <h3 className={styles.rightPanelTitle}>
                          {abaPainelDireito === "contato"
                            ? "Dados do contato"
                            : abaPainelDireito === "detalhes"
                            ? "Detalhes"
                            : abaPainelDireito === "historico"
                            ? "Histórico"
                            : abaPainelDireito === "notas"
                            ? "Notas"
                            : "Mensagens favoritas"}
                        </h3>
                      </div>

                      <button
                        className={styles.textButton}
                        onClick={() => setPainelDireitoAberto(false)}
                      >
                        ×
                      </button>
                    </div>

                    <div className={styles.rightPanelBody}>
                      {abaPainelDireito === "detalhes" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.detailCardGrid}>
                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Assunto</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.assunto || "Sem assunto"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Canal</span>
                              <strong className={styles.detailValue}>
                                {getCanalLabel(conversaSelecionada.canal)}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Status</span>
                              <strong className={styles.detailValue}>
                                {getStatusLabel(conversaSelecionada.status)}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Setor</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.setores?.nome || "Sem setor"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Responsável</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.responsavel?.nome ||
                                  "Sem responsável"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Prioridade</span>
                              <strong className={styles.detailValue}>
                                {getPrioridadeLabel(conversaSelecionada.prioridade)}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Origem</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.origem_atendimento ||
                                  "Não informada"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Última atividade</span>
                              <strong className={styles.detailValue}>
                                {formatarDataCompleta(conversaSelecionada.last_message_at)}
                              </strong>
                            </div>
                          </div>

                          <div className={styles.botCard}>
                            <div className={styles.botCardHeader}>
                              <div>
                                <h4 className={styles.botCardTitle}>Bot</h4>
                                <p className={styles.botCardSubtitle}>
                                  Controle visual preparado para integração.
                                </p>
                              </div>

                              <span
                                className={`${styles.botStatusBadge} ${
                                  conversaSelecionada.status === "bot"
                                    ? styles.botStatusActive
                                    : styles.botStatusPaused
                                }`}
                              >
                                {conversaSelecionada.status === "bot"
                                  ? "Ativo"
                                  : "Pausado"}
                              </span>
                            </div>

                            <div className={styles.botInfoGrid}>
                              <div className={styles.botInfoItem}>
                                <span className={styles.detailLabel}>Etapa atual</span>
                                <strong className={styles.detailValue}>
                                  Aguardando integração real
                                </strong>
                              </div>

                              <div className={styles.botInfoItem}>
                                <span className={styles.detailLabel}>Última ação</span>
                                <strong className={styles.detailValue}>
                                  Sem evento detalhado
                                </strong>
                              </div>
                            </div>

                            <div className={styles.botActions}>
                              <button className={styles.secondaryButton}>Pausar bot</button>
                              <button className={styles.secondaryButton}>Retomar bot</button>
                              <button className={styles.secondaryButton}>Resetar bot</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {abaPainelDireito === "contato" && (
                        <div className={styles.whatsContactPanel}>
                          <div className={styles.whatsContactHero}>
                            <div className={styles.whatsContactAvatar}>
                              {getIniciais(conversaSelecionada.contatos?.nome)}
                            </div>

                            <h4 className={styles.whatsContactName}>
                              {conversaSelecionada.contatos?.nome || "Sem nome"}
                            </h4>

                            <p className={styles.whatsContactPhone}>
                              {conversaSelecionada.contatos?.telefone || "Sem telefone"}
                            </p>

                            <div className={styles.whatsContactActions}>
                              <button type="button" className={styles.whatsContactActionButton}>
                                <span className={styles.whatsContactActionIcon}>＋</span>
                                <span className={styles.whatsContactActionText}>Adicionar</span>
                              </button>

                              <button type="button" className={styles.whatsContactActionButton}>
                                <span className={styles.whatsContactActionIcon}>↗</span>
                                <span className={styles.whatsContactActionText}>Compartilhar</span>
                              </button>
                            </div>
                          </div>

                          <div className={styles.whatsLinksSection}>
                            {/* Mídia */}
                            <button
                              type="button"
                              className={styles.whatsListActionButton}
                              onClick={() =>
                                setMensagemSucesso("Abrir mídia, links e documentos (implementar API)")
                              }
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>🖼️</span>
                                <span className={styles.whatsListActionLabel}>
                                  Mídia, links e docs
                                </span>
                              </span>
                              <span className={styles.whatsListActionRight}>0</span>
                            </button>

                            {/* Favoritas */}
                            <button
                              type="button"
                              className={styles.whatsListActionButton}
                              onClick={() => {
                                setPainelDireitoAberto(true);
                                setAbaPainelDireito("mensagens_favoritas");
                                setMenuContatoAberto(false);
                              }}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>⭐</span>
                                <span className={styles.whatsListActionLabel}>
                                  Mensagens favoritas
                                </span>
                              </span>

                              {quantidadeMensagensFavoritas > 0 && (
                                <span className={styles.whatsListActionRight}>
                                  {quantidadeMensagensFavoritas}
                                </span>
                              )}
                            </button>

                            {/* NOVOS BOTÕES 👇 */}

                            {/* Detalhes */}
                            <button
                              type="button"
                              className={styles.whatsListActionButton}
                              onClick={() => setAbaPainelDireito("detalhes")}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>ℹ️</span>
                                <span className={styles.whatsListActionLabel}>Detalhes</span>
                              </span>
                            </button>

                            {/* Histórico */}
                            <button
                              type="button"
                              className={styles.whatsListActionButton}
                              onClick={() => setAbaPainelDireito("historico")}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>🕓</span>
                                <span className={styles.whatsListActionLabel}>Histórico</span>
                              </span>
                            </button>

                            {/* Notas */}
                            <button
                              type="button"
                              className={styles.whatsListActionButton}
                              onClick={async () => {
                                setAbaPainelDireito("notas");
                                setPainelDireitoAberto(true);
                                await carregarNotasDaConversa();
                              }}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>📝</span>
                                <span className={styles.whatsListActionLabel}>Notas</span>
                              </span>

                              {quantidadeNotas > 0 && (
                                <span className={styles.whatsListActionRight}>
                                  {quantidadeNotas}
                                </span>
                              )}
                            </button>
                          </div>

                          <div className={styles.whatsDivider} />

                          <div className={styles.whatsContactSection}>
                            <div className={styles.whatsSectionHeader}>
                              <span>Informações do contato</span>
                            </div>

                            <div className={styles.whatsInfoList}>
                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>Telefone</span>
                                <strong className={styles.whatsInfoValue}>
                                  {conversaSelecionada.contatos?.telefone || "Sem telefone"}
                                </strong>
                              </div>

                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>E-mail</span>
                                <strong className={styles.whatsInfoValue}>
                                  {conversaSelecionada.contatos?.email || "Não informado"}
                                </strong>
                              </div>

                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>Empresa</span>
                                <strong className={styles.whatsInfoValue}>
                                  {conversaSelecionada.contatos?.empresa || "Não informada"}
                                </strong>
                              </div>

                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>Observações</span>
                                <strong className={styles.whatsInfoValue}>
                                  {conversaSelecionada.contatos?.observacoes || "Sem observações"}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <div className={styles.whatsContactSection}>
                            <div className={styles.whatsSectionHeader}>
                              <span>Tags</span>
                            </div>

                            <div className={styles.tagsWrap}>
                              {(conversaSelecionada.contatos?.tags || []).length > 0 ? (
                                conversaSelecionada.contatos?.tags?.map((tag) => (
                                  <span key={tag} className={styles.tagBadge}>
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className={styles.emptyInlineText}>
                                  Nenhuma tag cadastrada.
                                </span>
                              )}
                            </div>
                          </div>

                          <div className={styles.whatsContactSection}>
                            <div className={styles.whatsSectionHeader}>
                              <span>Ações</span>
                            </div>

                            <div className={styles.whatsActionList}>
                              <button
                                type="button"
                                className={styles.whatsSecondaryAction}
                                onClick={async () => {
                                  setMenuContatoAberto(false);
                                  await alternarFavorito();
                                }}
                              >
                                {conversaSelecionada?.favorita
                                      ? "★ Remover dos favoritos"
                                      : "✰ Adicionar aos favoritos"}
                              </button>

                              <button
                                type="button"
                                className={styles.whatsSecondaryAction}
                                onClick={async () => {
                                  setPainelDireitoAberto(true);
                                  setAbaPainelDireito("listas");
                                  setMenuContatoAberto(false);
                                  await carregarListasDaConversa();
                                }}
                              >
                                ⊞ Adicionar à lista
                              </button>

                              <button type="button" className={styles.whatsDangerAction}>
                                ⊖ Limpar conversa
                              </button>

                              <button type="button" className={styles.whatsDangerAction}>
                                🗑 Apagar conversa
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {abaPainelDireito === "historico" && (
                        <div className={styles.panelSectionStack}>
                          {historicoExemplo.map((item, index) => (
                            <div key={index} className={styles.historyCard}>
                              <h4 className={styles.historyTitle}>{item.titulo}</h4>
                              <p className={styles.historyText}>{item.descricao}</p>
                            </div>
                          ))}

                          <div className={styles.infoBoxMuted}>
                            Este bloco está pronto visualmente. Quando você criar a API de
                            histórico, basta trocar esses dados de exemplo por dados reais.
                          </div>
                        </div>
                      )}

                      {abaPainelDireito === "notas" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.noteComposer}>
                            <label className={styles.actionLabel}>Nova nota interna</label>
                            <textarea
                              className={styles.noteInput}
                              rows={4}
                              value={notaInterna}
                              onChange={(e) => setNotaInterna(e.target.value)}
                              placeholder="Digite uma observação interna sobre esta conversa"
                            />
                            <button
                              className={styles.primaryButton}
                              type="button"
                              disabled={salvandoNota || !notaInterna.trim()}
                              onClick={salvarNovaNota}
                            >
                              {salvandoNota ? "Salvando..." : "Salvar nota"}
                            </button>
                          </div>

                          {notasConversa.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Nenhuma nota cadastrada para esta conversa ainda.
                            </div>
                          ) : (
                            notasConversa.map((nota) => (
                              <div key={nota.id} className={styles.noteCard}>
                                {notaEditandoId === nota.id ? (
                                  <>
                                    <textarea
                                      className={styles.noteInput}
                                      rows={4}
                                      value={notaEditandoTexto}
                                      onChange={(e) => setNotaEditandoTexto(e.target.value)}
                                    />

                                    <div className={styles.actionButtons}>
                                      <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={() => {
                                          setNotaEditandoId(null);
                                          setNotaEditandoTexto("");
                                        }}
                                      >
                                        Cancelar
                                      </button>

                                      <button
                                        type="button"
                                        className={styles.primaryButton}
                                        disabled={salvandoNota || !notaEditandoTexto.trim()}
                                        onClick={atualizarNota}
                                      >
                                        Salvar
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className={styles.noteCardHeader}>
                                      <div>
                                        <strong className={styles.noteAuthor}>
                                          {nota.autor?.nome || "Usuário"}
                                        </strong>
                                        <div className={styles.noteDate}>
                                          {formatarDataCompleta(nota.created_at)}
                                        </div>
                                      </div>

                                      <div className={styles.listaActions}>
                                        <button
                                          type="button"
                                          className={styles.listaIconButton}
                                          title="Editar nota"
                                          onClick={() => {
                                            setNotaEditandoId(nota.id);
                                            setNotaEditandoTexto(nota.conteudo);
                                          }}
                                        >
                                          ✎
                                        </button>

                                        <button
                                          type="button"
                                          className={`${styles.listaIconButton} ${styles.listaIconButtonDanger}`}
                                          title="Excluir nota"
                                          onClick={() => excluirNota(nota.id)}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    </div>

                                    <p className={styles.noteText}>{nota.conteudo}</p>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {abaPainelDireito === "mensagens_favoritas" && (
                        <div className={styles.panelSectionStack}>
                          {mensagensFavoritas.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Nenhuma mensagem favorita nesta conversa.
                            </div>
                          ) : (
                            mensagensFavoritas.map((msg) => (
                              <div
                                key={msg.id}
                                className={styles.favoriteMessageCard}
                                onClick={() => {
                                  setAbaPainelDireito("mensagens_favoritas");

                                  setTimeout(() => {
                                    scrollParaMensagem(msg.id);
                                  }, 250);
                                }}
                              >
                                <div className={styles.favoriteMessageHeader}>
                                  <strong className={styles.favoriteMessageAuthor}>
                                    {msg.remetente_tipo === "usuario" ? "Você" : "Cliente"}
                                  </strong>
                                  <span className={styles.favoriteMessageDate}>
                                    {formatarDataCompleta(msg.created_at)}
                                  </span>
                                </div>

                                <p className={styles.favoriteMessageText}>{msg.conteudo}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {abaPainelDireito === "listas" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.noteComposer}>
                            <label className={styles.actionLabel}>Criar nova lista</label>
                            <input
                              className={styles.messageInput}
                              value={novaListaNome}
                              onChange={(e) => setNovaListaNome(e.target.value)}
                              placeholder="Ex.: Melhores amigos"
                            />
                            <button
                              className={styles.primaryButton}
                              type="button"
                              disabled={salvandoLista || !novaListaNome.trim()}
                              onClick={async () => {
                                try {
                                  setSalvandoLista(true);
                                  setErro("");
                                  setMensagemSucesso("");

                                  const res = await fetch("/api/conversas/listas", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      nome: novaListaNome.trim(),
                                    }),
                                  });

                                  const data = await res.json();

                                  if (!res.ok) {
                                    setErro(data.error || "Erro ao criar lista");
                                    return;
                                  }

                                  setNovaListaNome("");
                                  setMensagemSucesso(data.message || "Lista criada com sucesso");
                                  await carregarListasDaConversa();
                                } catch {
                                  setErro("Erro ao criar lista");
                                } finally {
                                  setSalvandoLista(false);
                                }
                              }}
                            >
                              Criar lista
                            </button>
                          </div>

                          {listasConversa.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Nenhuma lista criada para esta empresa ainda.
                            </div>
                          ) : (
                            listasConversa.map((lista) => (
                              <div key={lista.id} className={styles.listaCardWrap}>
                                <div className={styles.listaCard}>
                                  <button
                                    type="button"
                                    className={styles.listaMainButton}
                                    onClick={async () => {
                                      if (!conversaSelecionada?.id) return;

                                      try {
                                        setErro("");
                                        setMensagemSucesso("");

                                        const res = await fetch(`/api/conversas/${conversaSelecionada.id}/listas`, {
                                          method: lista.marcada ? "DELETE" : "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            lista_id: lista.id,
                                          }),
                                        });

                                        const data = await res.json();

                                        if (!res.ok) {
                                          setErro(data.error || "Erro ao atualizar lista");
                                          return;
                                        }

                                        setMensagemSucesso(data.message || "Lista atualizada com sucesso");
                                        await carregarListasDaConversa();
                                        await carregarConversas();
                                      } catch {
                                        setErro("Erro ao atualizar lista");
                                      }
                                    }}
                                  >
                                    <span className={styles.listaMainLeft}>
                                      <span className={styles.listaCheckIcon}>
                                        {lista.marcada ? "☑" : "☐"}
                                      </span>
                                      <span className={styles.listaNome}>{lista.nome}</span>
                                    </span>
                                  </button>

                                  <div className={styles.listaActions}>
                                    <button
                                      type="button"
                                      className={styles.listaIconButton}
                                      title="Editar lista"
                                      onClick={() => {
                                        setListaConfirmandoExclusaoId(null);

                                        if (listaEditandoId === lista.id) {
                                          setListaEditandoId(null);
                                          setListaEditandoNome("");
                                          return;
                                        }

                                        setListaEditandoId(lista.id);
                                        setListaEditandoNome(lista.nome);
                                      }}
                                    >
                                      ✎
                                    </button>

                                    <button
                                      type="button"
                                      className={`${styles.listaIconButton} ${styles.listaIconButtonDanger}`}
                                      title="Excluir lista"
                                      onClick={() => {
                                        setListaEditandoId(null);
                                        setListaEditandoNome("");

                                        setListaConfirmandoExclusaoId((atual) =>
                                          atual === lista.id ? null : lista.id
                                        );
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>

                                {listaEditandoId === lista.id && (
                                  <div className={styles.listaInlinePanel}>
                                    <label className={styles.actionLabel}>Editar nome da lista</label>

                                    <input
                                      className={styles.messageInput}
                                      value={listaEditandoNome}
                                      onChange={(e) => setListaEditandoNome(e.target.value)}
                                      placeholder="Digite o novo nome da lista"
                                    />

                                    <div className={styles.listaInlineActions}>
                                      <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={() => {
                                          setListaEditandoId(null);
                                          setListaEditandoNome("");
                                        }}
                                      >
                                        Cancelar
                                      </button>

                                      <button
                                        type="button"
                                        className={styles.primaryButton}
                                        disabled={!listaEditandoNome.trim()}
                                        onClick={async () => {
                                          try {
                                            setErro("");
                                            setMensagemSucesso("");

                                            const res = await fetch("/api/conversas/listas", {
                                              method: "PUT",
                                              headers: {
                                                "Content-Type": "application/json",
                                              },
                                              body: JSON.stringify({
                                                lista_id: lista.id,
                                                nome: listaEditandoNome.trim(),
                                              }),
                                            });

                                            const data = await res.json();

                                            if (!res.ok) {
                                              setErro(data.error || "Erro ao atualizar lista");
                                              return;
                                            }

                                            setMensagemSucesso(data.message || "Lista atualizada com sucesso");
                                            setListaEditandoId(null);
                                            setListaEditandoNome("");

                                            await carregarListasDaConversa();
                                            await carregarListasEmpresa();
                                            await carregarConversas();
                                          } catch {
                                            setErro("Erro ao atualizar lista");
                                          }
                                        }}
                                      >
                                        Salvar
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {listaConfirmandoExclusaoId === lista.id && (
                                  <div className={styles.listaInlinePanelDanger}>
                                    <p className={styles.listaConfirmText}>
                                      Deseja excluir a lista <strong>{lista.nome}</strong>?
                                    </p>

                                    <div className={styles.listaInlineActions}>
                                      <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={() => setListaConfirmandoExclusaoId(null)}
                                      >
                                        Cancelar
                                      </button>

                                      <button
                                        type="button"
                                        className={styles.dangerButton}
                                        onClick={async () => {
                                          try {
                                            setErro("");
                                            setMensagemSucesso("");

                                            const res = await fetch("/api/conversas/listas", {
                                              method: "DELETE",
                                              headers: {
                                                "Content-Type": "application/json",
                                              },
                                              body: JSON.stringify({
                                                lista_id: lista.id,
                                              }),
                                            });

                                            const data = await res.json();

                                            if (!res.ok) {
                                              setErro(data.error || "Erro ao excluir lista");
                                              return;
                                            }

                                            setMensagemSucesso(data.message || "Lista excluída com sucesso");
                                            setListaConfirmandoExclusaoId(null);

                                            await carregarListasDaConversa();
                                            await carregarListasEmpresa();
                                            await carregarConversas();
                                          } catch {
                                            setErro("Erro ao excluir lista");
                                          }
                                        }}
                                      >
                                        Excluir
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </aside>
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateCard}>
                  <div className={styles.placeholderIcon}>💬</div>
                  <h2 className={styles.emptyStateTitle}>Selecione uma conversa</h2>
                  <p className={styles.emptyStateText}>
                    Escolha uma conversa na lateral para visualizar histórico,
                    responder e abrir o painel de contexto.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}