"use client";

import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import styles from "./conversas.module.css";
import { can } from "@/lib/permissoes/frontend";
import EmojiPicker from "emoji-picker-react";
import twemoji from "twemoji";

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
    id?: string;
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
    location?: {
      latitude?: number | null;
      longitude?: number | null;
      name?: string | null;
      address?: string | null;
    } | null;
    unsupported?: {
      type?: string | null;
      details?: string | null;
    } | null;
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
  | "listas"
  | "midia_docs_links";

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

type MidiaAgrupadaItem = {
  id: string;
  tipo: "midia" | "documento" | "link";
  subtipo: string;
  nome: string;
  url: string;
  mimeType: string;
  caption: string | null;
  createdAt: string;
  dateLabel: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isPdf: boolean;
};

type MidiaAgrupadaSecao = {
  data: string;
  itens: MidiaAgrupadaItem[];
};

type AbaMidiaDocsLinks = "midia" | "documentos" | "links";

type StatusLeadContato =
  | "novo"
  | "em_atendimento"
  | "qualificado"
  | "cliente"
  | "perdido";

type ContatoCompartilhadoMensagem = {
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
};

type ContatoCadastroForm = {
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  campanha: string;
  status_lead: StatusLeadContato;
  observacoes: string;
};

function mensagemTemMidiaExpiravel(msg: Mensagem) {
  if (msg.origem !== "recebida") return false;

  return ["imagem", "audio", "video", "documento"].includes(msg.tipo_mensagem);
}

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

function extrairLinksDoTexto(texto?: string | null) {
  if (!texto) return [];

  const regex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
  const encontrados = texto.match(regex) || [];

  return Array.from(
    new Set(
      encontrados.map((item) =>
        item.startsWith("http://") || item.startsWith("https://")
          ? item
          : `https://${item}`
      )
    )
  );
}

