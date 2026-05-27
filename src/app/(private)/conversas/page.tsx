"use client";

import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import styles from "./conversas.module.css";
import { can } from "@/lib/permissoes/frontend";
import EmojiPicker from "emoji-picker-react";
import twemoji from "twemoji";

type Conversa = {
  id: string;
  assunto: string | null;
  status: string;
  bot_ativo?: boolean | null;
  prioridade: string | null;
  canal: string | null;
  origem_atendimento?: string | null;
  integracao_whatsapp_id?: string | null;
  last_message_at: string | null;
  started_at?: string | null;
  created_at?: string | null;
  protocolo?: string | null;
  ultima_mensagem?: string | null;
  unread_count?: number | null;
  tem_disparo_agendado_pendente?: boolean;
  disparo_agendado_pendente?: {
    id: string;
    executar_em: string;
    template_nome: string | null;
  } | null;
  setor_id?: string | null;
  responsavel_id?: string | null;
  favorita?: boolean;
  etiqueta_id?: string | null;
  etiqueta_cor?: string | null;
  etiquetas?: {
    id: string;
    nome: string;
    descricao?: string | null;
    cor: string;
  } | null;
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
    botoes?: Array<{
      id?: string | null;
      titulo?: string | null;
    }> | null;
    media_id?: string | null;
    mime_type?: string | null;
    sha256?: string | null;
    caption?: string | null;
    filename?: string | null;
    url?: string | null;
    voice?: boolean | null;
    transcricao_audio?: string | null;
    transcricao_modelo?: string | null;
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
    midia_url?: string | null;
    tipo_midia?: string | null;
    legenda?: string | null;
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

type EtiquetaEmpresa = {
  id: string;
  nome: string;
  descricao?: string | null;
  cor: string;
  ativo?: boolean;
  ordem?: number;
};

type EtiquetaForm = {
  nome: string;
  descricao: string;
  cor: string;
};

const ETIQUETAS_PADRAO = [
  "#60A5FA",
  "#4ADE80",
  "#FACC15",
  "#FB923C",
  "#F87171",
  "#A78BFA",
];


type AbaPainelDireito =
  | "detalhes"
  | "contato"
  | "historico"
  | "notas"
  | "mensagens_favoritas"
  | "listas"
  | "etiquetas"
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

type ProtocoloConversa = {
  id: string;
  conversa_id: string;
  empresa_id: string;
  protocolo: string;
  tipo: "abertura" | "reabertura";
  ativo: boolean;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
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

function formatarDataCurtaDisparo(data?: string | null) {
  if (!data) return "";

  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
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
    case "encerrado_manual":
      return "Encerrado manualmente";
    case "encerrado_24h":
      return "Encerrado após 24h";
    case "encerrado_aut":
      return "Encerrado pela automação";
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
      return "!! não entregue";
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
  const ultimaMensagem = conversa.ultima_mensagem?.trim();
  if (ultimaMensagem) return ultimaMensagem;

  const assunto = conversa.assunto?.trim();
  if (assunto && assunto !== "Atendimento iniciado via WhatsApp") {
    return assunto;
  }

  return conversa.contatos?.telefone || "Sem prévia";
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


function hexToRgba(hex: string, alpha: number) {
  const valor = hex.replace("#", "");

  if (valor.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const numero = parseInt(valor, 16);
  const r = (numero >> 16) & 255;
  const g = (numero >> 8) & 255;
  const b = numero & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTooltipEtiqueta(etiqueta?: {
  nome?: string | null;
  descricao?: string | null;
}) {
  if (!etiqueta?.nome) return "Etiqueta";

  if (etiqueta.descricao?.trim()) {
    return `${etiqueta.nome} — ${etiqueta.descricao}`;
  }

  return etiqueta.nome;
}

type AudioMessagePlayerProps = {
  src: string;
  mimeType?: string;
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
  mimeType = "",
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
  const [erroAudio, setErroAudio] = useState(false);

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

    setErroAudio(false);
    setTocando(false);
    setTempoAtual(0);
    setDuracao(0);

    audio.load();
  }, [src]);

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
      <audio
        key={src}
        ref={audioRef}
        preload="metadata"
        src={src}
        onError={() => {
          setErroAudio(true);
          setTocando(false);
        }}
      >
        {mimeType ? <source src={src} type={mimeType} /> : null}
      </audio>

      {erroAudio && (
        <div className={`${styles.audioTimeInfo} ${textClass}`}>
          Não foi possível reproduzir este áudio. Tente baixar o arquivo.
        </div>
      )}

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

function TranscricaoAudioBox({
  mensagemId,
  textoInicial,
  isOutgoing,
  onTranscricaoSalva,
}: {
  mensagemId: string;
  textoInicial: string;
  isOutgoing: boolean;
  onTranscricaoSalva: (mensagemId: string, transcricao: string) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState(textoInicial || "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const textoGrande = texto.length > 120;

  async function abrirOuGerarTranscricao() {
    setErro("");

    if (texto.trim()) {
      setAberta((prev) => !prev);
      return;
    }

    try {
      setCarregando(true);

      const res = await fetch(`/api/mensagens/${mensagemId}/transcrever-audio`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao transcrever áudio.");
        return;
      }

      const transcricao = data.transcricao || "";

      setTexto(transcricao);
      setAberta(true);
      onTranscricaoSalva(mensagemId, transcricao);
    } catch {
      setErro("Erro ao transcrever áudio.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      className={`${styles.audioTranscriptionBox} ${
        isOutgoing
          ? styles.audioTranscriptionBoxOutgoing
          : styles.audioTranscriptionBoxIncoming
      }`}
    >
      <button
        type="button"
        onClick={abrirOuGerarTranscricao}
        disabled={carregando}
        className={styles.audioTranscriptionToggle}
      >
      {carregando
        ? "Transcrevendo..."
        : aberta
        ? "Ocultar transcrição"
        : texto.trim()
        ? "Ver transcrição"
        : "Gerar transcrição"}
      </button>

      {erro && <p className={styles.messageText}>{erro}</p>}

      {aberta && texto.trim() && (
        <p
          className={`${styles.messageText} ${
            textoGrande
              ? styles.audioTranscriptionTextLarge
              : styles.audioTranscriptionText
          }`}
        >
          <TextoComEmoji texto={texto} />
        </p>
      )}
    </div>
  );
}

function ChatToast({
  sucesso,
  erro,
}: {
  sucesso: string;
  erro: string;
}) {
  if (!sucesso && !erro) return null;

  return (
    <div className={styles.chatToastArea}>
      {sucesso && (
        <div className={`${styles.chatToast} ${styles.chatToastSuccess}`}>
          {sucesso}
        </div>
      )}

      {erro && (
        <div className={`${styles.chatToast} ${styles.chatToastError}`}>
          {erro}
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

function EtiquetaCor({
  etiqueta,
  className = "",
  mostrarTooltip = true,
}: {
  etiqueta?: {
    nome?: string | null;
    descricao?: string | null;
    cor?: string | null;
  } | null;
  className?: string;
  mostrarTooltip?: boolean;
}) {
  if (!etiqueta?.cor) return null;

  return (
    <span className={`${styles.etiquetaTooltipWrap} ${className}`}>
      <span
        className={styles.etiquetaTagPremium}
        style={
          {
            "--tag-bg-1": hexToRgba(etiqueta.cor, 0.26),
            "--tag-bg-2": hexToRgba(etiqueta.cor, 0.48),
            "--tag-border": hexToRgba(etiqueta.cor, 0.34),
          } as React.CSSProperties
        }
      >
        <span className={styles.etiquetaTagHolePremium} />
        <span className={styles.etiquetaTagGlow} />
      </span>

      {mostrarTooltip && (
        <span className={styles.etiquetaTooltip}>
          <strong>{etiqueta.nome || "Etiqueta"}</strong>
          {etiqueta.descricao ? <small>{etiqueta.descricao}</small> : null}
        </span>
      )}
    </span>
  );
}


function getUltimaMensagemRecebidaDoContato(mensagens: Mensagem[]) {
  const recebidasDoContato = mensagens
    .filter(
      (msg) =>
        msg.origem === "recebida" && msg.remetente_tipo === "contato"
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return recebidasDoContato[0] || null;
}

function isJanela24hMetaAberta(ultimaMensagem: Mensagem | null) {
  if (!ultimaMensagem?.created_at) return false;

  const agora = Date.now();
  const ultimaInteracao = new Date(ultimaMensagem.created_at).getTime();
  const diffMs = agora - ultimaInteracao;

  return diffMs <= 24 * 60 * 60 * 1000;
}

function formatarTempoRestanteJanela(createdAt?: string | null) {
  if (!createdAt) return "encerrada";

  const limite = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
  const diff = limite - Date.now();

  if (diff <= 0) return "encerrada";

  const horas = Math.floor(diff / (1000 * 60 * 60));
  const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${horas}h ${minutos}min`;
}



export default function ConversasPage() {
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);
  const [politicaAtendimento, setPoliticaAtendimento] =
    useState<PoliticaAtendimento | null>(null);

  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);

  const LIMITE_CONVERSAS = 20;
  const [temMaisConversas, setTemMaisConversas] = useState(true);
  const [carregandoMaisConversas, setCarregandoMaisConversas] = useState(false);

  const carregandoMaisConversasRef = useRef(false);
  const conversasRef = useRef<Conversa[]>([]);
  const [conversaSelecionada, setConversaSelecionada] =
    useState<Conversa | null>(null);

  useEffect(() => {
    conversasRef.current = conversas;
  }, [conversas]);

  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);

  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("Todas");
  const [canalFiltro, setCanalFiltro] = useState("todos");
  const [setorFiltro, setSetorFiltro] = useState("todos");
  const [responsavelFiltro, setResponsavelFiltro] = useState("todos");
  const [chipRapido, setChipRapido] = useState<
    "Todas" | "minhas" | "favoritos" | "fila" | "nao_lidas" | "sem_responsavel" | "urgentes" | "robo"
  >("Todas");

  const [conteudo, setConteudo] = useState("");
  const [loadingConversas, setLoadingConversas] = useState(false);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [inicioJanelaHistorico, setInicioJanelaHistorico] = useState<string | null>(null);
  const [fimJanelaHistorico, setFimJanelaHistorico] = useState<string | null>(null);

  const [temMaisHistorico, setTemMaisHistorico] = useState(false);
  const [carregandoMaisHistorico, setCarregandoMaisHistorico] = useState(false);

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
  const mensagemMaisAntigaCarregadaRef = useRef<string | null>(null);
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

  const conversaLidaRef = useRef<string | null>(null);

  const [editandoCampo, setEditandoCampo] = useState<string | null>(null);

  const [etiquetasEmpresa, setEtiquetasEmpresa] = useState<EtiquetaEmpresa[]>([]);
  const [carregandoEtiquetas, setCarregandoEtiquetas] = useState(false);
  const [salvandoEtiqueta, setSalvandoEtiqueta] = useState(false);

  const [selecionandoEtiqueta, setSelecionandoEtiqueta] = useState(false);

  const [protocolosConversa, setProtocolosConversa] = useState<ProtocoloConversa[]>([]);
  const [carregandoProtocolos, setCarregandoProtocolos] = useState(false);
  const [protocoloSelecionadoId, setProtocoloSelecionadoId] = useState<string | null>(null);
  const [protocoloSelecionadoNumero, setProtocoloSelecionadoNumero] = useState<string | null>(null);

  const [templateDisparoId, setTemplateDisparoId] = useState("");
  const [templateDisparoNome, setTemplateDisparoNome] = useState("");
  const [templateDisparoBody1, setTemplateDisparoBody1] = useState("");
  const [enviandoDisparoIndividual, setEnviandoDisparoIndividual] = useState(false);
  const [disparoIndividualAberto, setDisparoIndividualAberto] = useState(false);

  const [previewCustoDisparoIndividual, setPreviewCustoDisparoIndividual] = useState<{
    categoria: string;
    totalSelecionados: number;
    totalIsentos: number;
    totalCobrados: number;
    valorUnitarioUsd: number;
    valorTotalUsd: number;
    cotacaoUsdBrl: number;
    valorTotalBrlEstimado: number;
    valorTotalBrlMin: number;
    valorTotalBrlMax: number;
    margemMinPercent: number;
    margemMaxPercent: number;
    fonteCotacao?: string;
    cotacaoDataHora?: string | null;
    cotacaoFallback?: boolean;
  } | null>(null);

  const [loadingPreviewCustoDisparoIndividual, setLoadingPreviewCustoDisparoIndividual] = useState(false);  

  const [templatesWhatsapp, setTemplatesWhatsapp] = useState<
    {
      id: string;
      nome: string;
      idioma?: string | null;
      status?: string | null;
      categoria?: string | null;
      integracao_whatsapp_id?: string | null;
      payload?: {
        name?: string;
        language?: string;
        components?: Array<{
          type: string;
          text?: string;
          format?: string;
          buttons?: Array<{
            type?: string;
            text?: string;
            url?: string;
            phone_number?: string;
          }>;
        }>;
      } | null;
    }[]
  >([]);

  const [parametros, setParametros] = useState<string[]>([]);
  const [carregandoTemplatesWhatsapp, setCarregandoTemplatesWhatsapp] = useState(false);

  const [mostrarFormularioEtiqueta, setMostrarFormularioEtiqueta] = useState(false);
  const [etiquetaEditandoId, setEtiquetaEditandoId] = useState<string | null>(null);
  const [etiquetaConfirmandoExclusaoId, setEtiquetaConfirmandoExclusaoId] =
    useState<string | null>(null);

  const [etiquetaForm, setEtiquetaForm] = useState<EtiquetaForm>({
    nome: "",
    descricao: "",
    cor: ETIQUETAS_PADRAO[0],
  });

  const midiaDocsLinksAgrupados = useMemo<MidiaAgrupadaSecao[]>(() => {
    const itens: MidiaAgrupadaItem[] = [];

    for (const msg of mensagens) {
      const mediaId = msg.metadata_json?.media_id || null;
      const mimeType = msg.metadata_json?.mime_type || "";
      const caption =
        msg.metadata_json?.caption ||
        msg.metadata_json?.legenda ||
        null;
      const filename = msg.metadata_json?.filename || null;
      const urlMidia =
        msg.metadata_json?.midia_url ||
        msg.metadata_json?.url ||
        (mediaId ? `/api/whatsapp/media/${mediaId}` : null);

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
  const restaurarScrollHistoricoRef = useRef<{
    scrollTop: number;
    scrollHeight: number;
  } | null>(null);

  const forcarScrollParaFinalRef = useRef(false);
  const acompanharCrescimentoChatRef = useRef(false);

  const totalMensagensAnteriorRef = useRef(0);
  const ultimaMensagemIdAnteriorRef = useRef<string | null>(null);
  const usuarioEstavaNoFinalRef = useRef(true);

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

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(alvo);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function inserirEmojiNoEditor(emoji: string) {
    const alvo = arquivoEnvio ? legendaEditorRef.current : editorRef.current;
    if (!alvo) return;

    const textoAtual = alvo.textContent || "";
    const novoTexto = textoAtual + emoji;

    alvo.textContent = novoTexto;

    if (arquivoEnvio) {
      legendaArquivoRef.current = novoTexto;
      setLegendaArquivo(novoTexto);
    } else {
      conteudoRef.current = novoTexto;
      setConteudo(novoTexto);
    }

    requestAnimationFrame(() => {
      focarEditorNoFinal();
    });
  }

  function atualizarTranscricaoMensagem(mensagemId: string, transcricao: string) {
  setMensagens((atuais) =>
    atuais.map((msg) => {
      if (msg.id !== mensagemId) return msg;

      return {
        ...msg,
        conteudo: transcricao || msg.conteudo,
        metadata_json: {
          ...(msg.metadata_json || {}),
          transcricao_audio: transcricao,
        },
      };
    })
  );
}
  
  function renderizarConteudoMensagem(msg: Mensagem) {
    const mediaId = msg.metadata_json?.media_id || null;

    const url =
      mediaId
        ? `/api/whatsapp/media/${mediaId}`
        : msg.metadata_json?.midia_url ||
          msg.metadata_json?.url ||
          null;

    const caption =
      msg.metadata_json?.caption ||
      msg.metadata_json?.legenda ||
      null;

    const fileName =
      msg.metadata_json?.filename ||
      (msg.tipo_mensagem === "video"
        ? "video.mp4"
        : msg.tipo_mensagem === "imagem"
        ? "imagem"
        : "documento");

    const mimeType =
      msg.metadata_json?.mime_type ||
      (msg.tipo_mensagem === "video"
        ? "video/mp4"
        : msg.tipo_mensagem === "imagem"
        ? "image/jpeg"
        : "");
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
              className={styles.mediaImageButton}
            >
              <img
                src={url}
                alt={caption || "Imagem recebida"}
                className={styles.messageImage}
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
              <TextoComEmoji texto={caption} />
            </p>
          )}
        </div>
      );
    }

    if (msg.tipo_mensagem === "audio") {
      const audioFileName =
        msg.metadata_json?.filename ||
        (mimeType.includes("ogg")
          ? "audio.ogg"
          : mimeType.includes("mpeg")
          ? "audio.mp3"
          : mimeType.includes("mp4")
          ? "audio.m4a"
          : "audio");

      const transcricaoAudio =
        msg.metadata_json?.transcricao_audio?.trim() || "";

      return (
        <div>
          {url ? (
            <AudioMessagePlayer
              src={url}
              mimeType={mimeType || "audio/ogg"}
              isOutgoing={msg.origem === "enviada"}
              isVoice={!!msg.metadata_json?.voice}
              fileName={audioFileName}
            />
          ) : (
            <p className={styles.messageText}>
              <TextoComEmoji texto="🎵 Áudio recebido" />
            </p>
          )}

          <TranscricaoAudioBox
            mensagemId={msg.id}
            textoInicial={transcricaoAudio}
            isOutgoing={msg.origem === "enviada"}
            onTranscricaoSalva={atualizarTranscricaoMensagem}
          />
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
              className={`${styles.messageVideo} ${
                caption ? styles.messageVideoWithCaption : ""
              }`}
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
            <div className={styles.documentAudioWrap}>
              <AudioMessagePlayer
                src={url}
                mimeType={mimeType}
                isOutgoing={msg.origem === "enviada"}
                isVoice={!!msg.metadata_json?.voice}
                fileName={fileName}
              />
            </div>
          )}

          {ehPdf && url && (
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.documentActionButton}`}
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
              className={styles.messageFileLink}
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

    if (msg.tipo_mensagem === "botao") {
      const botoes = msg.metadata_json?.botoes || [];

      return (
        <div>
          <p className={styles.messageText}>
            <TextoComEmoji texto={msg.conteudo} />
          </p>

          {botoes.length > 0 && (
            <div className={styles.buttonMessageOptions}>
              {botoes.map((botao, index) => (
                <div
                  key={`${botao.id || botao.titulo || "botao"}-${index}`}
                  className={styles.buttonMessageOption}
                >
                  <TextoComEmoji texto={botao.titulo || botao.id || "Opção"} />
                </div>
              ))}
            </div>
          )}
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
    conteudoRef.current = "";
    if (editorRef.current) {
      editorRef.current.textContent = "";
    }

    if (input) {
      input.value = "";
    }
  }


  function atualizarParametro(index: number, valor: string) {
    setParametros((atual) => {
      const copia = [...atual];
      copia[index] = valor;
      return copia;
    });
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

  function montarQueryConversas(offset: number, limit: number) {
    const params = new URLSearchParams();

    params.set("limit", String(limit));
    params.set("offset", String(offset));

    if (buscaDebounced) {
      params.set("busca", buscaDebounced);
    }

    if (statusFiltro !== "Todas") {
      params.set("status", statusFiltro);
    }

    if (canalFiltro !== "todos") {
      params.set("canal", canalFiltro);
    }

    if (setorFiltro !== "todos") {
      params.set("setor_id", setorFiltro);
    }

    if (responsavelFiltro !== "todos") {
      params.set("responsavel_id", responsavelFiltro);
    }

    if (chipRapido !== "Todas") {
      params.set("chip", chipRapido);
    }

    if (listaFiltroId) {
      params.set("lista_id", listaFiltroId);
    }

    return params.toString();
  }


    async function carregarConversas(
      silencioso = false,
      append = false,
      limitCustom?: number
    ) {
      try {
        if (append && carregandoMaisConversasRef.current) {
          return conversasRef.current;
        }

        if (!silencioso && !append) {
          setLoadingConversas(true);
        }

        if (append) {
          carregandoMaisConversasRef.current = true;
          setCarregandoMaisConversas(true);
        }

        setErro("");

        const conversasAtuais = conversasRef.current;
        const offset = append ? conversasAtuais.length : 0;
        const limiteBusca = limitCustom || LIMITE_CONVERSAS;

        const queryString = montarQueryConversas(offset, limiteBusca);

        const res = await fetch(`/api/conversas?${queryString}`, {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
          setErro(data.error || "Erro ao carregar conversas");
          return conversasAtuais;
        }

        const listaNova: Conversa[] = data.conversas || [];
        setTemMaisConversas(Boolean(data.pagination?.hasMore));

        let listaFinal: Conversa[] = [];

        setConversas((atuais) => {
          const mapa = new Map<string, Conversa>();

          if (append) {
            atuais.forEach((item) => mapa.set(item.id, item));
            listaNova.forEach((item) => mapa.set(item.id, item));
          } else if (silencioso) {
            atuais.forEach((item) => mapa.set(item.id, item));
            listaNova.forEach((item) => mapa.set(item.id, item));
          } else {
            listaNova.forEach((item) => mapa.set(item.id, item));
          }

          listaFinal = Array.from(mapa.values()).sort((a, b) => {
            const aTime = a.last_message_at
              ? new Date(a.last_message_at).getTime()
              : 0;

            const bTime = b.last_message_at
              ? new Date(b.last_message_at).getTime()
              : 0;

            return bTime - aTime;
          });

          conversasRef.current = listaFinal;
          return listaFinal;
        });

        setConversaSelecionada((atual) => {
          if (!atual) return atual;

          const encontrada = listaFinal.find((c) => c.id === atual.id);

          if (!encontrada) return atual;

          return encontrada;
        });

        return listaFinal;
      } catch {
        setErro("Erro ao carregar conversas");
        return conversasRef.current;
      } finally {
        if (!silencioso && !append) {
          setLoadingConversas(false);
        }

        if (append) {
          carregandoMaisConversasRef.current = false;
          setCarregandoMaisConversas(false);
        }
      }
    }

  async function atualizarConversasCarregadas() {
    const quantidadeAtual = Math.max(
      conversasRef.current.length,
      LIMITE_CONVERSAS
    );

    return await carregarConversas(true, false, quantidadeAtual);
  }

  async function carregarMaisConversas() {
    if (loadingConversas) return;
    if (carregandoMaisConversas) return;
    if (carregandoMaisConversasRef.current) return;
    if (!temMaisConversas) return;

    await carregarConversas(true, true);
  }

  function handleScrollListaConversas(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;

    const chegouPertoDoFim =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 220;

    if (chegouPertoDoFim) {
      carregarMaisConversas();
    }
  }

  async function carregarMensagens(
    conversaId: string,
    silencioso = false,
    conversaProtocoloId?: string | null,
    inicioJanela?: string | null,
    fimJanela?: string | null,
    opcoes?: {
      antesDe?: string | null;
      modoAppendHistorico?: boolean;
      modoMergeNovas?: boolean;
    }
  ) {
    try {
      usuarioEstavaNoFinalRef.current = verificarSeUsuarioEstaNoFinal();
      if (!silencioso) {
        setLoadingMensagens(true);
      }

      let url = `/api/mensagens?conversa_id=${conversaId}`;

      if (conversaProtocoloId) {
        url += `&conversa_protocolo_id=${conversaProtocoloId}`;
      }

      if (inicioJanela) {
        url += `&inicio=${encodeURIComponent(inicioJanela)}`;
      }

      if (fimJanela) {
        url += `&fim=${encodeURIComponent(fimJanela)}`;
      }

      if (opcoes?.antesDe) {
        url += `&antes_de=${encodeURIComponent(opcoes.antesDe)}`;
        url += `&limite=30`;
      }

      const res = await fetch(url, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar mensagens");
        return;
      }

      if (opcoes?.modoAppendHistorico) {
        setMensagens((atuais) => {
          const antigas = data.mensagens || [];
          const idsAtuais = new Set(atuais.map((msg) => msg.id));

          const antigasSemDuplicar = antigas.filter(
            (msg: Mensagem) => !idsAtuais.has(msg.id)
          );

          const novaLista = [...antigasSemDuplicar, ...atuais];

          const maisAntiga = novaLista[0]?.created_at || null;
          mensagemMaisAntigaCarregadaRef.current = maisAntiga;
          setInicioJanelaHistorico(maisAntiga);

          return novaLista;
        });
      } else if (opcoes?.modoMergeNovas) {
        setMensagens((atuais) => {
          const recebidas = data.mensagens || [];
          const mapa = new Map<string, Mensagem>();

          [...atuais, ...recebidas].forEach((msg) => {
            mapa.set(msg.id, msg);
          });

          const novaLista = Array.from(mapa.values()).sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );

          const maisAntiga = novaLista[0]?.created_at || null;
          mensagemMaisAntigaCarregadaRef.current = maisAntiga;
          setInicioJanelaHistorico(maisAntiga);

          return novaLista;
        });
      } else {
        const lista = data.mensagens || [];

        setMensagens(lista);

        const maisAntiga = lista[0]?.created_at || null;
        mensagemMaisAntigaCarregadaRef.current = maisAntiga;
        setInicioJanelaHistorico(maisAntiga);
      }

      setTemMaisHistorico(!!data.temMaisHistorico);

      if (inicioJanela) {
        setInicioJanelaHistorico(inicioJanela);
      }

      if (fimJanela) {
        setFimJanelaHistorico(fimJanela);
      }
    } catch {
      setErro("Erro ao carregar mensagens");
    } finally {
      if (!silencioso) {
        setLoadingMensagens(false);
      }
    }
  }

  async function marcarConversaComoLida(conversaId: string) {
    try {
      await fetch(`/api/conversas/${conversaId}/marcar-lida`, {
        method: "POST",
      });
    } catch {}
  }

  async function carregarMaisHistorico() {
    if (
      !conversaSelecionada?.id ||
      carregandoMaisHistorico ||
      mensagens.length === 0
    ) {
      return;
    }

    try {
      setCarregandoMaisHistorico(true);

      const container = mensagensRef.current;

      if (container) {
        restaurarScrollHistoricoRef.current = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
        };
      }

      impedirAutoScrollRef.current = true;
      forcarScrollParaFinalRef.current = false;

      const mensagemMaisAntiga = [...mensagens].sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      )[0];

      if (!mensagemMaisAntiga?.created_at) {
        setTemMaisHistorico(false);
        return;
      }

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        null,
        null,
        {
          antesDe: mensagemMaisAntiga.created_at,
          modoAppendHistorico: true,
        }
      );
    } finally {
      setCarregandoMaisHistorico(false);
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

      await atualizarConversasCarregadas();

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        inicioJanelaHistorico,
        fimJanelaHistorico
      );
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

      const listaAtualizada = await atualizarConversasCarregadas();
      const conversaAtualizada = listaAtualizada.find(
        (c: Conversa) => c.id === conversaSelecionada.id
      );

      const novoFimJanela =
        atualizarFimDaJanelaHistorico(conversaAtualizada?.last_message_at) ||
        fimJanelaHistorico;

      forcarScrollParaFinalRef.current = false;
      acompanharCrescimentoChatRef.current = true;
      impedirAutoScrollRef.current = false;

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        mensagemMaisAntigaCarregadaRef.current || inicioJanelaHistorico,
        novoFimJanela,
        {
          modoMergeNovas: true,
        }
      );
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

      await atualizarConversasCarregadas();

      if (conversaSelecionada?.id) {
        await carregarMensagens(
          conversaSelecionada.id,
          true,
          protocoloSelecionadoId,
          inicioJanelaHistorico,
          fimJanelaHistorico
        );
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

      await atualizarConversasCarregadas();

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        inicioJanelaHistorico,
        fimJanelaHistorico
      );
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

      await atualizarConversasCarregadas();

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        inicioJanelaHistorico,
        fimJanelaHistorico
      );
    } catch {
      setErro("Erro ao atribuir responsável");
    } finally {
      setSalvandoAcao(false);
    }
  }

  async function confirmarEncerramento() {
    await atualizarConversa(
      { status: "encerrado_manual" },
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

      await atualizarConversasCarregadas();

      if (conversaSelecionada?.id) {
        await carregarMensagens(
          conversaSelecionada.id,
          true,
          protocoloSelecionadoId,
          inicioJanelaHistorico,
          fimJanelaHistorico
        );
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

        await carregarMensagens(
          conversaSelecionada.id,
          true,
          protocoloSelecionadoId,
          inicioJanelaHistorico,
          fimJanelaHistorico
        );
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


    async function carregarEtiquetasEmpresa() {
    try {
      setCarregandoEtiquetas(true);

      const res = await fetch("/api/conversas/etiquetas", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar etiquetas");
        return;
      }

      setEtiquetasEmpresa(data.etiquetas || []);
    } catch {
      setErro("Erro ao carregar etiquetas");
    } finally {
      setCarregandoEtiquetas(false);
    }
  }

  function resetarFormularioEtiqueta() {
    setEtiquetaForm({
      nome: "",
      descricao: "",
      cor: ETIQUETAS_PADRAO[0],
    });
    setEtiquetaEditandoId(null);
    setEtiquetaConfirmandoExclusaoId(null);
    setMostrarFormularioEtiqueta(false);
  }

  function iniciarCriacaoEtiqueta() {
    setEtiquetaEditandoId(null);
    setEtiquetaConfirmandoExclusaoId(null);
    setEtiquetaForm({
      nome: "",
      descricao: "",
      cor: ETIQUETAS_PADRAO[0],
    });
    setMostrarFormularioEtiqueta(true);
  }

  function iniciarEdicaoEtiqueta(etiqueta: EtiquetaEmpresa) {
    setEtiquetaConfirmandoExclusaoId(null);
    setEtiquetaEditandoId(etiqueta.id);
    setEtiquetaForm({
      nome: etiqueta.nome || "",
      descricao: etiqueta.descricao || "",
      cor: etiqueta.cor || ETIQUETAS_PADRAO[0],
    });
    setMostrarFormularioEtiqueta(true);
    setSelecionandoEtiqueta(false);
  }

function escaparHtml(valor?: string | null) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRemetenteExportacao(msg: Mensagem) {
  switch (msg.remetente_tipo) {
    case "usuario":
      return "Você";
    case "contato":
      return "Cliente";
    case "bot":
      return "Bot";
    case "ia":
      return "IA";
    case "sistema":
      return "Sistema";
    default:
      return msg.remetente_tipo;
  }
}

function getConteudoExportacao(msg: Mensagem) {
  const caption =
    msg.metadata_json?.caption ||
    msg.metadata_json?.legenda ||
    "";

  if (msg.tipo_mensagem === "imagem") {
    return caption ? `Imagem: ${caption}` : "Imagem recebida/enviada";
  }

  if (msg.tipo_mensagem === "audio") {
    const transcricao = msg.metadata_json?.transcricao_audio || "";
    return transcricao
      ? `Áudio — transcrição: ${transcricao}`
      : "Áudio recebido/enviado";
  }

  if (msg.tipo_mensagem === "video") {
    return caption ? `Vídeo: ${caption}` : "Vídeo recebido/enviado";
  }

  if (msg.tipo_mensagem === "documento") {
    const filename = msg.metadata_json?.filename || "documento";
    return caption ? `Documento: ${filename} — ${caption}` : `Documento: ${filename}`;
  }

  if (msg.tipo_mensagem === "localizacao") {
    const latitude = msg.metadata_json?.location?.latitude;
    const longitude = msg.metadata_json?.location?.longitude;

    if (latitude != null && longitude != null) {
      return `Localização compartilhada: ${latitude}, ${longitude}`;
    }

    return "Localização compartilhada";
  }

  if (msg.tipo_mensagem === "contato") {
    return "Contato compartilhado";
  }

  return msg.conteudo || "";
}

async function buscarTodasMensagensDaConversa(conversaId: string) {
  const url = `/api/mensagens?conversa_id=${encodeURIComponent(
    conversaId
  )}&exportar=true`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  let data: any = null;

  try {
    data = await res.json();
  } catch {
    throw new Error("A API retornou uma resposta inválida ao exportar a conversa.");
  }

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao carregar todas as mensagens.");
  }

  return Array.isArray(data.mensagens) ? data.mensagens : [];
}

async function baixarConversaPDF() {
  if (!conversaSelecionada?.id) {
    alert("Nenhuma conversa selecionada.");
    return;
  }

  try {
    setErro("");
    setMensagemSucesso("");

    const todasMensagens = await buscarTodasMensagensDaConversa(
      conversaSelecionada.id
    );

    if (todasMensagens.length === 0) {
      alert("Nenhuma mensagem encontrada para exportar.");
      return;
    }

    const htmlMensagens = todasMensagens
      .map((msg: Mensagem) => {
        const remetente = getRemetenteExportacao(msg);
        const data = new Date(msg.created_at).toLocaleString("pt-BR");
        const conteudo = getConteudoExportacao(msg);

        return `
          <div style="margin-bottom:12px; page-break-inside: avoid;">
            <strong>${escaparHtml(remetente)}</strong><br/>
            <span style="white-space: pre-wrap;">${escaparHtml(conteudo)}</span><br/>
            <small style="color:gray;">${escaparHtml(data)}</small>
          </div>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>Conversa - ${escaparHtml(conversaSelecionada.contatos?.nome || "")}</title>
          <meta charset="utf-8" />
        </head>
        <body style="font-family: Arial; padding:20px;">
          <h2>Conversa com ${escaparHtml(
            conversaSelecionada.contatos?.nome || "Contato"
          )}</h2>

          <p><strong>Telefone:</strong> ${escaparHtml(
            conversaSelecionada.contatos?.telefone || ""
          )}</p>

          <p><strong>Total de mensagens exportadas:</strong> ${
            todasMensagens.length
          }</p>

          <hr/>

          ${htmlMensagens}
        </body>
      </html>
    `;

    const novaJanela = window.open("", "_blank");

    if (!novaJanela) {
      alert("O navegador bloqueou a abertura da janela de exportação.");
      return;
    }

    novaJanela.document.write(html);
    novaJanela.document.close();

    novaJanela.focus();

    setTimeout(() => {
      novaJanela.print();
    }, 500);
  } catch (error: any) {
    setErro(error?.message || "Erro ao exportar conversa.");
  }
}

  async function salvarEtiquetaEmpresa() {
    const nome = etiquetaForm.nome.trim();
    const descricao = etiquetaForm.descricao.trim();

    if (!nome) {
      setErro("Digite o nome da etiqueta.");
      return;
    }

    if (nome.length > 30) {
      setErro("O nome da etiqueta pode ter no máximo 30 caracteres.");
      return;
    }

    if (descricao.length > 120) {
      setErro("A descrição da etiqueta pode ter no máximo 120 caracteres.");
      return;
    }

    try {
      setSalvandoEtiqueta(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch("/api/conversas/etiquetas", {
        method: etiquetaEditandoId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          etiqueta_id: etiquetaEditandoId,
          nome,
          descricao,
          cor: etiquetaForm.cor,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar etiqueta");
        return;
      }

      setMensagemSucesso(
        data.message ||
          (etiquetaEditandoId
            ? "Etiqueta atualizada com sucesso"
            : "Etiqueta criada com sucesso")
      );

      await carregarEtiquetasEmpresa();
      resetarFormularioEtiqueta();
    } catch {
      setErro("Erro ao salvar etiqueta");
    } finally {
      setSalvandoEtiqueta(false);
    }
  }

  async function excluirEtiquetaEmpresa(etiquetaId: string) {
    try {
      setSalvandoEtiqueta(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch("/api/conversas/etiquetas", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          etiqueta_id: etiquetaId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao excluir etiqueta");
        return;
      }

      setMensagemSucesso(data.message || "Etiqueta excluída com sucesso");
      setEtiquetaConfirmandoExclusaoId(null);

      await carregarEtiquetasEmpresa();
      await atualizarConversasCarregadas();
    } catch {
      setErro("Erro ao excluir etiqueta");
    } finally {
      setSalvandoEtiqueta(false);
    }
  }

  async function definirEtiquetaDaConversa(etiquetaId: string | null) {
    if (!conversaSelecionada?.id) return;

    try {
      setSalvandoEtiqueta(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/etiqueta`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          etiqueta_id: etiquetaId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar etiqueta da conversa");
        return;
      }

      setMensagemSucesso(data.message || "Etiqueta atualizada com sucesso");

      await atualizarConversasCarregadas();

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        inicioJanelaHistorico,
        fimJanelaHistorico
      );
    } catch {
      setErro("Erro ao atualizar etiqueta da conversa");
    } finally {
      setSalvandoEtiqueta(false);
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
      legendaArquivoRef.current = "";
      if (legendaEditorRef.current) {
        legendaEditorRef.current.textContent = "";
      }
      setMensagemSucesso(data.message || "Mídia enviada com sucesso.");

      const listaAtualizada = await atualizarConversasCarregadas();
      const conversaAtualizada = listaAtualizada.find(
        (c: Conversa) => c.id === conversaSelecionada.id
      );

      const novoFimJanela =
        atualizarFimDaJanelaHistorico(conversaAtualizada?.last_message_at) ||
        fimJanelaHistorico;

      forcarScrollParaFinalRef.current = false;
      acompanharCrescimentoChatRef.current = true;
      impedirAutoScrollRef.current = false;

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        mensagemMaisAntigaCarregadaRef.current || inicioJanelaHistorico,
        novoFimJanela,
        {
          modoMergeNovas: true,
        }
      );
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

      await atualizarConversasCarregadas();
    } catch {
      setErro("Erro ao atualizar contato");
    }
  }

  async function carregarProtocolosDaConversa() {
    if (!conversaSelecionada?.id) return;

    try {
      setCarregandoProtocolos(true);

      const res = await fetch(`/api/conversas/${conversaSelecionada.id}/protocolos`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar protocolos");
        return;
      }

      setProtocolosConversa(data.protocolos || []);
    } catch {
      setErro("Erro ao carregar protocolos");
    } finally {
      setCarregandoProtocolos(false);
    }
  }

  async function limparFiltroDeProtocolo() {
    if (!conversaSelecionada?.id) return;

    setProtocoloSelecionadoId(null);
    setProtocoloSelecionadoNumero(null);

    const janelaInicial = calcularJanelaInicialPorUltimaMensagem(
      conversaSelecionada.last_message_at
    );

    await carregarMensagens(
      conversaSelecionada.id,
      false,
      null,
      janelaInicial.inicio,
      janelaInicial.fim
    );
  }

  async function carregarTemplatesWhatsapp() {
    try {
      setCarregandoTemplatesWhatsapp(true);
      setErro("");

      const res = await fetch("/api/whatsapp/templates", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar templates do WhatsApp");
        setTemplatesWhatsapp([]);
        return;
      }

      const templatesEmpresa = Array.isArray(data.data) ? data.data : [];

      const templatesAprovados = templatesEmpresa.filter(
        (item: any) => String(item.status || "").toUpperCase() === "APPROVED"
      );

      const templatesDaIntegracaoAtual = templatesAprovados.filter(
        (item: any) =>
          item.integracao_whatsapp_id === conversaSelecionada?.integracao_whatsapp_id
      );

      setTemplatesWhatsapp(templatesDaIntegracaoAtual);
    } catch {
      setErro("Erro ao carregar templates do WhatsApp");
      setTemplatesWhatsapp([]);
    } finally {
      setCarregandoTemplatesWhatsapp(false);
    }
  }

  async function calcularPreviewCustoDisparoIndividual(
    categoria: string,
    telefone?: string | null
  ) {
    try {
      const telefoneContato = String(telefone || "").trim();

      if (!categoria || !telefoneContato) {
        setPreviewCustoDisparoIndividual(null);
        return;
      }

      setLoadingPreviewCustoDisparoIndividual(true);

      const res = await fetch("/api/whatsapp/disparos/custo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoria,
          contatos: [
            {
              id: conversaSelecionada?.contatos?.id || conversaSelecionada?.id || "disparo-individual",
              telefone: telefoneContato,
            },
          ],
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do disparo individual.");
      }

      setPreviewCustoDisparoIndividual({
        categoria: String(json.categoria || ""),
        totalSelecionados: Number(json.totalSelecionados || 0),
        totalIsentos: Number(json.totalIsentos || 0),
        totalCobrados: Number(json.totalCobrados || 0),
        valorUnitarioUsd: Number(json.valorUnitarioUsd || 0),
        valorTotalUsd: Number(json.valorTotalUsd || 0),
        cotacaoUsdBrl: Number(json.cotacaoUsdBrl || 0),
        valorTotalBrlEstimado: Number(json.valorTotalBrlEstimado || 0),
        valorTotalBrlMin: Number(json.valorTotalBrlMin || 0),
        valorTotalBrlMax: Number(json.valorTotalBrlMax || 0),
        margemMinPercent: Number(json.margemMinPercent || 0),
        margemMaxPercent: Number(json.margemMaxPercent || 0),
        fonteCotacao: json.fonteCotacao || "",
        cotacaoDataHora: json.cotacaoDataHora || null,
        cotacaoFallback: Boolean(json.cotacaoFallback),
      });
    } catch (error: any) {
      setPreviewCustoDisparoIndividual(null);
      setErro(error?.message || "Erro ao calcular custo do disparo individual.");
    } finally {
      setLoadingPreviewCustoDisparoIndividual(false);
    }
  }

  async function enviarDisparoIndividual() {
    if (!conversaSelecionada?.id) {
      setErro("Selecione uma conversa.");
      return;
    }

    if (!templateDisparoNome.trim()) {
      setErro("Informe o nome do template.");
      return;
    }

    try {
      setEnviandoDisparoIndividual(true);
      setErro("");
      setMensagemSucesso("");

      const res = await fetch("/api/whatsapp/disparo-individual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversa_id: conversaSelecionada.id,
          template_nome: templateDisparoNome.trim(),
          body_params: parametros.filter((item) => item.trim() !== ""),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao enviar disparo individual");
        return;
      }

      setMensagemSucesso(data.message || "Disparo enviado com sucesso.");
      setTemplateDisparoBody1("");

      await atualizarConversasCarregadas();

      await carregarMensagens(
        conversaSelecionada.id,
        true,
        protocoloSelecionadoId,
        inicioJanelaHistorico,
        fimJanelaHistorico
      );
    } catch {
      setErro("Erro ao enviar disparo individual");
    } finally {
      setEnviandoDisparoIndividual(false);
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

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }

  function acompanharCrescimentoChat() {
    const el = mensagensRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }

  function calcularJanelaInicialPorUltimaMensagem(ultimaMensagemAt?: string | null) {
    if (!ultimaMensagemAt) {
      return {
        inicio: null,
        fim: null,
      };
    }

    const fim = new Date(ultimaMensagemAt);
    const inicio = new Date(fim);
    inicio.setHours(inicio.getHours() - 4);

    return {
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    };
  }

  function atualizarFimDaJanelaHistorico(ultimaMensagemAt?: string | null) {
    if (!ultimaMensagemAt) return null;
    return new Date(ultimaMensagemAt).toISOString();
  }

  function verificarSeUsuarioEstaNoFinal() {
    const el = mensagensRef.current;
    if (!el) return true;

    const margem = 80;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - margem;
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

  function contarParametrosDoTemplate(payload?: {
    components?: Array<{ type: string; text?: string }>;
  } | null) {
    if (!payload?.components?.length) return 0;

    const textos = payload.components.map((item) => item.text || "").join(" ");
    const matches = textos.match(/\{\{\d+\}\}/g) || [];

    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((n) => !Number.isNaN(n));

    if (numeros.length === 0) return 0;
    return Math.max(...numeros);
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
  const STATUS_ENCERRADOS = [
    "encerrado_manual",
    "encerrado_24h",
    "encerrado_aut",
  ];

  const conversaEncerrada = STATUS_ENCERRADOS.includes(
    conversaSelecionada?.status || ""
  );

  const conversaEncerradaManual =
    conversaSelecionada?.status === "encerrado_manual";

  const conversaEncerrada24h =
    conversaSelecionada?.status === "encerrado_24h";

  const conversaEncerradaAutomacao =
    conversaSelecionada?.status === "encerrado_aut";

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

  const totalConversasRobo = useMemo(() => {
    return conversas.filter((c) => c.bot_ativo === true).length;
  }, [conversas]);

  const conversasFiltradas = useMemo(() => {
    const lista = [...conversas];

    lista.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    return lista;
  }, [conversas]);

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

  const alertaSemResponsavel = !!conversaSelecionada && !conversaResponsavelId;
  const alertaClienteAguardando =
    conversaSelecionada?.status === "aguardando_cliente";
  const alertaPrioridadeAlta =
    conversaSelecionada?.prioridade === "alta" ||
    conversaSelecionada?.prioridade === "urgente";
    
  const conversaComBotAtivo = !!conversaSelecionada?.bot_ativo;

  const alertaParadaMuitoTempo = useMemo(() => {
    if (!conversaSelecionada?.last_message_at) return false;

    const diffMin =
      (Date.now() - new Date(conversaSelecionada.last_message_at).getTime()) / 60000;

    return diffMin >= 120;
  }, [conversaSelecionada?.last_message_at]);

  const slaNivel = getSlaNivel(conversaSelecionada);

  const quantidadeNotas = notasConversa.length;
  const conversaTemNotas = quantidadeNotas > 0;

  const ultimaMensagemRecebidaDoContato = useMemo(() => {
    return getUltimaMensagemRecebidaDoContato(mensagens);
  }, [mensagens]);

  const referenciaJanela24hComposer = useMemo(() => {
    if (protocoloSelecionadoId) {
      if (!conversaSelecionada?.last_message_at) return null;

      return {
        created_at: conversaSelecionada.last_message_at,
      } as Pick<Mensagem, "created_at">;
    }

    return ultimaMensagemRecebidaDoContato;
  }, [protocoloSelecionadoId, conversaSelecionada?.last_message_at, ultimaMensagemRecebidaDoContato]);

  const janela24hAberta = useMemo(() => {
    return isJanela24hMetaAberta(
      referenciaJanela24hComposer as Mensagem | null
    );
  }, [referenciaJanela24hComposer]);

  const tempoRestanteJanela24h = useMemo(() => {
    return formatarTempoRestanteJanela(referenciaJanela24hComposer?.created_at);
  }, [referenciaJanela24hComposer]);

  const templateSelecionado = useMemo(() => {
    return (
      templatesWhatsapp.find((item) => item.id === templateDisparoId) || null
    );
  }, [templatesWhatsapp, templateDisparoId]);

  const quantidadeParametrosBody = useMemo(() => {
    return contarParametrosDoTemplate(templateSelecionado?.payload);
  }, [templateSelecionado]);

  const previewTemplateSelecionado = useMemo(() => {
    if (!templateSelecionado?.payload?.components?.length) {
      return "Selecione um template para visualizar o conteúdo.";
    }

    const componentes = templateSelecionado.payload.components;

    const header = componentes.find((item) => item.type === "HEADER");
    const body = componentes.find((item) => item.type === "BODY");
    const footer = componentes.find((item) => item.type === "FOOTER");

    const partes = [
      header?.text ? `HEADER:\n${header.text}` : "",
      body?.text ? `BODY:\n${body.text}` : "",
      footer?.text ? `FOOTER:\n${footer.text}` : "",
    ].filter(Boolean);

    return partes.join("\n\n") || "Template sem conteúdo textual.";
  }, [templateSelecionado]);


const templateHeaderTexto = useMemo(() => {
  const componentes = templateSelecionado?.payload?.components || [];
  const header = componentes.find((item) => item.type === "HEADER");
  return header?.text || "";
}, [templateSelecionado]);

const templateBodyTexto = useMemo(() => {
  const componentes = templateSelecionado?.payload?.components || [];
  const body = componentes.find((item) => item.type === "BODY");
  return body?.text || "";
}, [templateSelecionado]);

const templateFooterTexto = useMemo(() => {
  const componentes = templateSelecionado?.payload?.components || [];
  const footer = componentes.find((item) => item.type === "FOOTER");
  return footer?.text || "";
}, [templateSelecionado]);

  const mostrarComposerLivre =
    !!conversaSelecionada &&
    !conversaComBotAtivo &&
    !conversaEncerrada &&
    janela24hAberta;

  const mostrarDisparoIndividual =
    !!conversaSelecionada &&
    !conversaComBotAtivo &&
    (!janela24hAberta || !!conversaEncerrada);
    
  const composerPronto =
    !!conversaSelecionada && !loadingMensagens;

  const mensagemAvisoDisparo = useMemo(() => {
    if (conversaEncerrada) {
      return {
        titulo: "Conversa encerrada",
        texto:
          "Esta conversa não aceita mais mensagens livres. Para voltar a falar com este contato, envie um template aprovado.",
        icone: "⛔",
        variante: "danger" as const,
      };
    }

    if (mostrarDisparoIndividual) {
      return {
        titulo: "Janela de 24h encerrada",
        texto:
          "A janela de atendimento expirou. Para voltar a conversar envie um disparo e aguarde a resposta do contato",
        icone: "🕒",
        variante: "warning" as const,
      };
    }

    return null;
  }, [conversaEncerrada, mostrarDisparoIndividual]);
  

  useEffect(() => {
    carregarUsuarioLogado();
    carregarPoliticaAtendimento();
    carregarConversas();
    carregarSetores();
    carregarListasEmpresa();
    carregarEtiquetasEmpresa();
  }, []);

  useEffect(() => {
    conversasRef.current = [];
    setConversas([]);
    setTemMaisConversas(true);
    carregarConversas(true, false);
  }, [
    buscaDebounced,
    statusFiltro,
    canalFiltro,
    setorFiltro,
    responsavelFiltro,
    chipRapido,
    listaFiltroId,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setBuscaDebounced(busca.trim());
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [busca]);


  useEffect(() => {
    if (!conversaSelecionada?.id) {
      setMensagens([]);
      return;
    }

    const conversaId = conversaSelecionada.id;
    const conversaLastMessageAt = conversaSelecionada.last_message_at;

    setInfoExpandida(false);
    setAbaPainelDireito("contato");
    setMenuContatoAberto(false);

    setProtocoloSelecionadoId(null);
    setProtocoloSelecionadoNumero(null);
    setProtocolosConversa([]);

    setInicioJanelaHistorico(null);
    setFimJanelaHistorico(null);
    mensagemMaisAntigaCarregadaRef.current = null;

    setTemMaisHistorico(false);
    setCarregandoMaisHistorico(false);

    totalMensagensAnteriorRef.current = 0;
    ultimaMensagemIdAnteriorRef.current = null;
    usuarioEstavaNoFinalRef.current = true;
    forcarScrollParaFinalRef.current = true;

    setNotasConversa([]);
    setNotaInterna("");
    setNotaEditandoId(null);
    setNotaEditandoTexto("");
    resetarFormularioEtiqueta();
    setSelecionandoEtiqueta(false);
    setDisparoIndividualAberto(false);
    setTemplateDisparoId("");
    setTemplateDisparoNome("");
    setParametros([]);
    setPreviewCustoDisparoIndividual(null);

    async function iniciarConversaSelecionada() {
      const janelaInicial = calcularJanelaInicialPorUltimaMensagem(
        conversaLastMessageAt
      );

      await carregarMensagens(
        conversaId,
        false,
        null,
        janelaInicial.inicio,
        null
      );

      if (conversaLidaRef.current !== conversaId) {
        await marcarConversaComoLida(conversaId);
        conversaLidaRef.current = conversaId;
        await atualizarConversasCarregadas();
      }

      await carregarProtocolosDaConversa();
      await carregarNotasDaConversa();
    }

    iniciarConversaSelecionada();
    }, [conversaSelecionada?.id]);

    useEffect(() => {
      if (!conversaSelecionada?.id) return;
      if (!abaVisivel) return;
      if (enviando) return;
      if (editandoCampo) return;

    const interval = window.setInterval(async () => {
      const estavaNoFinal = verificarSeUsuarioEstaNoFinal();

    if (estavaNoFinal) {
      acompanharCrescimentoChatRef.current = true;
      impedirAutoScrollRef.current = false;
      forcarScrollParaFinalRef.current = false;
    } else {
      acompanharCrescimentoChatRef.current = false;
      impedirAutoScrollRef.current = true;
      forcarScrollParaFinalRef.current = false;
    }

    if (!carregandoMaisConversasRef.current) {
      await atualizarConversasCarregadas();
    }

      const inicioHistoricoAtual =
        mensagemMaisAntigaCarregadaRef.current || inicioJanelaHistorico;

      if (protocoloSelecionadoId) {
        await carregarMensagens(
          conversaSelecionada.id,
          true,
          protocoloSelecionadoId,
          inicioHistoricoAtual,
          null,
          {
            modoMergeNovas: true,
          }
        );
      } else {
        await carregarMensagens(
          conversaSelecionada.id,
          true,
          null,
          inicioHistoricoAtual,
          null,
          {
            modoMergeNovas: true,
          }
        );
      }
    }, 15000);

      return () => {
        window.clearInterval(interval);
      };
    }, [
      conversaSelecionada?.id,
      protocoloSelecionadoId,
      abaVisivel,
      enviando,
      editandoCampo,
      inicioJanelaHistorico,
      fimJanelaHistorico,
    ]);


  useEffect(() => {
    if (restaurarScrollHistoricoRef.current) {
      return;
    }

    if (forcarScrollParaFinalRef.current) {
      forcarScrollParaFinalRef.current = false;
      acompanharCrescimentoChatRef.current = false;
      rolarParaFinal();
      return;
    }

    if (acompanharCrescimentoChatRef.current) {
      acompanharCrescimentoChatRef.current = false;
      acompanharCrescimentoChat();
      return;
    }

    if (impedirAutoScrollRef.current) {
      impedirAutoScrollRef.current = false;
      return;
    }
  }, [mensagens]);

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
    if (!arquivoEnvio && editorRef.current && editorRef.current.textContent !== conteudo) {
      editorRef.current.textContent = conteudo;
    }
  }, [conteudo, arquivoEnvio]);

  useEffect(() => {
    if (arquivoEnvio && legendaEditorRef.current && legendaEditorRef.current.textContent !== legendaArquivo) {
      legendaEditorRef.current.textContent = legendaArquivo;
    }
  }, [legendaArquivo, arquivoEnvio]);


  useEffect(() => {
    if (!conversaEncerrada) return;

    setMenuAnexoAberto(false);
    setEmojiAberto(false);

    if (gravandoAudio) {
      pararGravacaoAudio();
    }

    if (cameraAberta) {
      fecharCamera();
    }

    if (arquivoEnvioPreviewUrl) {
      URL.revokeObjectURL(arquivoEnvioPreviewUrl);
    }

    setArquivoEnvio(null);
    setArquivoEnvioPreviewUrl(null);
    setLegendaArquivo("");
    legendaArquivoRef.current = "";
    setConteudo("");
    conteudoRef.current = "";

    if (editorRef.current) {
      editorRef.current.textContent = "";
    }

    if (legendaEditorRef.current) {
      legendaEditorRef.current.textContent = "";
    }
  }, [conversaEncerrada]);


  useEffect(() => {
    if (!mostrarDisparoIndividual) return;
    if (!conversaSelecionada?.integracao_whatsapp_id) return;

    carregarTemplatesWhatsapp();
  }, [mostrarDisparoIndividual, conversaSelecionada?.integracao_whatsapp_id]);

  useEffect(() => {
    setParametros([]);
  }, [templateDisparoNome]);

  useEffect(() => {
    const categoria = String(templateSelecionado?.categoria || "").toLowerCase();
    const telefoneContato = conversaSelecionada?.contatos?.telefone || "";

    if (!disparoIndividualAberto || !categoria || !telefoneContato) {
      setPreviewCustoDisparoIndividual(null);
      return;
    }

    calcularPreviewCustoDisparoIndividual(categoria, telefoneContato);
  }, [
    disparoIndividualAberto,
    templateSelecionado?.id,
    templateSelecionado?.categoria,
    conversaSelecionada?.contatos?.telefone,
  ]);

  useEffect(() => {
    if (!mensagemSucesso && !erro) return;

    const timeout = window.setTimeout(() => {
      setMensagemSucesso("");
      setErro("");
    }, 8000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [mensagemSucesso, erro]);

  useLayoutEffect(() => {
    const container = mensagensRef.current;
    const scrollSalvo = restaurarScrollHistoricoRef.current;

    if (!container || !scrollSalvo) {
      return;
    }

    const diferencaAltura = container.scrollHeight - scrollSalvo.scrollHeight;
    container.scrollTop = scrollSalvo.scrollTop + diferencaAltura;

    restaurarScrollHistoricoRef.current = null;
  }, [mensagens]);
  
  return (
    <>
      <Header
        title="Conversations"
        subtitle="Customer support with a clean interface, focused on operation and contact context."
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
                  <h2 className={styles.sidebarTitle}>Conversations</h2>
                  <p className={styles.sidebarCount}>
                    {conversasFiltradas.length} conversation(s)
                  </p>
                </div>

                <div className={styles.sidebarHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setFiltrosAbertos((prev) => !prev)}
                    className={styles.iconButton}
                  >
                    {filtrosAbertos ? "Hide filters" : "Show filters"}
                  </button>

                  <button
                    type="button"
                    onClick={() => atualizarConversasCarregadas()}
                    className={styles.iconButton}
                  >
                    Update
                  </button>
                </div>
              </div>

              <input
                placeholder="Search by name, phone, subject or protocol"
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
                      <option value="Todas">All</option>
                      <option value="aberta">Open</option>
                      <option value="fila">Queue</option>
                      <option value="bot">Bot</option>
                      <option value="em_atendimento">In Progress</option>
                      <option value="aguardando_cliente">Waiting for Customer</option>
                      <option value="encerrado_manual">Manually Closed</option>
                      <option value="encerrado_24h">Closed by 24h</option>
                      <option value="encerrado_aut">Closed by Automation</option>
                    </select>

                    <select
                      value={canalFiltro}
                      onChange={(e) => setCanalFiltro(e.target.value)}
                      className={styles.filterSelect}
                    >
                      <option value="todos">All channels</option>
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
                      <option value="todos">All departments</option>
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
                      <option value="todos">All representatives</option>
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
                      Queue
                    </button>

                    <button
                      className={`${styles.quickChip} ${
                        chipRapido === "nao_lidas" ? styles.quickChipActive : ""
                      }`}
                      onClick={() => setChipRapido("nao_lidas")}
                    >
                      Unread
                    </button>    
                    
                    <button
                      className={`${styles.quickChip} ${
                        chipRapido === "urgentes" ? styles.quickChipActive : ""
                      }`}
                      onClick={() => setChipRapido("urgentes")}
                    >
                      Urgent
                    </button>

                    <button
                      className={`${styles.quickChip} ${
                        chipRapido === "favoritos" ? styles.quickChipActive : ""
                      }`}
                      onClick={() => setChipRapido("favoritos")}
                    >
                      Favorites
                    </button>
                  </div>
                </>
              )}
              
              <div className={styles.quickFilters}>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "robo" ? styles.quickChipActive : ""
                  } ${styles.quickChipRobot}`}
                  onClick={() => {
                    setChipRapido("robo");
                    setListaFiltroId(null);
                  }}
                  title="Conversations with bot assistance"
                  type="button"
                >
                  <span className={styles.quickChipRobotIconWrap}>
                    <span className={styles.quickChipRobotIcon}>🤖</span>

                    {totalConversasRobo > 0 && (
                      <>
                        <span className={styles.quickChipRobotPulse} />
                        <span className={styles.quickChipRobotBadge}>
                          {totalConversasRobo}
                        </span>
                      </>
                    )}
                  </span>

                  <span>Bot</span>
                </button>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "Todas" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => {
                    setChipRapido("Todas");
                    setListaFiltroId(null);
                  }}
                >
                  All
                </button>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "minhas" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => setChipRapido("minhas")}
                >
                  My Conversations
                </button>

                <button
                  className={`${styles.quickChip} ${
                    chipRapido === "sem_responsavel" ? styles.quickChipActive : ""
                  }`}
                  onClick={() => setChipRapido("sem_responsavel")}
                >
                  No Representative
                </button>

                {listasEmpresa.map((lista) => (
                  <button
                    key={lista.id}
                    className={`${styles.quickChip} ${
                      listaFiltroId === lista.id ? styles.quickChipActive : ""
                    }`}
                    onClick={() => {
                      setListaFiltroId((atual) => (atual === lista.id ? null : lista.id));
                      setChipRapido("Todas");
                    }}
                  >
                    {lista.nome}
                  </button>
                ))}          
              </div>
            </div>

            <div
              className={styles.sidebarBody}
              onScroll={handleScrollListaConversas}
            >
              {loadingConversas ? (
                <div className={styles.emptyListState}>Loading conversations...</div>
              ) : conversasFiltradas.length === 0 ? (
                <div className={styles.emptyListState}>No conversations found.</div>
              ) : (
                <>
                  {conversasFiltradas.map((c) => {
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
                          <div className={styles.contactNameRow}>
                            <p className={styles.contactName}>
                              {c.favorita && (
                                <span className={styles.favoriteStarInline} title="Conversa favorita">
                                  ★
                                </span>
                              )}
                              {c.contatos?.nome || "Unnamed"}
                            </p>

                            <EtiquetaCor etiqueta={c.etiquetas} />
                          </div>

                          <span className={styles.timeLabel}>
                            {formatarHora(c.last_message_at)}
                          </span>
                        </div>

                        <div className={styles.conversationPreviewRow}>
                          <p className={styles.previewLine}>{getPreviewConversa(c)}</p>
                            {c.tem_disparo_agendado_pendente && (
                              <div className={styles.scheduledDisparoMiniBadge}>
                                ⏰ Scheduled Message
                              </div>
                            )}

                          <div className={styles.unreadSlot}>
                            {unreadCount > 0 && (
                              <span className={styles.unreadBadge}>{unreadCount}</span>
                            )}
                          </div>
                          
                        </div>

                        <div className={styles.conversationBottomLine}>
                          <span
                            className={`${styles.statusMiniBadge} ${
                              ["encerrado_manual", "encerrado_24h", "encerrado_aut"].includes(c.status)
                                ? styles.statusMiniClosed
                                : c.status === "fila"
                                ? styles.statusMiniWaiting
                                : c.status === "aguardando_cliente"
                                ? styles.statusMiniWaiting
                                : styles.statusMiniDefault
                            }`}
                          >
                            {getStatusLabel(c.status)}
                          {c.bot_ativo && (
                            <span className={styles.robotMiniBadge} title="Bot ativo">
                              🤖
                            </span>
                          )}
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
                })}

                {carregandoMaisConversas && (
                  <div className={styles.emptyListState}>
                    Loading more conversations...
                  </div>
                )}

                {!temMaisConversas && conversas.length > 0 && (
                  <div className={styles.emptyListState}>
                    All conversations loaded.
                  </div>
                )}
              </>
            )}
            </div>
          </aside>

          <section className={styles.content}>
            {conversaSelecionada ? (
              <div className={styles.chatShell}>
                <ChatToast sucesso={mensagemSucesso} erro={erro} />
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
                              <div className={styles.chatTitleRow}>
                                <h2 className={styles.chatTitle}>
                                  {conversaSelecionada.favorita && (
                                    <span className={styles.favoriteStar} title="Favorite conversation">
                                      ★
                                    </span>
                                  )}
                                  {conversaSelecionada.contatos?.nome || "No name"}
                                </h2>

                                <EtiquetaCor etiqueta={conversaSelecionada.etiquetas} />
                              </div>
                              <p className={styles.chatSubtitle}>
                                {conversaSelecionada.contatos?.telefone || "No phone number"}
                              </p>
                            </div>
                          </button>
                        </div>

                        <div className={styles.chatHeaderAlerts}>
                          {conversaSelecionada?.tem_disparo_agendado_pendente && (
                            <Link
                              href={`/disparos-agendados`}
                              className={`${styles.alertChip} ${styles.alertChipSchedule} ${styles.alertChipScheduleLink}`}
                            >
                              ⏰ Scheduled Message for{" "}
                              {formatarDataCurtaDisparo(
                                conversaSelecionada.disparo_agendado_pendente?.executar_em
                              )}
                            </Link>
                          )}
                          
                          {alertaSemResponsavel && (
                            <span className={`${styles.alertChip} ${styles.alertChipWarn}`}>
                              No representative
                            </span>
                          )}

                          {alertaClienteAguardando && (
                            <span className={`${styles.alertChip} ${styles.alertChipInfo}`}>
                              Waiting for customer
                            </span>
                          )}

                          {alertaPrioridadeAlta && (
                            <span className={`${styles.alertChip} ${styles.alertChipDanger}`}>
                              High priority
                            </span>
                          )}

                          {alertaParadaMuitoTempo && (
                            <span className={`${styles.alertChip} ${styles.alertChipWarn}`}>
                              Conversation paused for a long time
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chatHeaderActions}>
                      {conversaEncerradaManual ? (
                        <button className={styles.primaryButton} onClick={reabrirConversa}>
                          Reopen
                        </button>
                      ) : conversaEncerrada ? null : (
                        <>

                          {conversaTemNotas && (
                            <button
                              type="button"
                              className={styles.noteShortcutButton}
                              title="Open notes"
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
                              {assumindo ? "Taking over..." : "Take over"}
                            </button>
                          )}

                          <div className={styles.headerMenuWrap} ref={menuContatoRef}>
                            <button
                              type="button"
                              className={styles.moreButton}
                              onClick={() => setMenuContatoAberto((prev) => !prev)}
                              title="More options"
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
                                  Contact Information
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
                                    ? "★ Remove from favorites"
                                    : "✰ Add to favorites"}
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
                                  Add to List
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={async () => {
                                    setPainelDireitoAberto(true);
                                    setAbaPainelDireito("etiquetas");
                                    setMenuContatoAberto(false);
                                    await carregarEtiquetasEmpresa();
                                  }}
                                >
                                  Tags
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
                                  Details
                                </button>

                                <button
                                  type="button"
                                  className={styles.headerDropdownItem}
                                  onClick={async () => {
                                    setAbaPainelDireito("historico");
                                    setPainelDireitoAberto(true);
                                    setMenuContatoAberto(false);
                                    await carregarProtocolosDaConversa();
                                  }}
                                >
                                  History
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
                                    <span>Notes</span>
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
                                    <span>Favorited Messages</span>
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
                                    Assign
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
                                    Transfer
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
                                    Close
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
                            <h3 className={styles.actionPanelTitle}>Transfer Conversation</h3>
                              <button
                                className={styles.textButton}
                                onClick={() => setAcaoAberta(null)}
                              >
                                ×
                              </button>
                          </div>

                          <div className={styles.actionPanelBody}>
                            <label className={styles.actionLabel}>New Department</label>
                            <select
                              value={novoSetorId}
                              onChange={(e) => setNovoSetorId(e.target.value)}
                              className={styles.actionSelect}
                            >
                              <option value="">Select a department</option>
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
                                Cancel
                              </button>
                              <button
                                className={styles.primaryButton}
                                onClick={confirmarTransferencia}
                                disabled={salvandoAcao}
                              >
                                {salvandoAcao ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {acaoAberta === "atribuir" && (
                        <>
                          <div className={styles.actionPanelHeader}>
                            <h3 className={styles.actionPanelTitle}>Assign Responsible</h3>
                            <button
                              className={styles.textButton}
                              onClick={() => setAcaoAberta(null)}
                            >
                              ×
                            </button>
                          </div>

                          <div className={styles.actionPanelBody}>
                            <label className={styles.actionLabel}>New Responsible</label>
                            <select
                              value={novoResponsavelId}
                              onChange={(e) => setNovoResponsavelId(e.target.value)}
                              className={styles.actionSelect}
                            >
                              <option value="">Select a responsible</option>
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
                                Cancel
                              </button>
                              <button
                                className={styles.primaryButton}
                                onClick={confirmarAtribuicao}
                                disabled={salvandoAcao}
                              >
                                {salvandoAcao ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {acaoAberta === "encerrar" && (
                        <>
                          <div className={styles.actionPanelHeader}>
                            <h3 className={styles.actionPanelTitle}>Close Conversation</h3>
                            <button
                              className={styles.textButton}
                              onClick={() => setAcaoAberta(null)}
                            >
                              ×
                            </button>
                          </div>

                          <div className={styles.actionPanelBody}>
                            <p className={styles.actionText}>
                              Are you sure you want to close this conversation?
                            </p>

                            <div className={styles.actionButtons}>
                              <button
                                className={styles.secondaryButton}
                                onClick={() => setAcaoAberta(null)}
                                disabled={salvandoAcao}
                              >
                                Cancel
                              </button>
                              <button
                                className={styles.dangerButton}
                                onClick={confirmarEncerramento}
                                disabled={salvandoAcao}
                              >
                                {salvandoAcao ? "Closing..." : "Confirm"}
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
                          {!loadingMensagens && temMaisHistorico && (
                            <div className={styles.timelineHistoryMore}>
                              <button
                                type="button"
                                onClick={carregarMaisHistorico}
                                disabled={carregandoMaisHistorico}
                                className={`${styles.secondaryButton} ${styles.timelineHistoryMoreButton}`}
                              >
                                {carregandoMaisHistorico ? "Loading..." : "View more"}
                              </button>
                            </div>
                          )}
                          {loadingMensagens ? (
                            <div className={styles.timelineInfo}>
                              Loading messages...
                            </div>
                          ) : mensagens.length === 0 ? (
                            <div className={styles.emptyTimelineCard}>
                              No messages registered in this conversation yet.
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
                                                <span className={styles.automaticBadge}>automatic</span>
                                              )}
                                            </div>
                                          )}

                                        <div className={styles.messageContentRow}>
                                          <div className={styles.messageContentFlex}>
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
                                                  ? "Remove from favorites"
                                                  : "Add to favorites"
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
                                          ~ This media may expire within 7 days. To keep access, download it while it is available.
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
                          {!podeEnviarMensagem &&
                            conversaSelecionada.status !== "encerrada" &&
                            !conversaComBotAtivo &&
                            janela24hAberta && (
                              <div className={styles.timelineInfoSmall}>
                                You will only be able to respond when the conversation is under your
                                responsibility.
                              </div>
                            )}

                          <input
                            ref={documentoInputRef}
                            type="file"
                            className={styles.hiddenFileInput}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.ppt,.pptx"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              selecionarArquivo(file, e.currentTarget);
                            }}
                          />

                          <input
                            ref={midiaInputRef}
                            type="file"
                            className={styles.hiddenFileInput}
                            accept="image/*,video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              selecionarArquivo(file, e.currentTarget);
                            }}
                          />

                          <input
                            ref={audioInputRef}
                            type="file"
                            className={styles.hiddenFileInput}
                            accept="audio/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              selecionarArquivo(file, e.currentTarget);
                            }}
                          />

                          {!conversaEncerrada && arquivoEnvio && (
                            <div
                              className={styles.filePreviewCard}
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
                                  {getTipoArquivoSelecionado(arquivoEnvio)} selected
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
                                    legendaArquivoRef.current = "";
                                    if (legendaEditorRef.current) {
                                      legendaEditorRef.current.textContent = "";
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              </div>

                              {arquivoSelecionadoEhImagem(arquivoEnvio) && arquivoEnvioPreviewUrl && (
                                <div>
                                  <img
                                    src={arquivoEnvioPreviewUrl}
                                    alt={arquivoEnvio.name}
                                    className={styles.filePreviewImage}
                                  />
                                </div>
                              )}

                              {arquivoSelecionadoEhVideo(arquivoEnvio) && arquivoEnvioPreviewUrl && (
                                <div>
                                  <video
                                    controls
                                    className={styles.filePreviewVideo}
                                  >
                                    <source src={arquivoEnvioPreviewUrl} type={arquivoEnvio.type} />
                                    Your browser does not support video.
                                  </video>
                                </div>
                              )}

                              {arquivoSelecionadoEhAudio(arquivoEnvio) && arquivoEnvioPreviewUrl && (
                                <div className={styles.audioPreviewCard}>
                                  <div className={styles.audioPreviewTop}>
                                    <div className={styles.audioPreviewBadge}>Audio</div>
                                    <span className={styles.audioPreviewFileName}>
                                      {arquivoEnvio.name}
                                    </span>
                                  </div>

                                  <div className={styles.audioPreviewPlayerWrap}>
                                    <audio controls className={styles.audioPreviewPlayer}>
                                      <source src={arquivoEnvioPreviewUrl} type={arquivoEnvio.type} />
                                      Your browser does not support audio.
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

                          {!conversaEncerrada && cameraAberta && (
                            <div className={styles.cameraModal}>
                              <video ref={videoRef} autoPlay playsInline className={styles.cameraVideo} />

                              <div className={styles.cameraActions}>
                                <button onClick={capturarFoto}>📸 Take photo</button>
                                <button onClick={fecharCamera}>Cancel</button>
                              </div>

                              <canvas ref={canvasRef} style={{ display: "none" }} />
                            </div>
                          )}

                          {!conversaEncerrada && gravandoAudio && (
                            <div className={styles.timelineInfoSmall}>
                              Recording audio... <strong>{formatarDuracaoGravacao(duracaoGravacao)}</strong>
                            </div>
                          )}


                        {!composerPronto ? (
                          <div className={styles.timelineInfoSmall}>
                            Loading conversation information...
                          </div>
                          ) : conversaComBotAtivo ? (
                            <div className={styles.botStopArea}>
                              <div className={styles.botStopCard}>
                                <div className={styles.botStopInfo}>
                                  <div className={styles.botStopIcon}>🤖</div>

                                  <div>
                                    <strong className={styles.botStopTitle}>
                                      Automation in progress
                                    </strong>

                                    <p className={styles.botStopText}>
                                      This conversation is with the bot active. To take over the attendance
                                      manually, click on "Stop automation".
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className={styles.dangerButton}
                                  onClick={assumirConversa}
                                  disabled={assumindo}
                                >
                                  {assumindo ? "Stopping automation..." : "Stop automation"}
                                </button>
                              </div>
                            </div>
                          ) : mostrarDisparoIndividual ? (
                            <div className={styles.disparoCard}>
                              <div className={styles.disparoCardResumo}>
                                <div className={styles.disparoCardResumoLeft}>
                                  {mensagemAvisoDisparo && (
                                    <div
                                      className={`${styles.disparoAlertCompact} ${
                                        mensagemAvisoDisparo.variante === "danger"
                                          ? styles.disparoAlertCompactDanger
                                          : styles.disparoAlertCompactWarning
                                      }`}
                                    >
                                      <div className={styles.disparoAlertCompactIcon}>
                                        {mensagemAvisoDisparo.icone}
                                      </div>

                                      <div className={styles.disparoAlertCompactContent}>
                                        <strong className={styles.disparoAlertCompactTitle}>
                                          {mensagemAvisoDisparo.titulo}
                                        </strong>

                                        <p className={styles.disparoAlertCompactText}>
                                          {mensagemAvisoDisparo.texto}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className={styles.disparoCardResumoRight}>
                                  <button
                                    type="button"
                                    className={styles.disparoExpandButton}
                                    onClick={() => {
                                      setDisparoIndividualAberto((prev) => {
                                        const proximo = !prev;

                                        if (!proximo) {
                                          setPreviewCustoDisparoIndividual(null);
                                        }

                                        return proximo;
                                      });
                                    }}
                                  >
                                    {disparoIndividualAberto
                                      ? "Hide individual broadcast"
                                      : "Send individual broadcast"}
                                  </button>
                                </div>
                              </div>

                              {disparoIndividualAberto && (
                                <div className={styles.disparoCardExpandido}>
                                  <div className={styles.disparoFormCard}>
                                    <div className={styles.disparoFormHeader}>
                                      <div>
                                        <h4 className={styles.disparoFormTitle}>Individual broadcast</h4>
                                        <p className={styles.disparoFormSubtitle}>
                                          Select an approved template and send it to this contact.
                                        </p>
                                      </div>
                                    </div>

                                    <div className={styles.disparoQuickTopRow}>
                                      <select
                                        className={styles.disparoQuickSelect}
                                        value={templateDisparoId}
                                        onChange={(e) => {
                                          const idSelecionado = e.target.value;
                                          setTemplateDisparoId(idSelecionado);

                                          const template = templatesWhatsapp.find(
                                            (t) => t.id === idSelecionado
                                          );
                                          setTemplateDisparoNome(template?.nome || "");
                                        }}
                                      >
                                        <option value="">
                                          {carregandoTemplatesWhatsapp
                                            ? "Loading templates..."
                                            : "Select template"}
                                        </option>

                                        {templatesWhatsapp.map((t) => (
                                          <option key={t.id} value={t.id}>
                                            {t.nome}
                                          </option>
                                        ))}
                                      </select>

                                      <button
                                        type="button"
                                        className={styles.disparoQuickNewButton}
                                        onClick={() => {
                                          window.location.href = "/configuracoes/templates-whatsapp";
                                        }}
                                      >
                                        + New
                                      </button>
                                    </div>

                                    {quantidadeParametrosBody > 0 && (
                                      <div className={styles.disparoParams}>
                                        {Array.from({ length: quantidadeParametrosBody }).map((_, i) => (
                                          <input
                                            key={i}
                                            className={styles.disparoInput}
                                            placeholder={`Parameter ${i + 1}`}
                                            value={parametros[i] || ""}
                                            onChange={(e) => atualizarParametro(i, e.target.value)}
                                          />
                                        ))}
                                      </div>
                                    )}

                                    <div className={styles.disparoQuickBottomRow}>
                                      <div className={styles.disparoQuickTarget}>
                                        <span className={styles.disparoQuickTargetLabel}>Destination</span>
                                        <strong className={styles.disparoQuickTargetName}>
                                          {conversaSelecionada.contatos?.nome || "Contact"}
                                        </strong>
                                        <span className={styles.disparoQuickTargetPhone}>
                                          {conversaSelecionada.contatos?.telefone || "No phone number"}
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        className={styles.disparoQuickSendButton}
                                        onClick={enviarDisparoIndividual}
                                        disabled={
                                          enviandoDisparoIndividual ||
                                          !templateDisparoId.trim() ||
                                          !conversaSelecionada?.contatos?.telefone
                                        }
                                      >
                                        {enviandoDisparoIndividual ? "Sending..." : "Send"}
                                      </button>
                                    </div>

                                    {templateSelecionado && (
                                      <div className={styles.disparoCustoBox}>
                                        <div className={styles.disparoCustoHeader}>
                                          <span className={styles.disparoCustoEyebrow}>Estimate for billing</span>

                                          <span className={styles.disparoCustoCategoria}>
                                            {String(previewCustoDisparoIndividual?.categoria || templateSelecionado?.categoria || "-").toUpperCase()}
                                          </span>
                                        </div>

                                        <div className={styles.disparoCustoMain}>
                                          <div className={styles.disparoCustoValorPrincipal}>
                                            {loadingPreviewCustoDisparoIndividual ? (
                                              "Calculating..."
                                            ) : (
                                              `R$ ${(previewCustoDisparoIndividual?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ ${(previewCustoDisparoIndividual?.valorTotalBrlMax ?? 0).toFixed(2)}`
                                            )}
                                          </div>

                                          <div className={styles.disparoCustoMetaLinha}>
                                            <span>
                                              <strong>USD:</strong>{" "}
                                              {`US$ ${(previewCustoDisparoIndividual?.valorTotalUsd ?? 0).toFixed(4)}`}
                                            </span>

                                            <span>
                                              <strong>Charged:</strong>{" "}
                                              {previewCustoDisparoIndividual?.totalCobrados ?? 0}
                                            </span>

                                            <span>
                                              <strong>Exempt:</strong>{" "}
                                              {previewCustoDisparoIndividual?.totalIsentos ?? 0}
                                            </span>
                                          </div>
                                        </div>

                                        <div className={styles.disparoCustoAviso}>
                                          The charge may be processed by Meta using the payment method linked to the business account.
                                          The final amount may vary according to exchange rate, taxes, IOF, fees, and billing rules.
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className={styles.disparoTemplatePreviewCard}>
                                    <div className={styles.disparoTemplatePreviewHeader}>
                                      <div>
                                        <h4 className={styles.disparoTemplatePreviewName}>
                                          {templateSelecionado?.nome || "Template not selected"}
                                        </h4>

                                        <p className={styles.disparoTemplatePreviewMeta}>
                                          Category:{" "}
                                          <strong>
                                            {templateSelecionado?.categoria || "NNot specified"}
                                          </strong>
                                          {" • "}
                                          Idioma:{" "}
                                          <strong>
                                            {templateSelecionado?.idioma ||
                                              templateSelecionado?.payload?.language ||
                                              "—"}
                                          </strong>
                                        </p>
                                      </div>

                                      <span className={styles.disparoTemplateStatusBadge}>
                                        Approved
                                      </span>
                                    </div>

                                    <div className={styles.disparoTemplateSection}>
                                      <span className={styles.disparoTemplateSectionLabel}>HEADER</span>
                                      <div className={styles.disparoTemplateSectionBox}>
                                        {templateHeaderTexto || "Sem header"}
                                      </div>
                                    </div>

                                    <div className={styles.disparoTemplateSection}>
                                      <span className={styles.disparoTemplateSectionLabel}>BODY</span>
                                      <div className={styles.disparoTemplateSectionBox}>
                                        {templateBodyTexto || "Sem body"}
                                      </div>
                                    </div>

                                    <div className={styles.disparoTemplateSection}>
                                      <span className={styles.disparoTemplateSectionLabel}>FOOTER</span>
                                      <div className={styles.disparoTemplateSectionBox}>
                                        {templateFooterTexto || "Sem footer"}
                                      </div>
                                    </div>

                                    <div className={styles.disparoTemplateHintBox}>
                                        This template uses <strong>{quantidadeParametrosBody}</strong> variable(s).
                                        In the current model, when variables exist, the system sends the values filled in the parameters above.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className={styles.composerRow}>
                                {/* ESQUERDA */}
                                <div className={styles.composerLeft}>
                                  <div ref={menuAnexoRef} className={styles.attachmentMenuWrap}>
                                    <button
                                      type="button"
                                      className={styles.toolButton}
                                      onClick={() => setMenuAnexoAberto((prev) => !prev)}
                                      title="Attachments"
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
                                          <span>Document</span>
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
                                          <span>Photo or Video</span>
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
                                          <span>Audio</span>
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
                                      aria-label="Open emojis"
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
                                        ? "You cannot reply to this conversation"
                                        : arquivoEnvio
                                        ? "Enter a caption..."
                                        : gravandoAudio
                                        ? "Recording audio..."
                                        : "Enter a message"
                                    }
                                    onInput={(e) => {
                                      const texto = (e.currentTarget as HTMLDivElement).textContent || "";

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
                                    title="CCamera"
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
                                    title={gravandoAudio ? "Stop recording" : "Record audio"}
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
                                    {enviando ? "Sending..." : arquivoEnvio ? "Send" : "Send"}
                                  </button>
                                </div>
                              </div>

                              <p className={styles.footerHint}>
                                Enter sends • Shift + Enter breaks line
                              </p>
                            </>
                          )}
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
                            onClick={async () => {
                              setAbaPainelDireito("contato");
                              await limparFiltroDeProtocolo();
                            }}
                            title="Back to contacts"
                          >
                            ←
                          </button>
                        )}

                        <div className={styles.rightPanelTitleWrap}>
                          <h3 className={styles.rightPanelTitle}>
                              {abaPainelDireito === "contato"
                                ? "Contact details"
                                : abaPainelDireito === "detalhes"
                                ? "Details"
                                : abaPainelDireito === "historico"
                                ? "History"
                                : abaPainelDireito === "notas"
                                ? "Notes"
                                : abaPainelDireito === "listas"
                                ? "Lists"
                                : abaPainelDireito === "etiquetas"
                                ? "Tags"
                                : abaPainelDireito === "midia_docs_links"
                                ? "Media, links and docs"
                                : "Favorite messages"}
                          </h3>

                          {abaPainelDireito === "midia_docs_links" && (
                            <div className={styles.mediaExpiryInfoWrap}>
                              <button
                                type="button"
                                className={styles.mediaExpiryInfoButton}
                                title="Information about media expiration"
                              >
                                i
                              </button>

                              <div className={styles.mediaExpiryInfoTooltip}>
                                  Media received through WhatsApp may expire within 7 days.
                                  To keep access to images, videos, audio, and files after that period,
                                  download the media while it is still available.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        className={styles.textButton}
                        onClick={async () => {
                          setPainelDireitoAberto(false);
                          await limparFiltroDeProtocolo();
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <div className={styles.rightPanelBody}>
                      {abaPainelDireito === "detalhes" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.detailCardGrid}>
                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Subject</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.assunto || "No subject"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Channel</span>
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
                              <span className={styles.detailLabel}>Sector</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.setores?.nome || "No sector"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Responsible</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.responsavel?.nome ||
                                  "No responsible"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Priority</span>
                              <strong className={styles.detailValue}>
                                {getPrioridadeLabel(conversaSelecionada.prioridade)}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Origin</span>
                              <strong className={styles.detailValue}>
                                {conversaSelecionada.origem_atendimento ||
                                  "NNot informed"}
                              </strong>
                            </div>

                            <div className={styles.detailCard}>
                              <span className={styles.detailLabel}>Last activity</span>
                              <strong className={styles.detailValue}>
                                {formatarDataCompleta(conversaSelecionada.last_message_at)}
                              </strong>
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
                              {conversaSelecionada.contatos?.nome || "No name"}
                            </h4>

                            <p className={styles.whatsContactPhone}>
                              {conversaSelecionada.contatos?.telefone || "No phone"}
                            </p>

                            <div className={styles.whatsContactActions}>
                              <button
                                type="button"
                                className={styles.whatsContactActionButton}
                                onClick={() => {
                                  setAbaPainelDireito("detalhes");
                                  setPainelDireitoAberto(true);
                                }}
                              >
                                <span className={styles.whatsContactActionIcon}>◈</span>
                                <span className={styles.whatsContactActionText}>Details</span>
                              </button>

                              <button 
                                type="button" 
                                className={styles.whatsContactActionButton}
                                onClick={baixarConversaPDF}
                                >
                                <span className={styles.whatsContactActionIcon}>↗</span>
                                <span className={styles.whatsContactActionText}>Share</span>
                              </button>
                            </div>
                          </div>

                          <div className={styles.whatsContactSection}>
                            <div className={styles.whatsSectionHeader}>
                              <span>Contact Information</span>
                            </div>

                            <div className={styles.whatsInfoList}>
                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>PROTOCOL</span>

                                <div className={styles.protocolRow}>
                                  <strong className={styles.whatsInfoValue}>
                                    {conversaSelecionada.protocolo || "NNot generated"}
                                  </strong>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setAbaPainelDireito("historico");
                                      setPainelDireitoAberto(true);
                                      await carregarProtocolosDaConversa();
                                    }}
                                    className={styles.protocolSmallButton}
                                  >
                                    View others
                                  </button>
                                </div>
                              </div>

                              <div className={styles.whatsInfoRow}>
                                <span className={styles.whatsInfoLabel}>Phone</span>
                                <strong className={styles.whatsInfoValue}>
                                  {conversaSelecionada.contatos?.telefone || "No phone"}
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
                                label="COMPANY"
                                valorInicial={conversaSelecionada.contatos?.empresa || ""}
                                editando={editandoCampo === "empresa"}
                                onEditar={() => setEditandoCampo("empresa")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("empresa", valor)}
                              />

                              <CampoContatoEditavel
                                label="NOTES"
                                valorInicial={conversaSelecionada.contatos?.observacoes || ""}
                                editando={editandoCampo === "observacoes"}
                                multiline
                                onEditar={() => setEditandoCampo("observacoes")}
                                onCancelar={() => setEditandoCampo(null)}
                                onSalvar={(valor) => salvarContatoCampo("observacoes", valor)}
                              />
                            </div>
                          </div>

                          <div className={styles.whatsDivider} />

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
                                  Media, links and docs
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
                              onClick={async () => {
                                setAbaPainelDireito("historico");
                                setPainelDireitoAberto(true);
                                await carregarProtocolosDaConversa();
                              }}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>⭐</span>
                                <span className={styles.whatsListActionLabel}>
                                  Favorited Messages
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
                                <span className={styles.whatsListActionLabel}>Details</span>
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
                                <span className={styles.whatsListActionLabel}>History</span>
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
                                <span className={styles.whatsListActionLabel}>Notes</span>
                              </span>

                              {quantidadeNotas > 0 && (
                                <span className={styles.whatsListActionRight}>
                                  {quantidadeNotas}
                                </span>
                              )}
                            </button>

                            <button
                              type="button"
                              className={styles.whatsListActionButton}
                              onClick={async () => {
                                setAbaPainelDireito("etiquetas");
                                setPainelDireitoAberto(true);
                                await carregarEtiquetasEmpresa();
                              }}
                            >
                              <span className={styles.whatsListActionLeft}>
                                <span className={styles.whatsListActionIcon}>🏷️</span>
                                <span className={styles.whatsListActionLabel}>Labels</span>
                              </span>

                              {conversaSelecionada.etiquetas ? (
                                <EtiquetaCor 
                                  etiqueta={conversaSelecionada.etiquetas} 
                                  className={styles.etiquetaAtualPreview}
                                  mostrarTooltip={false}
                                />
                              ) : (
                                <span className={styles.whatsListActionRight}>No</span>
                              )}
                            </button>
                          </div>

                          <div className={styles.whatsContactSection}>
                            <div className={styles.whatsSectionHeader}>
                              <span>Actions</span>
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
                                      ? "★ Remove from favorites"
                                      : "✰ Add to favorites"}
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
                                ⊞ Add to list
                              </button>

                              {podeTransferir && (
                                <button
                                  type="button"
                                  className={styles.whatsSecondaryAction}
                                  onClick={() => {
                                    setMenuContatoAberto(false);
                                    abrirTransferir();
                                  }}
                                >
                                  ⇄ Transferir conversa
                                </button>
                              )}

                              {podeEncerrar && (
                                <button
                                  type="button"
                                  className={styles.whatsDangerAction}
                                  onClick={() => {
                                    setMenuContatoAberto(false);
                                    abrirEncerrar();
                                  }}
                                >
                                  ⛔ Encerrar conversa
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {abaPainelDireito === "historico" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.infoBoxMuted}>
                            {protocoloSelecionadoId
                              ? `Visualizando apenas as mensagens do protocolo ${protocoloSelecionadoNumero}.`
                              : "Visualizando todas as mensagens da conversa."}
                          </div>

                          <div className={styles.listaInlineActions}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={async () => {
                                if (!conversaSelecionada?.id) return;

                                setProtocoloSelecionadoId(null);
                                setProtocoloSelecionadoNumero(null);
                                const janelaInicial = calcularJanelaInicialPorUltimaMensagem(
                                  conversaSelecionada.last_message_at
                                );

                                await carregarMensagens(
                                  conversaSelecionada.id,
                                  false,
                                  null,
                                  janelaInicial.inicio,
                                  janelaInicial.fim
                                );
                              }}
                            >
                              Ver conversa completa
                            </button>

                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={carregarProtocolosDaConversa}
                            >
                              Atualizar protocolos
                            </button>
                          </div>

                          {carregandoProtocolos ? (
                            <div className={styles.infoBoxMuted}>Carregando protocolos...</div>
                          ) : protocolosConversa.length === 0 ? (
                            <div className={styles.infoBoxMuted}>
                              Nenhum protocolo encontrado para esta conversa.
                            </div>
                          ) : (
                            protocolosConversa.map((protocolo) => (
                              <div key={protocolo.id} className={styles.historyCard}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    alignItems: "flex-start",
                                    marginBottom: 8,
                                  }}
                                >
                                  <div>
                                    <h4 className={styles.historyTitle}>{protocolo.protocolo}</h4>
                                    <p className={styles.historyText}>
                                      {protocolo.tipo === "abertura" ? "Abertura" : "Reabertura"}
                                      {protocolo.ativo ? " • Ativo" : " • Encerrado"}
                                    </p>
                                  </div>

                                  {protocolo.ativo && (
                                    <span className={styles.statusMiniBadge}>
                                      Atual
                                    </span>
                                  )}
                                </div>

                                <p className={styles.historyText}>
                                  Início: {formatarDataCompleta(protocolo.started_at)}
                                </p>

                                <p className={styles.historyText}>
                                  Encerramento: {protocolo.closed_at ? formatarDataCompleta(protocolo.closed_at) : "Em aberto"}
                                </p>

                                <div className={styles.listaInlineActions}>
                                  <button
                                    type="button"
                                    className={styles.primaryButton}
                                    onClick={async () => {
                                      if (!conversaSelecionada?.id) return;

                                      setProtocoloSelecionadoId(protocolo.id);
                                      setProtocoloSelecionadoNumero(protocolo.protocolo);

                                      setInicioJanelaHistorico(null);
                                      setFimJanelaHistorico(null);
                                      setTemMaisHistorico(false);

                                      await carregarMensagens(
                                        conversaSelecionada.id,
                                        false,
                                        protocolo.id,
                                        null,
                                        null
                                      );
                                    }}
                                  >
                                    Ver mensagens deste protocolo
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
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

                      {abaPainelDireito === "etiquetas" && (
                        <div className={styles.panelSectionStack}>
                          <div className={styles.etiquetaAtualCard}>
                            <div className={styles.etiquetaAtualLabel}>
                              Etiqueta desta conversa
                            </div>

                            {conversaSelecionada.etiquetas ? (
                              <>
                                <div className={styles.etiquetaAtualInfo}>
                                  <EtiquetaCor
                                    etiqueta={conversaSelecionada.etiquetas}
                                    className={styles.etiquetaAtualPreview}
                                    mostrarTooltip={false}
                                  />

                                  <div className={styles.etiquetaAtualTextos}>
                                    <strong>{conversaSelecionada.etiquetas.nome}</strong>

                                    {conversaSelecionada.etiquetas.descricao && (
                                      <span>{conversaSelecionada.etiquetas.descricao}</span>
                                    )}
                                  </div>
                                </div>

                                <div className={styles.listaInlineActions}>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    disabled={salvandoEtiqueta}
                                    onClick={() => definirEtiquetaDaConversa(null)}
                                  >
                                    Remover etiqueta
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={async () => {
                                      setSelecionandoEtiqueta(true);
                                      setMostrarFormularioEtiqueta(false);
                                      setEtiquetaConfirmandoExclusaoId(null);
                                      await carregarEtiquetasEmpresa();
                                    }}
                                  >
                                    Alterar etiqueta
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() => {
                                      if (!conversaSelecionada.etiquetas) return;

                                      iniciarEdicaoEtiqueta(conversaSelecionada.etiquetas);
                                    }}
                                  >
                                    Editar etiqueta
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className={styles.infoBoxMuted}>
                                  Esta conversa está sem etiqueta.
                                </div>

                                <div className={styles.listaInlineActions}>
                                  <button
                                    type="button"
                                    className={styles.primaryButton}
                                    onClick={async () => {
                                      setSelecionandoEtiqueta(true);
                                      setMostrarFormularioEtiqueta(false);
                                      setEtiquetaConfirmandoExclusaoId(null);
                                      await carregarEtiquetasEmpresa();
                                    }}
                                  >
                                    Adicionar etiqueta
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {selecionandoEtiqueta && (
                            <>
                              <div className={styles.listaCardWrap}>
                                {carregandoEtiquetas ? (
                                  <div className={styles.infoBoxMuted}>
                                    Carregando etiquetas...
                                  </div>
                                ) : etiquetasEmpresa.length === 0 ? (
                                  <div className={styles.infoBoxMuted}>
                                    Nenhuma etiqueta criada para esta empresa ainda.
                                  </div>
                                ) : (
                                  etiquetasEmpresa.map((etiqueta) => {
                                    const estaSelecionada =
                                      conversaSelecionada.etiqueta_id === etiqueta.id;

                                    return (
                                      <div key={etiqueta.id} className={styles.listaCardWrap}>
                                        <div className={styles.listaCard}>
                                          <button
                                            type="button"
                                            className={`${styles.listaMainButton} ${
                                              estaSelecionada ? styles.etiquetaCardAtiva : ""
                                            }`}
                                            onClick={async () => {
                                              await definirEtiquetaDaConversa(etiqueta.id);
                                              setSelecionandoEtiqueta(false);
                                            }}
                                          >
                                            <div className={styles.listaMainLeft}>
                                              <EtiquetaCor
                                                etiqueta={etiqueta}
                                                className={styles.etiquetaListaPreview}
                                                mostrarTooltip={false}
                                              />

                                              <div className={styles.etiquetaListaTextos}>
                                                <span className={styles.listaNome}>
                                                  {etiqueta.nome}
                                                </span>

                                                <span className={styles.etiquetaDescricaoLinha}>
                                                  {etiqueta.descricao || "Sem descrição"}
                                                </span>
                                              </div>
                                            </div>
                                          </button>

                                          <div className={styles.listaActions}>
                                            <button
                                              type="button"
                                              className={styles.listaIconButton}
                                              title="Editar etiqueta"
                                              onClick={() => iniciarEdicaoEtiqueta(etiqueta)}
                                            >
                                              ✎
                                            </button>

                                            <button
                                              type="button"
                                              className={`${styles.listaIconButton} ${styles.listaIconButtonDanger}`}
                                              title="Excluir etiqueta"
                                              onClick={() =>
                                                setEtiquetaConfirmandoExclusaoId((atual) =>
                                                  atual === etiqueta.id ? null : etiqueta.id
                                                )
                                              }
                                            >
                                              ×
                                            </button>
                                          </div>
                                        </div>

                                        {etiquetaConfirmandoExclusaoId === etiqueta.id && (
                                          <div className={styles.listaInlinePanelDanger}>
                                            <p className={styles.listaConfirmText}>
                                              Deseja excluir a etiqueta{" "}
                                              <strong>{etiqueta.nome}</strong>?
                                            </p>

                                            <div className={styles.listaInlineActions}>
                                              <button
                                                type="button"
                                                className={styles.secondaryButton}
                                                onClick={() =>
                                                  setEtiquetaConfirmandoExclusaoId(null)
                                                }
                                              >
                                                Cancelar
                                              </button>

                                              <button
                                                type="button"
                                                className={styles.dangerButton}
                                                disabled={salvandoEtiqueta}
                                                onClick={() => excluirEtiquetaEmpresa(etiqueta.id)}
                                              >
                                                {salvandoEtiqueta ? "Excluindo..." : "Excluir"}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              <div className={styles.listaInlineActions}>
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  onClick={iniciarCriacaoEtiqueta}
                                >
                                  Criar nova etiqueta
                                </button>

                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => {
                                    setSelecionandoEtiqueta(false);
                                    resetarFormularioEtiqueta();
                                  }}
                                >
                                  Fechar
                                </button>
                              </div>
                            </>
                          )}

                          {mostrarFormularioEtiqueta && (
                            <div className={styles.listaInlinePanel}>
                              <div className={styles.noteComposer}>
                                <label className={styles.actionLabel}>Nome</label>
                                <input
                                  className={styles.searchInput}
                                  value={etiquetaForm.nome}
                                  maxLength={30}
                                  onChange={(e) =>
                                    setEtiquetaForm((atual) => ({
                                      ...atual,
                                      nome: e.target.value,
                                    }))
                                  }
                                  placeholder="Ex.: Cliente premium"
                                />
                                <div className={styles.etiquetaContador}>
                                  {etiquetaForm.nome.length}/30
                                </div>

                                <label className={styles.actionLabel}>Descrição</label>
                                <textarea
                                  className={styles.noteInput}
                                  rows={3}
                                  value={etiquetaForm.descricao}
                                  maxLength={120}
                                  onChange={(e) =>
                                    setEtiquetaForm((atual) => ({
                                      ...atual,
                                      descricao: e.target.value,
                                    }))
                                  }
                                  placeholder="Descreva o uso dessa etiqueta"
                                />
                                <div className={styles.etiquetaContador}>
                                  {etiquetaForm.descricao.length}/120
                                </div>

                                <label className={styles.actionLabel}>Cor</label>
                                <div className={styles.etiquetaCoresGrid}>
                                  {ETIQUETAS_PADRAO.map((cor) => {
                                    const ativa = etiquetaForm.cor === cor;

                                    return (
                                      <button
                                        key={cor}
                                        type="button"
                                        className={`${styles.etiquetaCorOpcao} ${
                                          ativa ? styles.etiquetaCorOpcaoAtiva : ""
                                        }`}
                                        style={{
                                          background: hexToRgba(cor, 0.26),
                                          border: `1px solid ${hexToRgba(cor, 0.56)}`,
                                        }}
                                        onClick={() =>
                                          setEtiquetaForm((atual) => ({
                                            ...atual,
                                            cor,
                                          }))
                                        }
                                        title={cor}
                                      />
                                    );
                                  })}
                                </div>

                                <label className={styles.actionLabel}>Cor personalizada</label>
                                <input
                                  type="color"
                                  className={styles.etiquetaColorInput}
                                  value={etiquetaForm.cor}
                                  onChange={(e) =>
                                    setEtiquetaForm((atual) => ({
                                      ...atual,
                                      cor: e.target.value.toUpperCase(),
                                    }))
                                  }
                                />

                                <div className={styles.etiquetaPreviewBox}>
                                  <span>Prévia:</span>
                                  <EtiquetaCor
                                    etiqueta={{
                                      nome: etiquetaForm.nome || "Etiqueta",
                                      descricao: etiquetaForm.descricao || "",
                                      cor: etiquetaForm.cor,
                                    }}
                                    className={styles.etiquetaAtualPreview}
                                    mostrarTooltip={false}
                                  />
                                </div>

                                <div className={styles.listaInlineActions}>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={resetarFormularioEtiqueta}
                                  >
                                    Cancelar
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.primaryButton}
                                    disabled={salvandoEtiqueta}
                                    onClick={salvarEtiquetaEmpresa}
                                  >
                                    {salvandoEtiqueta
                                      ? "Salvando..."
                                      : etiquetaEditandoId
                                      ? "Salvar alterações"
                                      : "Salvar etiqueta"}
                                  </button>
                                </div>
                              </div>
                            </div>
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
                                        await atualizarConversasCarregadas();
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
                                            await atualizarConversasCarregadas();
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
                                            await atualizarConversasCarregadas();
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