function getLabelMesAno(dataIso: string) {
  return new Date(dataIso).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function getNomeContatoCompartilhado(contato: ContatoCompartilhadoMensagem) {
  return (
    contato.name?.formatted_name ||
    [contato.name?.first_name, contato.name?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Contato compartilhado"
  );
}

function getTelefonePrincipalContatoCompartilhado(
  contato: ContatoCompartilhadoMensagem
) {
  const primeiroTelefone = contato.phones?.[0];
  return primeiroTelefone?.phone || primeiroTelefone?.wa_id || "";
}

function getEmailPrincipalContatoCompartilhado(
  contato: ContatoCompartilhadoMensagem
) {
  return contato.emails?.[0]?.email || "";
}

function getIniciaisContatoCompartilhado(contato: ContatoCompartilhadoMensagem) {
  return getIniciais(getNomeContatoCompartilhado(contato));
}


function converterTextoParaEmojiHtml(texto?: string | null) {
  const valor = texto || "";

  return twemoji.parse(valor, {
    folder: "svg",
    ext: ".svg",
  });
}


type AudioMessagePlayerProps = {
  src: string;
  isOutgoing?: boolean;
  isVoice?: boolean;
  fileName?: string | null;
};

function formatarTempoAudio(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return "00:00";

  const mins = Math.floor(segundos / 60);
  const secs = Math.floor(segundos % 60);

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function AudioMessagePlayer({
  src,
  isOutgoing = false,
  isVoice = false,
  fileName = null,
}: AudioMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);

  const [tocando, setTocando] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const [arrastando, setArrastando] = useState(false);

  const barrasWave = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => {
      const base = [8, 14, 22, 12, 18, 10, 24, 11, 16, 20, 12, 26];
      return base[i % base.length];
    });
  }, []);

  const containerClass = isOutgoing
    ? styles.audioPlayerOutgoing
    : styles.audioPlayerIncoming;

  const textClass = isOutgoing
    ? styles.audioPlayerTextOutgoing
    : styles.audioPlayerTextIncoming;

  const pillClass = isOutgoing
    ? styles.audioPlayerPillOutgoing
    : styles.audioPlayerPillIncoming;

  const waveActiveClass = isOutgoing
    ? styles.audioWaveBarActiveOutgoing
    : styles.audioWaveBarActiveIncoming;

  const waveInactiveClass = isOutgoing
    ? styles.audioWaveBarInactiveOutgoing
    : styles.audioWaveBarInactiveIncoming;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const atualizarDuracao = () => {
      const novaDuracao = audio.duration;
      if (Number.isFinite(novaDuracao) && novaDuracao > 0) {
        setDuracao(novaDuracao);
      }
    };

    const atualizarTempo = () => {
      if (!arrastando) {
        setTempoAtual(audio.currentTime || 0);
      }
    };

    const aoTerminar = () => {
      setTocando(false);
      setTempoAtual(0);
      audio.currentTime = 0;
    };

    const aoPause = () => {
      setTocando(false);
    };

    const aoPlay = () => {
      setTocando(true);
    };

    audio.addEventListener("loadedmetadata", atualizarDuracao);
    audio.addEventListener("durationchange", atualizarDuracao);
    audio.addEventListener("canplay", atualizarDuracao);
    audio.addEventListener("timeupdate", atualizarTempo);
    audio.addEventListener("ended", aoTerminar);
    audio.addEventListener("pause", aoPause);
    audio.addEventListener("play", aoPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", atualizarDuracao);
      audio.removeEventListener("durationchange", atualizarDuracao);
      audio.removeEventListener("canplay", atualizarDuracao);
      audio.removeEventListener("timeupdate", atualizarTempo);
      audio.removeEventListener("ended", aoTerminar);
      audio.removeEventListener("pause", aoPause);
      audio.removeEventListener("play", aoPlay);
    };
  }, [arrastando]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = velocidade;
  }, [velocidade]);

  async function alternarPlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (tocando) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      setTocando(false);
    }
  }

  function alterarTempo(delta: number) {
    const audio = audioRef.current;
    if (!audio || !duracao) return;

    const proximoTempo = Math.min(
      Math.max((audio.currentTime || 0) + delta, 0),
      duracao
    );

    audio.currentTime = proximoTempo;
    setTempoAtual(proximoTempo);
  }

  function calcularTempoPelaPosicao(clientX: number) {
    const barra = barraRef.current;
    if (!barra || !duracao) return null;

    const rect = barra.getBoundingClientRect();
    const posicaoX = clientX - rect.left;
    const porcentagem = Math.min(Math.max(posicaoX / rect.width, 0), 1);

    return porcentagem * duracao;
  }

  function irParaTempo(clientX: number) {
    const audio = audioRef.current;
    if (!audio) return;

    const novoTempo = calcularTempoPelaPosicao(clientX);
    if (novoTempo == null) return;

    audio.currentTime = novoTempo;
    setTempoAtual(novoTempo);
  }

  function onMouseDownBarra(e: React.MouseEvent<HTMLDivElement>) {
    setArrastando(true);
    irParaTempo(e.clientX);
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!arrastando) return;
      irParaTempo(e.clientX);
    }

    function onMouseUp() {
      if (!arrastando) return;
      setArrastando(false);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [arrastando, duracao]);

  function alternarVelocidade() {
    setVelocidade((atual) => {
      if (atual === 1) return 1.5;
      if (atual === 1.5) return 2;
      return 1;
    });
  }


  const progresso = duracao > 0 ? Math.min((tempoAtual / duracao) * 100, 100) : 0;
  const barrasAtivas = Math.round((progresso / 100) * barrasWave.length);

  return (
    <div className={containerClass}>
      <audio ref={audioRef} preload="metadata">
        <source src={src} />
      </audio>

      <div className={styles.audioPlayerTopRow}>
        <div className={styles.audioPlayerTopLeft}>
          {isVoice && <span className={pillClass}>Voz</span>}

          {fileName && !isVoice && (
            <span className={pillClass} title={fileName}>
              {fileName}
            </span>
          )}
        </div>

        <a
          href={src}
          download={fileName || "audio"}
          className={`${styles.audioDownloadLink} ${textClass}`}
          title="Baixar áudio"
        >
          ⬇ Baixar
        </a>
      </div>

      <div className={styles.audioPlayerMainRow}>
        <button
          type="button"
          onClick={alternarPlay}
          className={styles.audioPlayButton}
          title={tocando ? "Pausar áudio" : "Reproduzir áudio"}
        >
          {tocando ? "❚❚" : "▶"}
        </button>

        <div
          ref={barraRef}
          onMouseDown={onMouseDownBarra}
          className={styles.audioWave}
          title="Clique ou arraste para avançar"
        >
          {barrasWave.map((altura, index) => {
            const ativa = index < barrasAtivas;
            const animando = tocando && ativa;

            return (
              <div
                key={index}
                className={`${styles.audioWaveBar} ${
                  ativa ? waveActiveClass : waveInactiveClass
                } ${animando ? styles.audioWaveBarAnimating : ""}`}
                style={{ height: `${altura}px` }}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={alternarVelocidade}
          className={styles.audioSpeedButton}
          title="Alterar velocidade"
        >
          {velocidade}x
        </button>
      </div>

      <div className={styles.audioPlayerBottomRow}>
        <div className={styles.audioPlayerActions}>
          <button
            type="button"
            onClick={() => alterarTempo(-5)}
            className={`${styles.audioActionButton} ${textClass}`}
            title="Voltar 5 segundos"
          >
            ⟲ 5s
          </button>

          <button
            type="button"
            onClick={() => alterarTempo(5)}
            className={`${styles.audioActionButton} ${textClass}`}
            title="Adiantar 5 segundos"
          >
            5s ⟳
          </button>
        </div>

        <div className={`${styles.audioTimeInfo} ${textClass}`}>
          <span>{formatarTempoAudio(tempoAtual)}</span>
          <span>/</span>
          <span>{formatarTempoAudio(duracao)}</span>
        </div>
      </div>
    </div>
  );
}

function CampoContatoEditavel({
  label,
  valorInicial,
  editando,
  multiline = false,
  onEditar,
  onCancelar,
  onSalvar,
}: {
  label: string;
  valorInicial: string;
  editando: boolean;
  multiline?: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (valor: string) => void;
}) {
  const [valor, setValor] = useState(valorInicial);

  useEffect(() => {
    setValor(valorInicial);
  }, [valorInicial]);

  return (
    <div className={styles.whatsInfoRow}>
      <span className={styles.whatsInfoLabel}>{label}</span>

      {editando ? (
        <div className={styles.infoEditBlock}>
          {multiline ? (
            <textarea
              className={styles.inlineTextarea}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              rows={4}
              autoFocus
            />
          ) : (
            <input
              className={styles.inlineInput}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
            />
          )}

          <div className={styles.infoEditActions}>
            <button
              type="button"
              className={styles.inlineCancelButton}
              onClick={() => {
                setValor(valorInicial);
                onCancelar();
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              className={styles.inlineSaveButton}
              onClick={() => onSalvar(valor)}
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.infoValueRow}>
          <span className={styles.whatsInfoValue}>
            {valorInicial || "Não informado"}
          </span>

          <button
            type="button"
            className={styles.editIconButton}
            onClick={onEditar}
          >
            ✎
          </button>
        </div>
      )}
    </div>
  );
}

const TextoComEmoji = React.memo(function TextoComEmoji({
  texto,
}: {
  texto?: string | null;
}) {
  const html = useMemo(() => {
    return converterTextoParaEmojiHtml(texto);
  }, [texto]);

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
});

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

  const [abaMidiaDocsLinks, setAbaMidiaDocsLinks] =
    useState<AbaMidiaDocsLinks>("midia");

  const [acaoAberta, setAcaoAberta] = useState<
    null | "transferir" | "atribuir" | "encerrar"
  >(null);
  const [novoSetorId, setNovoSetorId] = useState("");
  const [novoResponsavelId, setNovoResponsavelId] = useState("");
  const [salvandoAcao, setSalvandoAcao] = useState(false);
  const [abaVisivel, setAbaVisivel] = useState(true);

  const mensagensRef = useRef<HTMLDivElement | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [menuContatoAberto, setMenuContatoAberto] = useState(false);
  const menuContatoRef = useRef<HTMLDivElement | null>(null);
  const menuAnexoRef = useRef<HTMLDivElement | null>(null);

  const conteudoRef = useRef("");
  const legendaArquivoRef = useRef("");

  const mensagensFavoritas = useMemo(() => {
    return mensagens.filter((msg) => msg.favorita);
  }, [mensagens]);
  const [arquivoEnvio, setArquivoEnvio] = useState<File | null>(null);
  const [legendaArquivo, setLegendaArquivo] = useState("");
  const [gravandoAudio, setGravandoAudio] = useState(false);
  const [duracaoGravacao, setDuracaoGravacao] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervaloGravacaoRef = useRef<number | null>(null);

  const [cameraAberta, setCameraAberta] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamCameraRef = useRef<MediaStream | null>(null);

  const [arquivoEnvioPreviewUrl, setArquivoEnvioPreviewUrl] = useState<string | null>(null);
  const documentoInputRef = useRef<HTMLInputElement | null>(null);
  const midiaInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);

  const [emojiAberto, setEmojiAberto] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const legendaEditorRef = useRef<HTMLDivElement | null>(null);

  const [editandoCampo, setEditandoCampo] = useState<string | null>(null);

  const midiaDocsLinksAgrupados = useMemo<MidiaAgrupadaSecao[]>(() => {
    const itens: MidiaAgrupadaItem[] = [];

    for (const msg of mensagens) {
      const mediaId = msg.metadata_json?.media_id || null;
      const mimeType = msg.metadata_json?.mime_type || "";
      const caption = msg.metadata_json?.caption || null;
      const filename = msg.metadata_json?.filename || null;
      const urlMidia = mediaId ? `/api/whatsapp/media/${mediaId}` : null;

      const isImage = msg.tipo_mensagem === "imagem";
      const isVideo = msg.tipo_mensagem === "video";
      const isDocumento = msg.tipo_mensagem === "documento";
      const isAudioDocumento =
        isDocumento && mimeType.toLowerCase().startsWith("audio/");
      const isPdf = isDocumento && mimeType.toLowerCase().includes("pdf");

      if (urlMidia && (isImage || isVideo || isDocumento)) {
        itens.push({
          id: msg.id,
          tipo: isDocumento ? "documento" : "midia",
          subtipo: msg.tipo_mensagem,
          nome:
            filename ||
            caption ||
            (isImage
              ? "Imagem"
              : isVideo
              ? "Vídeo"
              : isAudioDocumento
              ? "Áudio"
              : isPdf
              ? "PDF"
              : "Documento"),
          url: urlMidia,
          mimeType,
          caption,
          createdAt: msg.created_at,
          dateLabel: formatarDataSeparador(msg.created_at),
          isImage,
          isVideo,
          isAudio: isAudioDocumento,
          isPdf,
        });
      }

      const links = extrairLinksDoTexto(msg.conteudo);

      links.forEach((link, index) => {
        itens.push({
          id: `${msg.id}-link-${index}`,
          tipo: "link",
          subtipo: "link",
          nome: link,
          url: link,
          mimeType: "text/html",
          caption: null,
          createdAt: msg.created_at,
          dateLabel: formatarDataSeparador(msg.created_at),
          isImage: false,
          isVideo: false,
          isAudio: false,
          isPdf: false,
        });
      });
    }

    const grupos = itens.reduce<Record<string, MidiaAgrupadaItem[]>>((acc, item) => {
      if (!acc[item.dateLabel]) {
        acc[item.dateLabel] = [];
      }

      acc[item.dateLabel].push(item);
      return acc;
    }, {});

    return Object.entries(grupos)
      .map(([data, itens]) => ({
        data,
        itens: itens.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.itens[0]?.createdAt || 0).getTime();
        const bTime = new Date(b.itens[0]?.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [mensagens]);

  const midiaDocsLinksFiltrados = useMemo(() => {
    return midiaDocsLinksAgrupados
      .map((grupo) => ({
        ...grupo,
        itens: grupo.itens.filter((item) => {
          if (abaMidiaDocsLinks === "midia") {
            return item.tipo === "midia";
          }

          if (abaMidiaDocsLinks === "documentos") {
            return item.tipo === "documento";
          }

          return item.tipo === "link";
        }),
      }))
      .filter((grupo) => grupo.itens.length > 0);
  }, [midiaDocsLinksAgrupados, abaMidiaDocsLinks]);

  const totalMidias = useMemo(() => {
    return midiaDocsLinksAgrupados.reduce(
      (total, grupo) => total + grupo.itens.filter((item) => item.tipo === "midia").length,
      0
    );
  }, [midiaDocsLinksAgrupados]);

  const totalDocumentos = useMemo(() => {
    return midiaDocsLinksAgrupados.reduce(
      (total, grupo) =>
        total + grupo.itens.filter((item) => item.tipo === "documento").length,
      0
    );
  }, [midiaDocsLinksAgrupados]);

  const totalLinks = useMemo(() => {
    return midiaDocsLinksAgrupados.reduce(
      (total, grupo) => total + grupo.itens.filter((item) => item.tipo === "link").length,
      0
    );
  }, [midiaDocsLinksAgrupados]);


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

  const [imagemModalUrl, setImagemModalUrl] = useState<string | null>(null);
  const [imagemModalTitulo, setImagemModalTitulo] = useState<string | null>(null);
  const [imagemZoom, setImagemZoom] = useState(1);

  const [arquivoPreview, setArquivoPreview] = useState<{
    url: string;
    nome: string;
    mimeType: string;
  } | null>(null);



  const [modalAdicionarContatoAberto, setModalAdicionarContatoAberto] = useState(false);
  const [salvandoContatoCompartilhado, setSalvandoContatoCompartilhado] =
    useState(false);

  const [contatoCadastroForm, setContatoCadastroForm] = useState<ContatoCadastroForm>({
    nome: "",
    telefone: "",
    email: "",
    origem: "whatsapp_compartilhado",
    campanha: "",
    status_lead: "novo",
    observacoes: "",
  });

  async function abrirCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      streamCameraRef.current = stream;
      setCameraAberta(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      setErro("Não foi possível acessar a câmera.");
    }
  }


  function focarEditorNoFinal() {
    const alvo = arquivoEnvio ? legendaEditorRef.current : editorRef.current;
    if (!alvo) return;

    alvo.focus();

    const range = document.createRange();
    range.selectNodeContents(alvo);
    range.collapse(false);

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function inserirEmojiNoEditor(emoji: string) {
    const alvo = arquivoEnvio ? legendaEditorRef.current : editorRef.current;
    if (!alvo) return;

    alvo.focus();

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      alvo.innerText = (alvo.innerText || "") + emoji;
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(emoji));
      range.collapse(false);

      selection.removeAllRanges();
      selection.addRange(range);
    }

    const novoTexto = alvo.innerText || "";

    if (arquivoEnvio) {
      setLegendaArquivo(novoTexto);
    } else {
      setConteudo(novoTexto);
    }

    focarEditorNoFinal();
  }
  
  function renderizarConteudoMensagem(msg: Mensagem) {
    const mediaId = msg.metadata_json?.media_id || null;
    const url = mediaId ? `/api/whatsapp/media/${mediaId}` : null;
    const caption = msg.metadata_json?.caption || null;
    const fileName = msg.metadata_json?.filename || "documento";
    const mimeType = msg.metadata_json?.mime_type || "";
    const contatoNome = getSharedContactName(msg);
    const contatoTelefones = getSharedContactPhones(msg);
    const contatoEmails = getSharedContactEmails(msg);

    const latitude = msg.metadata_json?.location?.latitude;
    const longitude = msg.metadata_json?.location?.longitude;
    const mapaUrl =
      latitude != null && longitude != null
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : null;

    if (msg.tipo_mensagem === "imagem") {
      return (
        <div>
          {url ? (
            <button
              type="button"
              onClick={() => {
                setImagemModalUrl(url);
                setImagemModalTitulo(caption || "Imagem");
                setImagemZoom(1);
              }}
              style={{
                border: "none",
                padding: 0,
                background: "transparent",
                cursor: "pointer",
              }}
            >
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
            </button>
          ) : (
            <p className={styles.messageText}><TextoComEmoji texto={msg.conteudo} /></p>
          )}

          {caption && (
            <p className={styles.messageText}>
              <TextoComEmoji texto="algum texto" />
            </p>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "audio") {
      return (
        <div>
          {url ? (
            <AudioMessagePlayer
              src={url}
              isOutgoing={msg.origem === "enviada"}
              isVoice={!!msg.metadata_json?.voice}
              fileName={fileName}
            />
          ) : (
            <p className={styles.messageText}><TextoComEmoji texto={msg.conteudo} /></p>
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
              <source src={url} type={mimeType || "video/mp4"} />
              Seu navegador não suporta vídeo.
            </video>
          ) : (
            <p className={styles.messageText}><TextoComEmoji texto={msg.conteudo} /></p>
          )}

          {caption && (
            <p className={styles.messageText}>
              <TextoComEmoji texto={caption} />
            </p>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "documento") {
      const ehPdf = mimeType.includes("pdf");
      const ehAudioArquivo = mimeType.startsWith("audio/");

      return (
        <div>
          <p className={styles.messageText}>
            <TextoComEmoji texto={`📄 ${fileName}`} />
          </p>

          {caption && (
            <p className={styles.messageText}>
              <TextoComEmoji texto={caption} />
            </p>
          )}

          {ehAudioArquivo && url && (
            <div style={{ marginTop: 8 }}>
              <AudioMessagePlayer
                src={url}
                isOutgoing={msg.origem === "enviada"}
                isVoice={!!msg.metadata_json?.voice}
              />
            </div>
          )}

          {ehPdf && url && (
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ marginTop: 8 }}
              onClick={() =>
                setArquivoPreview({
                  url,
                  nome: fileName,
                  mimeType,
                })
              }
            >
              Abrir PDF
            </button>
          )}

          {!ehPdf && !ehAudioArquivo && url && (
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
              Baixar arquivo
            </a>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "contato") {
      const contatosCompartilhados = msg.metadata_json?.contacts || [];

      return (
        <div className={styles.sharedContactList}>
          {contatosCompartilhados.map((contato, contatoIndex) => {
            const nome = getNomeContatoCompartilhado(contato);
            const telefones = contato.phones || [];
            const emails = contato.emails || [];
            const empresa = contato.org?.company || null;
            const cargo = contato.org?.title || null;

            return (
              <div
                key={`contato-compartilhado-${contatoIndex}`}
                className={styles.sharedContactCard}
              >
                <div className={styles.sharedContactHeader}>
                  <div className={styles.sharedContactAvatar}>
                    {getIniciaisContatoCompartilhado(contato)}
                  </div>

                  <div className={styles.sharedContactInfo}>
                    <p className={styles.sharedContactName}>{nome}</p>

                    {telefones.length > 0 ? (
                      telefones.map((telefone, telIndex) => (
                        <p
                          key={`tel-${contatoIndex}-${telIndex}`}
                          className={styles.sharedContactMeta}
                        >
                          {telefone.phone || telefone.wa_id || "Telefone não informado"}
                          {telefone.type ? ` • ${telefone.type}` : ""}
                        </p>
                      ))
                    ) : (
                      <p className={styles.sharedContactMeta}>Telefone não informado</p>
                    )}
                  </div>
                </div>

                <div className={styles.sharedContactBody}>
                  {emails.map((email, emailIndex) => (
                    <p
                      key={`email-${contatoIndex}-${emailIndex}`}
                      className={styles.sharedContactDetail}
                    >
                      {email.email || "E-mail não informado"}
                      {email.type ? ` • ${email.type}` : ""}
                    </p>
                  ))}

                  {empresa && (
                    <p className={styles.sharedContactDetail}>Empresa: {empresa}</p>
                  )}

                  {cargo && (
                    <p className={styles.sharedContactDetail}>Cargo: {cargo}</p>
                  )}
                </div>

                <div className={styles.sharedContactFooter}>
                  <button
                    type="button"
                    className={styles.sharedContactAddButton}
                    onClick={() => abrirModalAdicionarContato(contato)}
                  >
                    Adicionar contato
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (msg.tipo_mensagem === "localizacao") {
      return (
        <div>
          <p className={styles.messageText}>
            <TextoComEmoji texto="📍 Localização compartilhada" />
          </p>

          {latitude != null && longitude != null && (
            <p className={styles.messageText}>
              Lat: {latitude} <br />
              Lng: {longitude}
            </p>
          )}

          {mapaUrl && (
            <a
              href={mapaUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "14px",
                textDecoration: "underline",
                wordBreak: "break-word",
              }}
            >
              Abrir no Google Maps
            </a>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "unsupported") {
      const tipoNaoSuportado = msg.metadata_json?.unsupported?.type || "desconhecido";

      let titulo = "⚠️ Mensagem não suportada pela API do WhatsApp";

      if (tipoNaoSuportado === "poll_creation") {
        titulo = "📊 Enquete enviada pelo contato";
      }

      if (tipoNaoSuportado === "unknown") {
        titulo = "📅 Evento ou conteúdo não reconhecido";
      }

      return (
        <div>
          <p className={styles.messageText}>
            <TextoComEmoji texto={titulo} />
          </p>

          <p className={styles.messageText}>
            <TextoComEmoji texto="Este tipo de conteúdo ainda não é suportado pela API oficial." />
          </p>

          <p className={styles.messageText}>
            <TextoComEmoji texto={`Tipo técnico: ${tipoNaoSuportado}`} />
          </p>
        </div>
      );
    }

    return (
      <p className={styles.messageText}>
        <TextoComEmoji texto={msg.conteudo} />
      </p>
    );
  }


  function capturarFoto() {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const file = new File([blob], `foto-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      selecionarArquivo(file);
    }, "image/jpeg");

    fecharCamera();
  }


  function fecharCamera() {
    if (streamCameraRef.current) {
      streamCameraRef.current.getTracks().forEach((track) => track.stop());
      streamCameraRef.current = null;
    }

    setCameraAberta(false);
  }

  async function iniciarGravacaoAudio() {
    try {
      setErro("");
      setMensagemSucesso("");

      if (arquivoEnvioPreviewUrl) {
        URL.revokeObjectURL(arquivoEnvioPreviewUrl);
      }

      setArquivoEnvio(null);
      setArquivoEnvioPreviewUrl(null);
      setLegendaArquivo("");
      setConteudo("");
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }

      if (legendaEditorRef.current) {
        legendaEditorRef.current.innerHTML = "";
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = "";

      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const tipoFinal =
          mediaRecorder.mimeType || mimeType || "audio/webm";

        const blob = new Blob(audioChunksRef.current, {
          type: tipoFinal,
        });

        const arquivo = new File([blob], `audio-${Date.now()}.webm`, {
          type: tipoFinal,
        });

        selecionarArquivo(arquivo);

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
      };

      mediaRecorder.start();
      setGravandoAudio(true);
      setDuracaoGravacao(0);

      intervaloGravacaoRef.current = window.setInterval(() => {
        setDuracaoGravacao((atual) => atual + 1);
      }, 1000);
    } catch {
      setErro("Não foi possível acessar o microfone.");
      setGravandoAudio(false);
    }
  }

  function pararGravacaoAudio() {
    if (intervaloGravacaoRef.current) {
      window.clearInterval(intervaloGravacaoRef.current);
      intervaloGravacaoRef.current = null;
    }

    setGravandoAudio(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  function formatarDuracaoGravacao(segundos: number) {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function abrirModalAdicionarContato(contato: ContatoCompartilhadoMensagem) {
    const nome = getNomeContatoCompartilhado(contato);
    const telefone = getTelefonePrincipalContatoCompartilhado(contato);
    const email = getEmailPrincipalContatoCompartilhado(contato);
    const empresa = contato.org?.company || "";
    const cargo = contato.org?.title || "";

    setErro("");
    setMensagemSucesso("");

    setContatoCadastroForm({
      nome,
      telefone,
      email,
      origem: "whatsapp_compartilhado",
      campanha: "",
      status_lead: "novo",
      observacoes:
        [
          "Contato adicionado a partir de contato compartilhado no WhatsApp.",
          empresa ? `Empresa: ${empresa}` : "",
          cargo ? `Cargo: ${cargo}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
    });

    setModalAdicionarContatoAberto(true);
  }

  function fecharModalAdicionarContato() {
    setModalAdicionarContatoAberto(false);
    setSalvandoContatoCompartilhado(false);
    setContatoCadastroForm({
      nome: "",
      telefone: "",
      email: "",
      origem: "whatsapp_compartilhado",
      campanha: "",
      status_lead: "novo",
      observacoes: "",
    });
  }

  function selecionarArquivo(
    file: File | null,
    input?: HTMLInputElement | null
  ) {
    if (arquivoEnvioPreviewUrl) {
      URL.revokeObjectURL(arquivoEnvioPreviewUrl);
    }

    if (!file) {
      setArquivoEnvio(null);
      setArquivoEnvioPreviewUrl(null);

      if (input) input.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setArquivoEnvio(file);
    setArquivoEnvioPreviewUrl(previewUrl);
    setConteudo("");
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }

    if (input) {
      input.value = "";
    }
  }

  async function salvarContatoCompartilhado() {
    if (!contatoCadastroForm.telefone.trim()) {
      setErro("Telefone é obrigatório.");
      return;
    }

    try {
      setSalvandoContatoCompartilhado(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(contatoCadastroForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao criar contato");
        return;
      }

      setMensagemSucesso(data.message || "Contato criado com sucesso.");
      fecharModalAdicionarContato();
    } catch {
      setErro("Erro ao criar contato");
    } finally {
      setSalvandoContatoCompartilhado(false);
    }
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

  async function carregarConversas(silencioso = false) {
    try {
      if (!silencioso) {
        setLoadingConversas(true);
      }

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

        if (!encontrada) {
          return lista[0];
        }

        const mudouVisualPrincipal =
          encontrada.id !== atual.id ||
          encontrada.last_message_at !== atual.last_message_at ||
          encontrada.status !== atual.status ||
          encontrada.prioridade !== atual.prioridade ||
          encontrada.favorita !== atual.favorita ||
          encontrada.unread_count !== atual.unread_count ||
          encontrada.assunto !== atual.assunto ||
          encontrada.responsavel?.id !== atual.responsavel?.id ||
          encontrada.setores?.id !== atual.setores?.id;

        return mudouVisualPrincipal ? encontrada : atual;
      });
    } catch {
      setErro("Erro ao carregar conversas");
    } finally {
      if (!silencioso) {
        setLoadingConversas(false);
      }
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

    const textoAtual = conteudoRef.current.trim();

    if (!textoAtual) {
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
          conteudo: textoAtual,
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

      conteudoRef.current = "";
      setConteudo("");
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }

      setMensagemSucesso(data.message || "Mensagem enviada com sucesso.");

      impedirAutoScrollRef.current = false;
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

  async function enviarMidia(file?: File | null) {
    const arquivo = file || arquivoEnvio;

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

    if (!arquivo) {
      setErro("Selecione um arquivo.");
      return;
    }

    try {
      setEnviando(true);

      const formData = new FormData();
      formData.append("conversa_id", conversaSelecionada.id);
      formData.append("file", arquivo);

      const legendaAtual = legendaArquivoRef.current.trim();

      if (legendaAtual) {
        formData.append("caption", legendaAtual);
      }

      const res = await fetch("/api/mensagens/media", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao enviar mídia");
        return;
      }

      if (arquivoEnvioPreviewUrl) {
        URL.revokeObjectURL(arquivoEnvioPreviewUrl);
      }

      setArquivoEnvio(null);
      setArquivoEnvioPreviewUrl(null);
      setLegendaArquivo("");
      if (legendaEditorRef.current) {
        legendaEditorRef.current.innerHTML = "";
      }
      setMensagemSucesso(data.message || "Mídia enviada com sucesso.");

      impedirAutoScrollRef.current = false;
      await carregarMensagens(conversaSelecionada.id, true);
      await carregarConversas();
    } catch {
      setErro("Erro ao enviar mídia");
    } finally {
      setEnviando(false);
    }
  }

  async function salvarContatoCampo(
    campo: "email" | "empresa" | "observacoes",
    valor: string
  ) {
    if (!conversaSelecionada?.contatos?.id) return;

    try {
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/contatos/${conversaSelecionada.contatos.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [campo]: valor,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar contato");
        return;
      }

      setMensagemSucesso(data.message || "Contato atualizado com sucesso.");
      setEditandoCampo(null);

      await carregarConversas(true);
    } catch {
      setErro("Erro ao atualizar contato");
    }
  }

  async function salvarProtocolo(valor: string) {
    if (!conversaSelecionada?.id) return;

    try {
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocolo: valor,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar protocolo");
        return;
      }

      setMensagemSucesso(data.message || "Protocolo atualizado com sucesso.");
      setEditandoCampo(null);

      await carregarConversas(true);
    } catch {
      setErro("Erro ao atualizar protocolo");
    }
  }


  function abrirEncerrar() {
    setErro("");
    setMensagemSucesso("");
    setAcaoAberta("encerrar");
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

  function getTipoArquivoSelecionado(file: File | null) {
    if (!file) return "";

    if (file.type.startsWith("image/")) return "Imagem";
    if (file.type.startsWith("video/")) return "Vídeo";
    if (file.type.startsWith("audio/")) return "Áudio";

    return "Documento";
  }

  function arquivoSelecionadoEhImagem(file: File | null) {
    return !!file && file.type.startsWith("image/");
  }

  function arquivoSelecionadoEhVideo(file: File | null) {
    return !!file && file.type.startsWith("video/");
  }

  function arquivoSelecionadoEhAudio(file: File | null) {
    return !!file && file.type.startsWith("audio/");
  }

  function arquivoSelecionadoEhDocumento(file: File | null) {
    if (!file) return false;

    return (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/") &&
      !file.type.startsWith("audio/")
    );
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
      if (!conversaSelecionada?.id) return;
      if (!abaVisivel) return;
      if (enviando) return;
      if (editandoCampo) return;

    const interval = window.setInterval(() => {
      impedirAutoScrollRef.current = true;
      carregarMensagens(conversaSelecionada.id, true);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [conversaSelecionada?.id, abaVisivel, enviando]);

  useEffect(() => {
      if (!abaVisivel) return;
      if (enviando) return;
      if (editandoCampo) return;

    const interval = window.setInterval(() => {
      carregarConversas(true);
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [abaVisivel, enviando]);

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

  useEffect(() => {
    function atualizarVisibilidade() {
      setAbaVisivel(document.visibilityState === "visible");
    }

    atualizarVisibilidade();

    document.addEventListener("visibilitychange", atualizarVisibilidade);

    return () => {
      document.removeEventListener("visibilitychange", atualizarVisibilidade);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (arquivoEnvioPreviewUrl) {
        URL.revokeObjectURL(arquivoEnvioPreviewUrl);
      }
    };
  }, [arquivoEnvioPreviewUrl]);

  useEffect(() => {
    function handleClickOutsideMenuAnexo(event: MouseEvent) {
      if (!menuAnexoRef.current) return;

      const target = event.target as Node;

      if (!menuAnexoRef.current.contains(target)) {
        setMenuAnexoAberto(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutsideMenuAnexo);

    return () => {
      document.removeEventListener("mousedown", handleClickOutsideMenuAnexo);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (intervaloGravacaoRef.current) {
        window.clearInterval(intervaloGravacaoRef.current);
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);


  useEffect(() => {
    if (!arquivoEnvio && editorRef.current && editorRef.current.innerText !== conteudo) {
      editorRef.current.innerText = conteudo;
    }
  }, [conteudo, arquivoEnvio]);

  useEffect(() => {
    if (arquivoEnvio && legendaEditorRef.current && legendaEditorRef.current.innerText !== legendaArquivo) {
      legendaEditorRef.current.innerText = legendaArquivo;
    }
  }, [legendaArquivo, arquivoEnvio]);

  
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
                    onClick={() => carregarConversas()}
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
                                    <Fragment key={msg.id}>
                                      <div
                                        id={`mensagem-${msg.id}`}
                                        className={`${styles.messageRow} ${
                                          isOutgoing ? styles.messageRowOutgoing : styles.messageRowIncoming
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
                                          (msg.remetente_tipo === "bot" || msg.remetente_tipo === "ia") && (
                                            <div className={styles.messageMetaTop}>
                                              <span className={styles.senderLabel}>
                                                {getRemetenteLabel(msg.remetente_tipo)}
                                              </span>

                                              {isAutomatic && (
                                                <span className={styles.automaticBadge}>automática</span>
                                              )}
                                            </div>
                                          )}

                                        <div className={styles.messageContentRow}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            {renderizarConteudoMensagem(msg)}
                                          </div>

                                          {(msg.remetente_tipo === "usuario" ||
                                            msg.remetente_tipo === "contato") && (
                                            <button
                                              type="button"
                                              className={`${styles.messageFavoriteButton} ${
                                                msg.favorita ? styles.messageFavoriteButtonActive : ""
                                              }`}
                                              onClick={() => alternarMensagemFavorita(msg)}
                                              title={
                                                msg.favorita
                                                  ? "Remover dos favoritos"
                                                  : "Adicionar aos favoritos"
                                              }
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

                                    {mensagemTemMidiaExpiravel(msg) && (
                                      <div className={styles.expiringMediaNoticeRow}>
                                        <div className={styles.expiringMediaNoticeBadge}>
                                          ~ Esta mídia pode expirar em até 7 dias. Para manter o acesso, faça o
                                          download enquanto estiver disponível.
                                        </div>
                                      </div>
                                    )}
                                  </Fragment>
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

                          <input
                            ref={documentoInputRef}
                            type="file"
                            style={{ display: "none" }}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.ppt,.pptx"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              selecionarArquivo(file, e.currentTarget);
                            }}
                          />

                          <input
                            ref={midiaInputRef}
                            type="file"
                            style={{ display: "none" }}
                            accept="image/*,video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              selecionarArquivo(file, e.currentTarget);
                            }}
                          />

                          <input
                            ref={audioInputRef}
                            type="file"
                            style={{ display: "none" }}
                            accept="audio/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              selecionarArquivo(file, e.currentTarget);
                            }}
                          />

                          {arquivoEnvio && (
                            <div className={styles.filePreviewCard}
                              style={{
                                marginBottom: 10,
                                border: "1px solid rgba(148, 163, 184, 0.22)",
                                borderRadius: 14,
                                padding: 12,
                                background: "rgba(255,255,255,0.72)",
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                            <div className={styles.filePreviewHeader}>
                              <div className={styles.filePreviewLabel}>
                                {getTipoArquivoSelecionado(arquivoEnvio)} selecionado
                              </div>

                              <button
                                type="button"
                                className={styles.filePreviewRemoveButton}
                                onClick={() => {
                                  if (arquivoEnvioPreviewUrl) {
                                    URL.revokeObjectURL(arquivoEnvioPreviewUrl);
                                  }

                                  setArquivoEnvio(null);
                                  setArquivoEnvioPreviewUrl(null);
                                  setLegendaArquivo("");
                                  if (legendaEditorRef.current) {
                                    legendaEditorRef.current.innerHTML = "";
                                  }
                                }}
                              >
                                Remover
                              </button>
                            </div>

                              {arquivoSelecionadoEhImagem(arquivoEnvio) && arquivoEnvioPreviewUrl && (
                                <div>
                                  <img
                                    src={arquivoEnvioPreviewUrl}
                                    alt={arquivoEnvio.name}
                                    style={{
                                      maxWidth: "220px",
                                      maxHeight: "220px",
                                      width: "auto",
                                      height: "auto",
                                      borderRadius: 12,
                                      display: "block",
                                    }}
                                  />
                                </div>
                              )}

                              {arquivoSelecionadoEhVideo(arquivoEnvio) && arquivoEnvioPreviewUrl && (
                                <div>
                                  <video
                                    controls
                                    style={{
                                      maxWidth: "260px",
                                      width: "100%",
                                      borderRadius: 12,
                                      display: "block",
                                    }}
                                  >
                                    <source src={arquivoEnvioPreviewUrl} type={arquivoEnvio.type} />
                                    Seu navegador não suporta vídeo.
                                  </video>
                                </div>
                              )}

                              {arquivoSelecionadoEhAudio(arquivoEnvio) && arquivoEnvioPreviewUrl && (
                                <div className={styles.audioPreviewCard}>
                                  <div className={styles.audioPreviewTop}>
                                    <div className={styles.audioPreviewBadge}>Áudio</div>
                                    <span className={styles.audioPreviewFileName}>{arquivoEnvio.name}</span>
                                  </div>

                                  <div className={styles.audioPreviewPlayerWrap}>
                                    <audio controls className={styles.audioPreviewPlayer}>
                                      <source src={arquivoEnvioPreviewUrl} type={arquivoEnvio.type} />
                                      Seu navegador não suporta áudio.
                                    </audio>
                                  </div>
                                </div>
                              )}

                               <div
                                style={{
                                  fontSize: 13,
                                  color: "#64748b",
                                  wordBreak: "break-word",
                                }}
                              >
                                {arquivoEnvio.name}
                              </div>
                            </div>
                          )}

                          {cameraAberta && (
                            <div className={styles.cameraModal}>
                              <video ref={videoRef} autoPlay playsInline className={styles.cameraVideo} />

                              <div className={styles.cameraActions}>
                                <button onClick={capturarFoto}>📸 Tirar foto</button>
                                <button onClick={fecharCamera}>Cancelar</button>
                              </div>

                              <canvas ref={canvasRef} style={{ display: "none" }} />
                            </div>
                          )}

                          {gravandoAudio && (
                            <div className={styles.timelineInfoSmall}>
                              Gravando áudio... <strong>{formatarDuracaoGravacao(duracaoGravacao)}</strong>
                            </div>
                          )}

                          <div className={styles.composerRow}>
                            {/* ESQUERDA */}
                            <div className={styles.composerLeft}>
                              <div ref={menuAnexoRef} className={styles.attachmentMenuWrap}>
                                <button
                                  type="button"
                                  className={styles.toolButton}
                                  onClick={() => setMenuAnexoAberto((prev) => !prev)}
                                  title="Anexos"
                                >
                                  ＋
                                </button>

                                {menuAnexoAberto && (
                                  <div className={styles.attachmentMenuDropdown}>
                                    <button
                                      type="button"
                                      className={styles.attachmentMenuItem}
                                      onClick={() => {
                                        setMenuAnexoAberto(false);
                                        documentoInputRef.current?.click();
                                      }}
                                    >
                                      <span className={styles.attachmentMenuIcon}>📎</span>
                                      <span>Documento</span>
                                    </button>

                                    <button
                                      type="button"
                                      className={styles.attachmentMenuItem}
                                      onClick={() => {
                                        setMenuAnexoAberto(false);
                                        midiaInputRef.current?.click();
                                      }}
                                    >
                                      <span className={styles.attachmentMenuIcon}>🖼️</span>
                                      <span>Foto ou vídeo</span>
                                    </button>

                                    <button
                                      type="button"
                                      className={styles.attachmentMenuItem}
                                      onClick={() => {
                                        setMenuAnexoAberto(false);
                                        audioInputRef.current?.click();
                                      }}
                                    >
                                      <span className={styles.attachmentMenuIcon}>🎵</span>
                                      <span>Áudio</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className={styles.emojiPickerWrap}>
                                <button
                                  type="button"
                                  className={`${styles.toolButton} ${styles.emojiButton} ${
                                    emojiAberto ? styles.emojiButtonActive : ""
                                  }`}
                                  onClick={() => setEmojiAberto((prev) => !prev)}
                                  title="Emoji"
                                  aria-label="Abrir emojis"
                                >
                                  <span className={styles.emojiButtonIcon}>😊</span>
                                </button>


                              </div>
                            </div>

                            {emojiAberto && (
                              <div className={styles.emojiPicker}>
                                <EmojiPicker
                                  onEmojiClick={(emojiData) => {
                                    inserirEmojiNoEditor(emojiData.emoji);
                                  }}
                                />
                              </div>
                            )}

                            {/* CAMPO */}
                            <div className={styles.composerCenter}>
                              <div
                                ref={arquivoEnvio ? legendaEditorRef : editorRef}
                                className={styles.messageEditor}
                                contentEditable={podeEnviarMensagem && !enviando && !gravandoAudio}
                                suppressContentEditableWarning
                                data-placeholder={
                                  !podeEnviarMensagem
                                    ? "Você não pode responder esta conversa"
                                    : arquivoEnvio
                                    ? "Digite uma legenda..."
                                    : gravandoAudio
                                    ? "Gravando áudio..."
                                    : "Digite uma mensagem"
                                }
                                onInput={(e) => {
                                  const texto = (e.currentTarget as HTMLDivElement).innerText || "";

                                  if (arquivoEnvio) {
                                    legendaArquivoRef.current = texto;
                                  } else {
                                    conteudoRef.current = texto;
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();

                                    if (enviando || !podeEnviarMensagem || gravandoAudio) return;

                                    if (arquivoEnvio) {
                                      enviarMidia();
                                      return;
                                    }

                                    enviarMensagem();
                                  }
                                }}
                                role="textbox"
                                aria-multiline="true"
                              />
                            </div>

                            {/* DIREITA */}
                            <div className={styles.composerRight}>

                              <button
                                type="button"
                                onClick={abrirCamera}
                                className={styles.toolButton}
                                title="Câmera"
                              >
                                📷
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (gravandoAudio) {
                                    pararGravacaoAudio();
                                    return;
                                  }

                                  iniciarGravacaoAudio();
                                }}
                                disabled={!podeEnviarMensagem || enviando}
                                className={styles.toolButton}
                                title={gravandoAudio ? "Parar gravação" : "Gravar áudio"}
                              >
                                {gravandoAudio ? "⏹" : "🎤"}
                              </button>

                              <button
                                onClick={() => {
                                  if (arquivoEnvio) {
                                    enviarMidia();
                                    return;
                                  }

                                  enviarMensagem();
                                }}
                                disabled={
                                  enviando ||
                                  !podeEnviarMensagem ||
                                  gravandoAudio ||
                                  (!arquivoEnvio && !conteudoRef.current.trim())
                                }
                                className={styles.sendButton}
                              >
                                {enviando
                                  ? "Enviando..."
                                  : arquivoEnvio
                                  ? "Enviar"
                                  : "Enviar"}
                              </button>
                            </div>
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

                        <div className={styles.rightPanelTitleWrap}>
                          <h3 className={styles.rightPanelTitle}>
                            {abaPainelDireito === "contato"
                              ? "Dados do contato"
                              : abaPainelDireito === "detalhes"
                              ? "Detalhes"
                              : abaPainelDireito === "historico"
                              ? "Histórico"
                              : abaPainelDireito === "notas"
                              ? "Notas"
                              : abaPainelDireito === "listas"
                              ? "Listas"
                              : abaPainelDireito === "midia_docs_links"
                              ? "Mídia, links e docs"
                              : "Mensagens favoritas"}
                          </h3>

                          {abaPainelDireito === "midia_docs_links" && (
                            <div className={styles.mediaExpiryInfoWrap}>
                              <button
                                type="button"
                                className={styles.mediaExpiryInfoButton}
                                title="Informação sobre expiração da mídia"
                              >
                                i
                              </button>

                              <div className={styles.mediaExpiryInfoTooltip}>
                                As mídias recebidas pelo WhatsApp podem expirar em até 7 dias.
                                Para continuar acessando imagens, vídeos, áudios e arquivos depois
                                desse período, faça o download enquanto a mídia ainda estiver
                                disponível.
                              </div>
                            </div>
                          )}
                        </div>
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
                              onClick={() => {
                                setPainelDireitoAberto(true);
                                setAbaPainelDireito("midia_docs_links");
                                setAbaMidiaDocsLinks("midia");
                              }}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>🖼️</span>
                                <span className={styles.whatsListActionLabel}>
                                  Mídia, links e docs
                                </span>
                              </span>
                              <span className={styles.whatsListActionRight}>
                                {midiaDocsLinksAgrupados.reduce((total, grupo) => total + grupo.itens.length, 0)}
                              </span>
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
                              <CampoContatoEditavel
                                label="PROTOCOLO"
                                valorInicial={conversaSelecionada.protocolo || ""}
                                editando={editandoCampo === "protocolo"}
                                onEditar={() => setEditandoCampo("protocolo")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarProtocolo(valor)}
                              />

                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>Telefone</span>
                                <strong className={styles.whatsInfoValue}>
                                  {conversaSelecionada.contatos?.telefone || "Sem telefone"}
                                </strong>
                              </div>

                              <CampoContatoEditavel
                                label="E-MAIL"
                                valorInicial={conversaSelecionada.contatos?.email || ""}
                                editando={editandoCampo === "email"}
                                onEditar={() => setEditandoCampo("email")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("email", valor)}
                              />

                              <CampoContatoEditavel
                                label="EMPRESA"
                                valorInicial={conversaSelecionada.contatos?.empresa || ""}
                                editando={editandoCampo === "empresa"}
                                onEditar={() => setEditandoCampo("empresa")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("empresa", valor)}
                              />

                              <CampoContatoEditavel
                                label="OBSERVAÇÕES"
                                valorInicial={conversaSelecionada.contatos?.observacoes || ""}
                                editando={editandoCampo === "observacoes"}
                                multiline
                                onEditar={() => setEditandoCampo("observacoes")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("observacoes", valor)}
                              />
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

                                <p className={styles.favoriteMessageText}>
                                  <TextoComEmoji texto={msg.conteudo} />
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      )}


                      {abaPainelDireito === "midia_docs_links" && (
                        <div className={styles.mediaBrowserPanel}>
                          <div className={styles.mediaBrowserTabs}>
                            <button
                              type="button"
                              className={`${styles.mediaBrowserTab} ${
                                abaMidiaDocsLinks === "midia" ? styles.mediaBrowserTabActive : ""
                              }`}
                              onClick={() => setAbaMidiaDocsLinks("midia")}
                            >
                              Mídia
                              <span className={styles.mediaBrowserTabCount}>{totalMidias}</span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.mediaBrowserTab} ${
                                abaMidiaDocsLinks === "documentos" ? styles.mediaBrowserTabActive : ""
                              }`}
                              onClick={() => setAbaMidiaDocsLinks("documentos")}
                            >
                              Documentos
                              <span className={styles.mediaBrowserTabCount}>{totalDocumentos}</span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.mediaBrowserTab} ${
                                abaMidiaDocsLinks === "links" ? styles.mediaBrowserTabActive : ""
                              }`}
                              onClick={() => setAbaMidiaDocsLinks("links")}
                            >
                              Links
                              <span className={styles.mediaBrowserTabCount}>{totalLinks}</span>
                            </button>
                          </div>

                          {midiaDocsLinksFiltrados.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Nenhuma mídia encontrada nesta conversa.
                            </div>
                          ) : (
                            midiaDocsLinksFiltrados.map((grupo) => (
                              <div key={grupo.data} className={styles.mediaBrowserSection}>
                                <div className={styles.mediaBrowserSectionTitle}>{grupo.data}</div>

                                {abaMidiaDocsLinks === "midia" ? (
                                  <div className={styles.mediaBrowserThumbGrid}>
                                    {grupo.itens.map((item) => {
                                      if (item.isImage) {
                                        return (
                                          <button
                                            key={item.id}
                                            type="button"
                                            className={styles.mediaThumbCardCompact}
                                            onClick={() => {
                                              setImagemModalUrl(item.url);
                                              setImagemModalTitulo(item.nome);
                                              setImagemZoom(1);
                                            }}
                                          >
                                            <img
                                              src={item.url}
                                              alt={item.nome}
                                              className={styles.mediaThumbImageCompact}
                                            />
                                            <div className={styles.mediaThumbOverlay}>
                                              <span className={styles.mediaThumbOverlayType}>Imagem</span>
                                              <span className={styles.mediaThumbOverlayTime}>
                                                {formatarHora(item.createdAt)}
                                              </span>
                                            </div>
                                          </button>
                                        );
                                      }

                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          className={styles.mediaThumbCardCompact}
                                          onClick={() =>
                                            setArquivoPreview({
                                              url: item.url,
                                              nome: item.nome,
                                              mimeType: item.mimeType,
                                            })
                                          }
                                        >
                                          <div className={styles.mediaThumbPlaceholderCompact}>🎥</div>
                                          <div className={styles.mediaThumbOverlay}>
                                            <span className={styles.mediaThumbOverlayType}>Vídeo</span>
                                            <span className={styles.mediaThumbOverlayTime}>
                                              {formatarHora(item.createdAt)}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : abaMidiaDocsLinks === "documentos" ? (
                                  <div className={styles.mediaBrowserList}>
                                    {grupo.itens.map((item) => {
                                      if (item.isAudio) {
                                        return (
                                          <div key={item.id} className={styles.mediaAudioCard}>
                                            <div className={styles.mediaAudioHeader}>
                                              <strong className={styles.mediaDocTitle}>{item.nome}</strong>
                                              <span className={styles.mediaDocMeta}>
                                                Áudio • {formatarHora(item.createdAt)}
                                              </span>
                                            </div>

                                            <AudioMessagePlayer src={item.url} fileName={item.nome} />
                                          </div>
                                        );
                                      }

                                      if (item.isPdf) {
                                        return (
                                          <button
                                            key={item.id}
                                            type="button"
                                            className={styles.mediaDocCard}
                                            onClick={() =>
                                              setArquivoPreview({
                                                url: item.url,
                                                nome: item.nome,
                                                mimeType: item.mimeType,
                                              })
                                            }
                                          >
                                            <div className={styles.mediaDocIcon}>📄</div>
                                            <div className={styles.mediaDocContent}>
                                              <strong className={styles.mediaDocTitle}>{item.nome}</strong>
                                              <span className={styles.mediaDocMeta}>
                                                PDF • {formatarHora(item.createdAt)}
                                              </span>
                                            </div>
                                          </button>
                                        );
                                      }

                                      return (
                                        <a
                                          key={item.id}
                                          href={item.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={styles.mediaDocCard}
                                        >
                                          <div className={styles.mediaDocIcon}>📎</div>
                                          <div className={styles.mediaDocContent}>
                                            <strong className={styles.mediaDocTitle}>{item.nome}</strong>
                                            <span className={styles.mediaDocMeta}>
                                              Documento • {formatarHora(item.createdAt)}
                                            </span>
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className={styles.mediaBrowserList}>
                                    {grupo.itens.map((item) => (
                                      <a
                                        key={item.id}
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={styles.mediaLinkCard}
                                      >
                                        <div className={styles.mediaLinkIcon}>🔗</div>
                                        <div className={styles.mediaLinkContent}>
                                          <strong className={styles.mediaLinkTitle}>Link</strong>
                                          <span className={styles.mediaLinkUrl}>{item.url}</span>
                                          <span className={styles.mediaDocMeta}>
                                            {formatarHora(item.createdAt)}
                                          </span>
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                )}
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

      {modalAdicionarContatoAberto && (
        <div
          className={styles.contactModalOverlay}
          onClick={fecharModalAdicionarContato}
        >
          <div
            className={styles.contactModalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.contactModalHeader}>
              <div>
                <h3 className={styles.contactModalTitle}>Adicionar contato</h3>
                <p className={styles.contactModalSubtitle}>
                  Revise e complete os dados antes de salvar.
                </p>
              </div>

              <button
                type="button"
                className={styles.textButton}
                onClick={fecharModalAdicionarContato}
              >
                ×
              </button>
            </div>

            <div className={styles.contactModalBody}>
              <div className={styles.contactModalGrid}>
                <div className={styles.contactModalField}>
                  <label className={styles.actionLabel}>Nome</label>
                  <input
                    className={styles.messageInput}
                    value={contatoCadastroForm.nome}
                    onChange={(e) =>
                      setContatoCadastroForm((atual) => ({
                        ...atual,
                        nome: e.target.value,
                      }))
                    }
                    placeholder="Nome do contato"
                  />
                </div>

                <div className={styles.contactModalField}>
                  <label className={styles.actionLabel}>Telefone</label>
                  <input
                    className={styles.messageInput}
                    value={contatoCadastroForm.telefone}
                    onChange={(e) =>
                      setContatoCadastroForm((atual) => ({
                        ...atual,
                        telefone: e.target.value,
                      }))
                    }
                    placeholder="Telefone"
                  />
                </div>

                <div className={styles.contactModalField}>
                  <label className={styles.actionLabel}>E-mail</label>
                  <input
                    className={styles.messageInput}
                    value={contatoCadastroForm.email}
                    onChange={(e) =>
                      setContatoCadastroForm((atual) => ({
                        ...atual,
                        email: e.target.value,
                      }))
                    }
                    placeholder="E-mail"
                  />
                </div>

                <div className={styles.contactModalField}>
                  <label className={styles.actionLabel}>Origem</label>
                  <input
                    className={styles.messageInput}
                    value={contatoCadastroForm.origem}
                    onChange={(e) =>
                      setContatoCadastroForm((atual) => ({
                        ...atual,
                        origem: e.target.value,
                      }))
                    }
                    placeholder="Origem"
                  />
                </div>

                <div className={styles.contactModalField}>
                  <label className={styles.actionLabel}>Campanha</label>
                  <input
                    className={styles.messageInput}
                    value={contatoCadastroForm.campanha}
                    onChange={(e) =>
                      setContatoCadastroForm((atual) => ({
                        ...atual,
                        campanha: e.target.value,
                      }))
                    }
                    placeholder="Campanha"
                  />
                </div>

                <div className={styles.contactModalField}>
                  <label className={styles.actionLabel}>Status do lead</label>
                  <select
                    className={styles.actionSelect}
                    value={contatoCadastroForm.status_lead}
                    onChange={(e) =>
                      setContatoCadastroForm((atual) => ({
                        ...atual,
                        status_lead: e.target.value as StatusLeadContato,
                      }))
                    }
                  >
                    <option value="novo">Novo</option>
                    <option value="em_atendimento">Em atendimento</option>
                    <option value="qualificado">Qualificado</option>
                    <option value="cliente">Cliente</option>
                    <option value="perdido">Perdido</option>
                  </select>
                </div>
              </div>

              <div className={styles.contactModalField}>
                <label className={styles.actionLabel}>Observações</label>
                <textarea
                  className={styles.noteInput}
                  rows={5}
                  value={contatoCadastroForm.observacoes}
                  onChange={(e) =>
                    setContatoCadastroForm((atual) => ({
                      ...atual,
                      observacoes: e.target.value,
                    }))
                  }
                  placeholder="Observações"
                />
              </div>

              <div className={styles.actionButtons}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={fecharModalAdicionarContato}
                  disabled={salvandoContatoCompartilhado}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={salvarContatoCompartilhado}
                  disabled={salvandoContatoCompartilhado}
                >
                  {salvandoContatoCompartilhado ? "Salvando..." : "Salvar contato"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {imagemModalUrl && (
        <div
          onClick={() => {
            setImagemModalUrl(null);
            setImagemModalTitulo(null);
            setImagemZoom(1);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 980,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "#fff",
              }}
            >
              <strong>{imagemModalTitulo || "Imagem"}</strong>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setImagemZoom((z) => Math.max(0.8, Number((z - 0.1).toFixed(2))))}
                  className={styles.secondaryButton}
                >
                  −
                </button>

                <button
                  type="button"
                  onClick={() => setImagemZoom(1)}
                  className={styles.secondaryButton}
                >
                  100%
                </button>

                <button
                  type="button"
                  onClick={() => setImagemZoom((z) => Math.min(2.2, Number((z + 0.1).toFixed(2))))}
                  className={styles.secondaryButton}
                >
                  ＋
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImagemModalUrl(null);
                    setImagemModalTitulo(null);
                    setImagemZoom(1);
                  }}
                  className={styles.dangerButton}
                >
                  Fechar
                </button>
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: 12,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                maxHeight: "78vh",
              }}
            >
              <img
                src={imagemModalUrl}
                alt={imagemModalTitulo || "Imagem"}
                style={{
                  width: "auto",
                  height: "auto",
                  maxWidth: "82vw",
                  maxHeight: "72vh",
                  objectFit: "contain",
                  transform: `scale(${imagemZoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.18s ease",
                  borderRadius: "12px",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {arquivoPreview && (
        <div
          onClick={() => setArquivoPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 1100,
              height: "88vh",
              background: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>{arquivoPreview.nome}</strong>

              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => setArquivoPreview(null)}
              >
                Fechar
              </button>
            </div>

            <iframe
              src={arquivoPreview.url}
              title={arquivoPreview.nome}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          </div>
        </div>
      )}

    </>
  );
}