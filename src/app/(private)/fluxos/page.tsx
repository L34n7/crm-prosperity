"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Position,
  MarkerType,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import "@xyflow/react/dist/style.css";
import styles from "./fluxos.module.css";
import { Handle } from "@xyflow/react";
import { gerarSugestaoDescricaoIA } from "@/lib/ia/sugestoes-descricao-ia";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Copy, CopyPlus, Share2 } from "lucide-react";

type Fluxo = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "rascunho" | "ativo" | "pausado" | "arquivado";
  canal: string;
  fluxo_padrao?: boolean;
  created_at?: string;
  configuracao_json?: Record<string, any>;
  alertas_configuracao?: {
    interpretar_arquivo_ia_sem_conexao_erro?: number;
  };
};

type AutomacaoNo = {
  id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  posicao_x: number;
  posicao_y: number;
  configuracao_json: Record<string, any>;
  delay_segundos: number | null;
};

type AutomacaoConexao = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: Record<string, any>;
  usar_ia?: boolean;
  descricao_ia?: string | null;
};

type GatilhoFluxo = {
  id: string;
  tipo_gatilho: string;
  valor: string;
  condicao: "contem" | "exata" | "inicia_com" | "regex";
  ativo: boolean;
};

type SetorOpcao = {
  id: string;
  nome: string;
};

type MidiaOpcao = {
  id: string;
  nome: string;
  tipo: "imagem" | "video" | "audio";
  url: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  created_at?: string;
};

type TemplateWhatsappOpcao = {
  id: string;
  nome: string;
  idioma: string;
  status: string;
  categoria?: string | null;
  integracao_whatsapp_id: string;
  payload?: any;
};

type PreviewTemplateWhatsapp = {
  titulo: string;
  corpo: string;
  rodape: string;
  botoes: string[];
};

function contarVariaveisTextoTemplate(texto?: string | null) {
  const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((numero) => Number.isFinite(numero));

  return numeros.length > 0 ? Math.max(...numeros) : 0;
}

function contarVariaveisTemplateWhatsapp(template?: TemplateWhatsappOpcao | null) {
  const components = Array.isArray(template?.payload?.components)
    ? template?.payload?.components
    : [];

  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BODY"
  );
  const buttons = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  const totalHeader = contarVariaveisTextoTemplate(header?.text);
  const totalBody = contarVariaveisTextoTemplate(body?.text);
  const totalButtons = (buttons?.buttons || []).reduce(
    (total: number, button: any) => {
      if (String(button?.type || "").toUpperCase() !== "URL") return total;
      return total + contarVariaveisTextoTemplate(button?.url);
    },
    0
  );

  return totalHeader + totalBody + totalButtons;
}

function templateWhatsappTemCabecalhoMidia(template?: TemplateWhatsappOpcao | null) {
  const components = Array.isArray(template?.payload?.components)
    ? template?.payload?.components
    : [];
  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const formatoHeader = String(header?.format || "").toUpperCase();

  return ["IMAGE", "VIDEO", "DOCUMENT"].includes(formatoHeader);
}

function contarVariaveisObrigatoriasPreenchidas(
  variaveis: string[] | string,
  totalObrigatorio: number
) {
  const linhas = Array.isArray(variaveis)
    ? variaveis
    : obterLinhasVariaveisTemplate(variaveis);

  return linhas
    .slice(0, totalObrigatorio)
    .map((item) => String(item || "").trim())
    .filter(Boolean).length;
}

function obterLinhasVariaveisTemplate(valor: string) {
  const linhas = String(valor || "").split("\n");
  return [linhas[0] || "", linhas[1] || "", linhas[2] || ""];
}

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

function atualizarLinhaVariavelTemplate(
  valorAtual: string,
  index: number,
  novoValor: string
) {
  const linhas = obterLinhasVariaveisTemplate(valorAtual);
  linhas[index] = normalizarEntradaVariavelTemplate(novoValor);
  return linhas.join("\n");
}

function substituirVariaveisPreviewTemplate(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    return variaveis[index]?.trim() || `{{${numero}}}`;
  });
}

function montarPreviewTemplateWhatsapp(
  template: TemplateWhatsappOpcao | null,
  variaveisRaw: string
): PreviewTemplateWhatsapp | null {
  if (!template) return null;

  const variaveis = obterLinhasVariaveisTemplate(variaveisRaw);
  const components = Array.isArray(template.payload?.components)
    ? template.payload.components
    : [];
  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BODY"
  );
  const footer = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "FOOTER"
  );
  const buttons = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  let offset = 0;
  const headerText = substituirVariaveisPreviewTemplate(
    header?.text || "",
    variaveis,
    offset
  ).trim();
  offset += contarVariaveisTextoTemplate(header?.text);

  const bodyText = substituirVariaveisPreviewTemplate(
    body?.text || "",
    variaveis,
    offset
  ).trim();

  const quickReplies =
    buttons?.buttons
      ?.filter((button: any) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button: any) => String(button.text || "").trim())
      .filter(Boolean) || [];

  return {
    titulo: headerText || template.nome || "Template WhatsApp",
    corpo: bodyText || "Template sem texto para previsualizacao.",
    rodape: String(footer?.text || "").trim() || "Equipe de atendimento",
    botoes: quickReplies,
  };
}

type AgendaOpcao = {
  id: string;
  nome: string;
  timezone: string;
  duracao_minutos: number;
  intervalo_minutos: number;
  janela_dias: number;
  status: string;
};

type ResultadoEncerramentoFluxo = "positivo" | "negativo" | "neutro";
type TipoValorConversao = "sem_valor" | "valor_fixo" | "variavel";

const RESULTADOS_ENCERRAMENTO: ResultadoEncerramentoFluxo[] = [
  "positivo",
  "negativo",
  "neutro",
];

const TIPOS_VALOR_CONVERSAO: TipoValorConversao[] = [
  "sem_valor",
  "valor_fixo",
  "variavel",
];

const LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES = 100 * 1024 * 1024; // 100 MB
const LIMITE_VIDEO_BYTES = 16 * 1024 * 1024;
const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
const LIMITE_AUDIO_BYTES = 16 * 1024 * 1024;
const LIMITE_DELAY_SEGUNDOS = 23 * 60 * 60; 
const VARIAVEIS_FIXAS_CONTATO_HELP =
  "Variaveis fixas do contato: {{nome_contato}}, {{email_contato}} e {{numero_contato}}.";
const VARIAVEIS_FIXAS_CONTATO_RESERVADAS = [
  "nome_contato",
  "contato_nome",
  "email_contato",
  "contato_email",
  "numero_contato",
  "contato_numero",
  "telefone_contato",
  "contato_telefone",
];

async function lerRespostaApi(res: Response, mensagemPadrao: string) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(mensagemPadrao);
    }
  }

  if (!res.ok) {
    if (
      res.status === 413 ||
      /request entity too large|payload too large|function_payload_too_large/i.test(text)
    ) {
      throw new Error(
        "O arquivo excede o limite de upload aceito pelo servidor. Tente reduzir o tamanho e envie novamente."
      );
    }

    throw new Error(text || mensagemPadrao);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const nodeTypes = {
  custom: NodeCustom,
};


function criarIdTemporario(prefixo: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${prefixo}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function labelTipoNo(tipo: string) {
  if (tipo === "inicio") return "Início";
  if (tipo === "enviar_texto") return "Mensagem";
  if (tipo === "pergunta_opcoes") return "Pergunta";
  if (tipo === "transferir_setor") return "Transferir";
  if (tipo === "encerrar") return "Encerrar";
  if (tipo === "enviar_imagem") return "Imagem";
  if (tipo === "enviar_video") return "Vídeo";
  if (tipo === "enviar_audio") return "Áudio";
  if (tipo === "enviar_botoes") return "Botões";
  if (tipo === "botao_redirect") return "Botão redirect";
  if (tipo === "avaliacao") return "Avaliação";
  if (tipo === "capturar_resposta") return "Captura";
  if (tipo === "agendar_disparo") return "Agendar disparo";
  if (tipo === "agenda_buscar_agendamento") return "Buscar agenda";
  if (tipo === "agenda_escolher_horario") return "Escolher horário";
  if (tipo === "agenda_criar_agendamento") return "Criar agendamento";
  if (tipo === "agenda_remarcar_agendamento") return "Remarcar";
  if (tipo === "agenda_cancelar_agendamento") return "Cancelar agenda";
  if (tipo === "interpretar_arquivo_ia") return "Interp. arquivo IA";
  return tipo;
}

function corTipoNo(tipo: string) {
  if (tipo === "inicio") return styles.nodeInicio;
  if (tipo === "enviar_texto") return styles.nodeMensagem;
  if (tipo === "pergunta_opcoes") return styles.nodePergunta;
  if (tipo === "transferir_setor") return styles.nodeTransferir;
  if (tipo === "encerrar") return styles.nodeEncerrar;
  if (tipo === "enviar_imagem") return styles.nodeImagem;
  if (tipo === "enviar_video") return styles.nodeVideo;
  if (tipo === "enviar_audio") return styles.nodeAudio;
  if (tipo === "enviar_botoes") return styles.nodeBotoes;
  if (tipo === "botao_redirect") return styles.nodeRedirect;
  if (tipo === "avaliacao") return styles.nodeAvaliacao;
  if (tipo === "capturar_resposta") return styles.nodeCaptura;
  if (tipo === "agendar_disparo") return styles.nodeAgendarDisparo;
  if (tipo === "agenda_buscar_agendamento") return styles.nodeAgendaBuscar;
  if (tipo === "agenda_escolher_horario") return styles.nodeAgendaEscolher;
  if (tipo === "agenda_criar_agendamento") return styles.nodeAgendaCriar;
  if (tipo === "agenda_remarcar_agendamento") return styles.nodeAgendaRemarcar;
  if (tipo === "agenda_cancelar_agendamento") return styles.nodeAgendaCancelar;
  if (tipo === "interpretar_arquivo_ia") return styles.nodeArquivoIA;
  return styles.nodePadrao;
}

function tituloPadraoTipoNo(tipo: string) {
  if (tipo === "inicio") return "Início";
  if (tipo === "enviar_texto") return "Nova mensagem";
  if (tipo === "pergunta_opcoes") return "Nova pergunta";
  if (tipo === "enviar_botoes") return "Pergunta botões";
  if (tipo === "botao_redirect") return "Botão redirect";
  if (tipo === "transferir_setor") return "Transferir setor";
  if (tipo === "encerrar") return "Encerrar";
  if (tipo === "enviar_imagem") return "Nova imagem";
  if (tipo === "enviar_video") return "Novo vídeo";
  if (tipo === "enviar_audio") return "Novo áudio";
  if (tipo === "avaliacao") return "Avaliação";
  if (tipo === "capturar_resposta") return "Capturar resposta";
  if (tipo === "agendar_disparo") return "Agendar disparo";
  if (tipo === "agenda_buscar_agendamento") return "Buscar agendamento";
  if (tipo === "agenda_escolher_horario") return "Escolher horário";
  if (tipo === "agenda_criar_agendamento") return "Criar agendamento";
  if (tipo === "agenda_remarcar_agendamento") return "Remarcar agendamento";
  if (tipo === "agenda_cancelar_agendamento") return "Cancelar agendamento";
  if (tipo === "interpretar_arquivo_ia") return "Interpretar arquivo IA";
  return "Novo bloco";
}

function tituloEhPadraoDoSistema(titulo: string, tipoNoAtual: string) {
  const tituloLimpo = String(titulo || "").trim();

  if (!tituloLimpo) return true;

  return (
    tituloLimpo === tituloPadraoTipoNo(tipoNoAtual) ||
    tituloLimpo === labelTipoNo(tipoNoAtual)
  );
}

function cortarTextoCard(texto: string, limite = 34) {
  const textoLimpo = String(texto || "").replace(/\s+/g, " ").trim();

  if (!textoLimpo) return "";

  return textoLimpo.length > limite
    ? `${textoLimpo.slice(0, limite)}...`
    : textoLimpo;
}

function tituloVisivelCard(data: any) {
  const tipoNo = String(data?.tipo_no || "");
  const titulo = String(data?.titulo || "").trim();
  const tituloPadrao = tituloPadraoTipoNo(tipoNo);
  const labelPadrao = labelTipoNo(tipoNo);

  const mensagensPadrao = [
    "Digite a mensagem aqui.",
    "Escolha uma opção:",
    "",
  ];

  const mensagem = String(data?.configuracao_json?.mensagem || "").trim();
  const mensagemEhPadrao = mensagensPadrao.includes(mensagem);

  const tituloEhPadrao =
    !titulo || titulo === tituloPadrao || titulo === labelPadrao;

  if (!tituloEhPadrao) {
    return titulo;
  }

  if (mensagem && !mensagemEhPadrao) {
    return cortarTextoCard(mensagem);
  }

  return tituloPadrao;
}

function tipoNoEsperaResposta(tipoNo: string) {
  return (
    tipoNo === "pergunta_opcoes" ||
    tipoNo === "enviar_botoes" ||
    tipoNo === "capturar_resposta" ||
    tipoNo === "agenda_buscar_agendamento" ||
    tipoNo === "agenda_escolher_horario" ||
    tipoNo === "interpretar_arquivo_ia"
  );
}

function tipoCondicaoPadraoPorTipoNo(tipoNo: string) {
  if (tipoNo === "capturar_resposta") return "sempre";

  return tipoNoEsperaResposta(tipoNo) ? "resposta_contem" : "sempre";
}

function resultadoEncerramentoValido(
  valor: unknown
): valor is ResultadoEncerramentoFluxo {
  return RESULTADOS_ENCERRAMENTO.includes(
    valor as ResultadoEncerramentoFluxo
  );
}

function tipoValorConversaoValido(
  valor: unknown
): valor is TipoValorConversao {
  return TIPOS_VALOR_CONVERSAO.includes(valor as TipoValorConversao);
}

function normalizarValorMonetario(valor: unknown) {
  const texto = String(valor ?? "").replace(/[R$\s]/g, "").trim();

  if (!texto) return null;

  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;

  const numero = Number(normalizado);

  if (!Number.isFinite(numero) || numero < 0) return null;

  return Math.round(numero * 100) / 100;
}

function urlHttpValida(valor: unknown) {
  const texto = String(valor || "").trim();

  if (!texto) return false;

  try {
    const url = new URL(texto);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizarVariavelFluxo(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizarDelaySegundos(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return null;
  }

  return Math.max(0, Math.min(LIMITE_DELAY_SEGUNDOS, Math.floor(numero)));
}

function formatarTamanhoArquivo(bytes?: number | null) {
  const valor = Number(bytes || 0);

  if (!Number.isFinite(valor) || valor <= 0) {
    return "Tamanho não informado";
  }

  if (valor < 1024) {
    return `${valor} B`;
  }

  if (valor < 1024 * 1024) {
    return `${(valor / 1024).toFixed(1)} KB`;
  }

  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function formatarStorageMidiasMb(bytes?: number | null) {
  const valor = Number(bytes || 0);

  if (!Number.isFinite(valor) || valor <= 0) {
    return "0";
  }

  return (valor / 1024 / 1024).toFixed(1);
}


function formatarDataMidia(data?: string | null) {
  if (!data) return "Data não informada";

  try {
    return new Date(data).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Data não informada";
  }
}

function labelTipoMidia(tipo: string) {
  if (tipo === "imagem") return "Imagem";
  if (tipo === "video") return "Vídeo";
  if (tipo === "audio") return "Áudio";
  return "Mídia";
}

function iconeTipoMidia(tipo: string) {
  if (tipo === "imagem") return "🖼️";
  if (tipo === "video") return "🎬";
  if (tipo === "audio") return "🎧";
  return "📎";
}

function classeUsoStorageMidias(usadoBytes: number, limiteBytes: number) {
  if (!limiteBytes || limiteBytes <= 0) return "";

  const percentual = (Number(usadoBytes || 0) / limiteBytes) * 100;

  if (percentual >= 90) {
    return styles.mediaLimitPremiumCardRed;
  }

  if (percentual >= 70) {
    return styles.mediaLimitPremiumCardYellow;
  }

  return styles.mediaLimitPremiumCardGreen;
}

function rotuloPadraoPorTipoNo(tipoNo: string) {
  if (tipoNo === "capturar_resposta") {
    return "Resposta recebida";
  }

  return tipoNoEsperaResposta(tipoNo) ? "Nova condição" : "Sempre seguir";
}

const AVISO_FLUXO_CONEXAO_ERRO_ARQUIVO_IA =
  "Este fluxo possui um ou mais blocos Interp. arquivo IA sem a saída erro. Revise os blocos sinalizados no canvas.";

const AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA =
  "Este bloco precisa de uma CONEXÃO com palavra 'ERRO' em RESPOSTA ESPERADA para tratar falhas de IA e tokens esgotados.";

function normalizarTextoComparacao(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

function condicaoCombinaComErroArquivoIa(
  condicao: Record<string, any> | null | undefined
) {
  if (!condicao?.tipo) return false;

  const valor = normalizarTextoComparacao(condicao.valor);

  if (!valor) return false;

  if (condicao.tipo === "resposta_igual") return valor === "erro";
  if (condicao.tipo === "resposta_contem") return "erro".includes(valor);
  if (condicao.tipo === "resposta_inicia_com") return "erro".startsWith(valor);

  if (condicao.tipo === "resposta_regex") {
    try {
      return new RegExp(String(condicao.valor), "i").test("erro");
    } catch {
      return false;
    }
  }

  return false;
}

function nodeArquivoIaSemConexaoErro(node: Node, edgesAtuais: Edge[]) {
  if (String(node.data?.tipo_no || "") !== "interpretar_arquivo_ia") {
    return false;
  }

  return !edgesAtuais.some((edge) => {
    const data = edge.data as { condicao_json?: Record<string, any> } | undefined;
    return (
      edge.source === node.id &&
      condicaoCombinaComErroArquivoIa(data?.condicao_json)
    );
  });
}

const NODE_CARD_WIDTH = 160;
const NODE_CARD_HEIGHT = 95;
const NODE_GAP_X = 70;
const NODE_GAP_Y = 40;

function posicoesSobrepostas(
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  return (
    Math.abs(a.x - b.x) < NODE_CARD_WIDTH + NODE_GAP_X &&
    Math.abs(a.y - b.y) < NODE_CARD_HEIGHT + NODE_GAP_Y
  );
}

function calcularPosicaoLivreNovoNo(nodesAtuais: Node[]) {
  if (nodesAtuais.length === 0) {
    return {
      x: 180,
      y: 220,
    };
  }

  const nodeReferencia = nodesAtuais.reduce((maisADireita, nodeAtual) =>
    nodeAtual.position.x > maisADireita.position.x ? nodeAtual : maisADireita
  );

  const passoX = NODE_CARD_WIDTH + NODE_GAP_X;
  const passoY = NODE_CARD_HEIGHT + NODE_GAP_Y;
  const posicaoBase = {
    x: Math.round(nodeReferencia.position.x + passoX),
    y: Math.round(nodeReferencia.position.y),
  };

  const deslocamentos = [
    { x: 0, y: 0 },
    { x: 0, y: passoY },
    { x: 0, y: -passoY },
    { x: passoX, y: 0 },
    { x: passoX, y: passoY },
    { x: passoX, y: -passoY },
  ];

  for (let coluna = 0; coluna < 8; coluna += 1) {
    for (const deslocamento of deslocamentos) {
      const candidato = {
        x: posicaoBase.x + coluna * passoX + deslocamento.x,
        y: posicaoBase.y + deslocamento.y,
      };

      const colide = nodesAtuais.some((node) =>
        posicoesSobrepostas(candidato, node.position)
      );

      if (!colide) {
        return candidato;
      }
    }
  }

  return {
    x: posicaoBase.x + nodesAtuais.length * passoX,
    y: posicaoBase.y,
  };
}

function dbNoParaReactFlow(no: AutomacaoNo): Node {
  const configuracaoJson = no.configuracao_json || {};

  return {
    id: no.id,
    position: {
      x: no.posicao_x || 0,
      y: no.posicao_y || 0,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: "custom",

    data: {
      tipo_no: no.tipo_no,
      titulo: no.titulo,
      descricao: no.descricao,
      configuracao_json: configuracaoJson,
      delay_segundos: no.delay_segundos ?? null,
      isSelecionado: false,
    },
  };
}

function NodeCustom({ data, dragging }: any) {
  const temAlertaConexaoErro = data?.arquivo_ia_sem_conexao_erro === true;

  return (
    <div
        className={`${styles.nodeBox} ${corTipoNo(data.tipo_no)} ${
          !dragging && data.isSelecionado ? styles.nodeSelecionado : ""
        }`}
      >
      <Handle type="target" position={Position.Left} className={styles.nodeHandle} />

      <div className={styles.nodeHeader}>
        <div className={styles.nodeTypeRow}>
          <span className={styles.nodeType}>
            {labelTipoNo(data.tipo_no)}
          </span>

          {data?.delay_segundos != null &&
            Number(data.delay_segundos) > 0 && (
              <span className={styles.nodeDelayBadge}>
                ⏱ {data.delay_segundos}s
              </span>
            )}
        </div>
      </div>

      <div className={styles.nodeContent}>
        <div className={styles.nodeTitleRow}>
          <strong className={styles.nodeTitle}>{tituloVisivelCard(data)}</strong>

          {temAlertaConexaoErro && (
            <span
              className={`${styles.infoAlertIcon} ${styles.infoAlertIconNode}`}
              data-tooltip={AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA}
              title={AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA}
              aria-label={AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA}
              role="img"
            >
              i
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className={styles.nodeHandle} />
    </div>
  );
}

export default function FluxosPage() {
  const headerUser = useHeaderUser();
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [fluxoSelecionado, setFluxoSelecionado] = useState<Fluxo | null>(null);
  const [abrirCriacao, setAbrirCriacao] = useState(false);
  const [descricaoNovoFluxo, setDescricaoNovoFluxo] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const ignorarCliqueNodeAposArrasteRef = useRef(false);

  const [carregandoFluxos, setCarregandoFluxos] = useState(true);
  const [carregandoEstrutura, setCarregandoEstrutura] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [solicitarComentarioNode, setSolicitarComentarioNode] =
    useState(false);

  const [mensagemComentarioNode, setMensagemComentarioNode] =
    useState("");

  const [notaMinimaNode, setNotaMinimaNode] = useState("1");
  const [notaMaximaNode, setNotaMaximaNode] = useState("5");

  const [erro, setErro] = useState("");
  const [erroCriacaoFluxo, setErroCriacaoFluxo] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [tooltipAlertaFluxo, setTooltipAlertaFluxo] = useState<{
    texto: string;
    x: number;
    y: number;
  } | null>(null);

  const [novoFluxoNome, setNovoFluxoNome] = useState("");
  const [novoFluxoPadrao, setNovoFluxoPadrao] = useState(false);
  const jaExisteFluxoPadrao = fluxos.some(
    (fluxo) =>
      fluxo.fluxo_padrao &&
      fluxo.status !== "arquivado"
  );

  const [editandoNodeId, setEditandoNodeId] = useState<string | null>(null);
  const [tituloNode, setTituloNode] = useState("");
  const [mensagemNode, setMensagemNode] = useState("");
  const [delayNode, setDelayNode] = useState<string>("");

  const [midiaUrlNode, setMidiaUrlNode] = useState("");
  const [midiaNomeNode, setMidiaNomeNode] = useState("");
  const [buscaFluxo, setBuscaFluxo] = useState("");
  const [menuFluxoAbertoId, setMenuFluxoAbertoId] = useState<string | null>(null);
  const [tipoNodeEdicao, setTipoNodeEdicao] = useState("");

  const [midias, setMidias] = useState<MidiaOpcao[]>([]);
  const [carregandoMidias, setCarregandoMidias] = useState(false);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [timeoutQuantidade, setTimeoutQuantidade] = useState("2");
  const [modalMidiasAberto, setModalMidiasAberto] = useState(false);
  const [abaMidias, setAbaMidias] = useState<"todas" | "imagem" | "video" | "audio">("todas");
  const [midiaExcluindoId, setMidiaExcluindoId] = useState<string | null>(null);
  const [confirmandoExclusaoMidiaId, setConfirmandoExclusaoMidiaId] = useState<string | null>(null);

  const [uploadMidiaMensagem, setUploadMidiaMensagem] = useState("");
  const [uploadMidiaProgresso, setUploadMidiaProgresso] = useState(0);
  const [uploadMidiaCancelado, setUploadMidiaCancelado] = useState(false);

  const uploadMidiaAbortRef = useRef<AbortController | null>(null);
  const uploadMidiaProgressoIntervaloRef = useRef<number | null>(null);

  const [timeoutUnidade, setTimeoutUnidade] =
    useState<"minutos" | "horas">("horas");
  const [statusEnvioTimeout, setStatusEnvioTimeout] =
    useState<"qualquer" | "entregue" | "lida">("qualquer");

  const [editandoFluxo, setEditandoFluxo] = useState(false);
  const [fluxoEmEdicao, setFluxoEmEdicao] = useState<Fluxo | null>(null);
  const [nomeFluxoEdicao, setNomeFluxoEdicao] = useState("");
  const [descricaoFluxoEdicao, setDescricaoFluxoEdicao] = useState("");
  const [erroEdicaoFluxo, setErroEdicaoFluxo] = useState("");
  const [fluxoPadraoEdicao, setFluxoPadraoEdicao] = useState(false);
  
  const [encerrarInatividadeQuantidade, setEncerrarInatividadeQuantidade] = useState("23");
  const [encerrarInatividadeUnidade, setEncerrarInatividadeUnidade] =
    useState<"minutos" | "horas">("horas");
  const [encerrarInatividadeMensagem, setEncerrarInatividadeMensagem] = useState(
    "Como não tivemos retorno, este atendimento será encerrado. Caso precise de ajuda, envie uma nova mensagem."
  );

  function resetarEncerramentoInatividadePadrao() {
    setEncerrarInatividadeQuantidade("23");
    setEncerrarInatividadeUnidade("horas");
    setEncerrarInatividadeMensagem(
      "Como não tivemos retorno, este atendimento será encerrado. Caso precise de ajuda, envie uma nova mensagem."
    );
  }

  const [setorDestino, setSetorDestino] = useState("");
  const fluxo = fluxoSelecionado;
  const [confirmandoExclusaoNo, setConfirmandoExclusaoNo] = useState(false);
  const [confirmandoExclusaoConexao, setConfirmandoExclusaoConexao] =
    useState(false);
  
  const [mostrarModalCustoAgendamento, setMostrarModalCustoAgendamento] =
    useState(false);

  const [acaoPendenteAplicarNo, setAcaoPendenteAplicarNo] =
    useState<(() => void) | null>(null);

  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [carregandoSetores, setCarregandoSetores] = useState(false);
  const [menuHeaderAberto, setMenuHeaderAberto] = useState(false);
  const [menuFluxo, setMenuFluxo] = useState<{
    fluxo: Fluxo | null;
    x: number;
    y: number;
    buttonTop: number;
    buttonBottom: number;
  } | null>(null);

  const [gatilhosFluxo, setGatilhosFluxo] = useState<GatilhoFluxo[]>([]);
  const [novoGatilhoValor, setNovoGatilhoValor] = useState("");
  const [novoGatilhoCondicao, setNovoGatilhoCondicao] =
    useState<GatilhoFluxo["condicao"]>("contem");
  
  const [filtroStatusFluxo, setFiltroStatusFluxo] = useState<
    "todos" | "rascunho" | "ativo" | "pausado" | "arquivado"
  >("todos");

  const [modalArquivarAberto, setModalArquivarAberto] = useState(false);
  const [fluxoParaArquivar, setFluxoParaArquivar] = useState<Fluxo | null>(null);

  const [gatilhosNovoFluxo, setGatilhosNovoFluxo] = useState<
    { valor: string; condicao: GatilhoFluxo["condicao"]; ativo?: boolean }[]
  >([]);

  const [modalApagarDefinitivoAberto, setModalApagarDefinitivoAberto] =
    useState(false);
  const [fluxoParaApagarDefinitivo, setFluxoParaApagarDefinitivo] =
    useState<Fluxo | null>(null);
  const [modalCompartilharAberto, setModalCompartilharAberto] = useState(false);
  const [fluxoParaCompartilhar, setFluxoParaCompartilhar] =
    useState<Fluxo | null>(null);
  const [codigoCompartilhamento, setCodigoCompartilhamento] = useState("");
  const [carregandoCodigoCompartilhamento, setCarregandoCodigoCompartilhamento] =
    useState(false);
  const [erroCompartilhamento, setErroCompartilhamento] = useState("");
  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  const [codigoImportacao, setCodigoImportacao] = useState("");
  const [importandoFluxo, setImportandoFluxo] = useState(false);
  const [erroImportacao, setErroImportacao] = useState("");

  const [opcoesNode, setOpcoesNode] = useState<
    { valor: string; titulo: string }[]
  >([]);

  const [botoesNode, setBotoesNode] = useState<
    { id: string; titulo: string }[]
  >([]);
  const [redirectBotaoTextoNode, setRedirectBotaoTextoNode] =
    useState("Acessar");
  const [redirectUrlNode, setRedirectUrlNode] = useState("");

  const [editandoEdgeId, setEditandoEdgeId] = useState<string | null>(null);
  const [rotuloConexao, setRotuloConexao] = useState("");
  const [valorCondicao, setValorCondicao] = useState("");
  const [tipoCondicaoConexao, setTipoCondicaoConexao] =
    useState("resposta_contem");
  const [nomeConexaoEditadoManual, setNomeConexaoEditadoManual] = useState(false);

  const [usarIaConexao, setUsarIaConexao] = useState(false);
  const [descricaoIaConexao, setDescricaoIaConexao] = useState("");
  const [capturaVariavelNode, setCapturaVariavelNode] = useState("nome");
  const [capturaTipoNode, setCapturaTipoNode] = useState("nome");
  const [capturaMensagemErroNode, setCapturaMensagemErroNode] = useState("");
  const [capturaMaxTentativasNode, setCapturaMaxTentativasNode] = useState("3");
  const [arquivoCamposExtracaoNode, setArquivoCamposExtracaoNode] = useState("");

  const [maxTentativasInvalidasNode, setMaxTentativasInvalidasNode] = useState("3");
  const [maxTentativasSemRespostaNode, setMaxTentativasSemRespostaNode] = useState("3");
  const [acaoExcessoTentativasNode, setAcaoExcessoTentativasNode] =
    useState("transferir_atendimento");
  const [setorExcessoTentativasNode, setSetorExcessoTentativasNode] =
    useState("");
  const [mensagemExcessoTentativasNode, setMensagemExcessoTentativasNode] =
    useState("Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.");
  const [notificarExcessoTentativasNode, setNotificarExcessoTentativasNode] =
    useState(true);
  const [notificarEmailExcessoTentativasNode, setNotificarEmailExcessoTentativasNode] =
    useState(true);

  const [notificarAoChegarNode, setNotificarAoChegarNode] = useState(false);
  const [notificacaoTituloNode, setNotificacaoTituloNode] = useState("");
  const [notificacaoMensagemNode, setNotificacaoMensagemNode] = useState("");
  const [notificarEmailNode, setNotificarEmailNode] = useState(false);

  const [templatesWhatsapp, setTemplatesWhatsapp] = useState<TemplateWhatsappOpcao[]>([]);
  const [carregandoTemplatesWhatsapp, setCarregandoTemplatesWhatsapp] = useState(false);
  const [agendasOpcoes, setAgendasOpcoes] = useState<AgendaOpcao[]>([]);
  const [carregandoAgendasOpcoes, setCarregandoAgendasOpcoes] = useState(false);

  const [arquivoInstrucaoIaNode, setArquivoInstrucaoIaNode] = useState("");
  const [arquivoMensagemErroNode, setArquivoMensagemErroNode] = useState("");

  const [agendarDisparoTemplateIdNode, setAgendarDisparoTemplateIdNode] = useState("");
  const [agendarDisparoQuantidadeNode, setAgendarDisparoQuantidadeNode] = useState("32");
  const [agendarDisparoUnidadeNode, setAgendarDisparoUnidadeNode] =
    useState<"horas" | "dias">("horas");
  const [agendarDisparoVariaveisNode, setAgendarDisparoVariaveisNode] = useState("");
  const [agendaIdNode, setAgendaIdNode] = useState("");
  const [agendaListarAgendamentosNode, setAgendaListarAgendamentosNode] =
    useState(false);
  const [agendaQuantidadeOpcoesNode, setAgendaQuantidadeOpcoesNode] = useState("6");
  const [agendaJanelaDiasNode, setAgendaJanelaDiasNode] = useState("14");
  const [agendaMensagemSemHorariosNode, setAgendaMensagemSemHorariosNode] =
    useState("No momento nao encontrei horarios disponiveis. Vou te encaminhar para um atendente.");
  const [agendaMensagemSemExpedienteNode, setAgendaMensagemSemExpedienteNode] =
    useState("Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis.");
  const [agendaMensagemDataInvalidaNode, setAgendaMensagemDataInvalidaNode] =
    useState("Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.");
  const [agendaMensagemListarAgendamentosNode, setAgendaMensagemListarAgendamentosNode] =
    useState("Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:");
  const [agendaMensagemListarHorariosNode, setAgendaMensagemListarHorariosNode] =
    useState("Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:");
  const [
    agendaMensagemPreferenciaIndisponivelNode,
    setAgendaMensagemPreferenciaIndisponivelNode,
  ] = useState(
    "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:"
  );
  const [agendaMensagemConflitoNode, setAgendaMensagemConflitoNode] =
    useState("Esse horario acabou de ficar indisponivel. Vamos escolher outro horario.");
  const [agendaStatusAgendamentoNode, setAgendaStatusAgendamentoNode] =
    useState("agendado");
  const [agendaEnviarEmailNode, setAgendaEnviarEmailNode] = useState(true);
  const [agendaEmailOrigemNode, setAgendaEmailOrigemNode] =
    useState<"contato" | "variavel">("contato");
  const [agendaEmailVariavelNode, setAgendaEmailVariavelNode] =
    useState("email");
  const [agendaLembreteAtivoNode, setAgendaLembreteAtivoNode] =
    useState(false);
  const [agendaLembreteQuantidadeNode, setAgendaLembreteQuantidadeNode] =
    useState("2");
  const [agendaLembreteUnidadeNode, setAgendaLembreteUnidadeNode] =
    useState<"minutos" | "horas" | "dias">("horas");
  const [agendaLembreteWhatsappNode, setAgendaLembreteWhatsappNode] =
    useState(true);
  const [agendaLembreteEmailNode, setAgendaLembreteEmailNode] =
    useState(false);
  const [agendaLembreteTemplateIdNode, setAgendaLembreteTemplateIdNode] =
    useState("");
  const [agendaLembreteVariaveisNode, setAgendaLembreteVariaveisNode] =
    useState("");
  const [agendaMotivoCancelamentoNode, setAgendaMotivoCancelamentoNode] =
    useState("Cancelado pelo cliente via automacao");
  const [encerrarResultadoNode, setEncerrarResultadoNode] =
    useState<ResultadoEncerramentoFluxo>("positivo");
  const [encerrarValorTipoNode, setEncerrarValorTipoNode] =
    useState<TipoValorConversao>("sem_valor");
  const [encerrarValorFixoNode, setEncerrarValorFixoNode] = useState("");
  const [encerrarValorVariavelNode, setEncerrarValorVariavelNode] =
    useState("");
  const [previewCustoAgendarDisparo, setPreviewCustoAgendarDisparo] = useState<{
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

  const [loadingPreviewCustoAgendarDisparo, setLoadingPreviewCustoAgendarDisparo] =
    useState(false);

  const nodeEditado = useMemo(() => {
    return nodes.find((node) => node.id === editandoNodeId) || null;
  }, [nodes, editandoNodeId]);

  const edgeEditada = useMemo(() => {
    return edges.find((edge) => edge.id === editandoEdgeId) || null;
  }, [edges, editandoEdgeId]);

  const templateAgendarDisparoSelecionado = useMemo(() => {
    return (
      templatesWhatsapp.find(
        (template) => template.id === agendarDisparoTemplateIdNode
      ) || null
    );
  }, [templatesWhatsapp, agendarDisparoTemplateIdNode]);

  const templateAgendaLembreteSelecionado = useMemo(() => {
    return (
      templatesWhatsapp.find(
        (template) => template.id === agendaLembreteTemplateIdNode
      ) || null
    );
  }, [templatesWhatsapp, agendaLembreteTemplateIdNode]);

  const previewTemplateAgendarDisparo = useMemo(() => {
    return montarPreviewTemplateWhatsapp(
      templateAgendarDisparoSelecionado,
      agendarDisparoVariaveisNode
    );
  }, [templateAgendarDisparoSelecionado, agendarDisparoVariaveisNode]);

  const previewTemplateAgendaLembrete = useMemo(() => {
    return montarPreviewTemplateWhatsapp(
      templateAgendaLembreteSelecionado,
      agendaLembreteVariaveisNode
    );
  }, [templateAgendaLembreteSelecionado, agendaLembreteVariaveisNode]);

  const totalVariaveisTemplateAgendarDisparo = useMemo(() => {
    return contarVariaveisTemplateWhatsapp(templateAgendarDisparoSelecionado);
  }, [templateAgendarDisparoSelecionado]);

  const totalVariaveisTemplateAgendaLembrete = useMemo(() => {
    return contarVariaveisTemplateWhatsapp(templateAgendaLembreteSelecionado);
  }, [templateAgendaLembreteSelecionado]);

  const indicesVariaveisTemplateAgendarDisparo = useMemo(() => {
    return Array.from(
      { length: Math.min(totalVariaveisTemplateAgendarDisparo, 3) },
      (_, index) => index
    );
  }, [totalVariaveisTemplateAgendarDisparo]);

  const indicesVariaveisTemplateAgendaLembrete = useMemo(() => {
    return Array.from(
      { length: Math.min(totalVariaveisTemplateAgendaLembrete, 3) },
      (_, index) => index
    );
  }, [totalVariaveisTemplateAgendaLembrete]);

    const resumoMidias = useMemo(() => {
      const imagens = midias.filter((midia) => midia.tipo === "imagem");
      const videos = midias.filter((midia) => midia.tipo === "video");
      const audios = midias.filter((midia) => midia.tipo === "audio");

      const tamanhoTotal = midias.reduce(
        (total, midia) => total + Number(midia.tamanho_bytes || 0),
        0
      );

      return {
        total: midias.length,
        imagens: imagens.length,
        videos: videos.length,
        audios: audios.length,
        tamanhoTotal,
      };
    }, [midias]);

    const midiasFiltradasModal = useMemo(() => {
      if (abaMidias === "todas") return midias;

      return midias.filter((midia) => midia.tipo === abaMidias);
    }, [midias, abaMidias]);

    const limiteStorageMidiasAtingido =
      resumoMidias.tamanhoTotal >= LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES;

  async function carregarTemplatesWhatsapp() {
    try {
      setCarregandoTemplatesWhatsapp(true);

      const res = await fetch("/api/whatsapp/templates?status=APPROVED", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      setTemplatesWhatsapp(json.templates || json.data || []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setCarregandoTemplatesWhatsapp(false);
    }
  }

  async function carregarAgendasOpcoes() {
    try {
      setCarregandoAgendasOpcoes(true);

      const res = await fetch("/api/agendas/opcoes", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar agendas.");
      }

      setAgendasOpcoes(json.agendas || []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar agendas.");
    } finally {
      setCarregandoAgendasOpcoes(false);
    }
  }

  async function calcularPreviewCustoAgendarDisparo(categoria: string) {
    try {
      const categoriaFinal = String(categoria || "").trim();

      if (!categoriaFinal) {
        setPreviewCustoAgendarDisparo(null);
        return;
      }

      setLoadingPreviewCustoAgendarDisparo(true);

      const res = await fetch("/api/whatsapp/disparos/custo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoria: categoriaFinal,
          contatos: [
            {
              id: "estimativa-agendamento-fluxo",
              telefone: "5500000000000",
            },
          ],
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo estimado.");
      }

      setPreviewCustoAgendarDisparo({
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
      setPreviewCustoAgendarDisparo(null);
      setErro(error?.message || "Erro ao calcular custo estimado.");
    } finally {
      setLoadingPreviewCustoAgendarDisparo(false);
    }
  }

  async function carregarSetores() {
    try {
      setCarregandoSetores(true);

      const res = await fetch("/api/setores/opcoes", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar setores.");
      }

      setSetores(json.setores || []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar setores.");
    } finally {
      setCarregandoSetores(false);
    }
  }


  async function enviarNovaMidiaMultipart(arquivo: File) {
    iniciarProgressoVideoSimulado();

    const controller = new AbortController();
    uploadMidiaAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);

      const res = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const json = await lerRespostaApi(
        res,
        "Erro ao enviar mídia para conversão."
      );

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao enviar mídia para conversão.");
      }

      await finalizarProgressoVideoRapido();

      return json.midia;
      
    } catch (error: any) {
      limparProgressoVideoSimulado();

      if (error?.name === "AbortError") {
        setUploadMidiaCancelado(true);
        throw new Error("Envio de vídeo cancelado.");
      }

      throw error;
    } finally {
      uploadMidiaAbortRef.current = null;
    }
  }


  function limparProgressoVideoSimulado() {
    if (uploadMidiaProgressoIntervaloRef.current !== null) {
      window.clearInterval(uploadMidiaProgressoIntervaloRef.current);
      uploadMidiaProgressoIntervaloRef.current = null;
    }
  }

  function iniciarProgressoVideoSimulado() {
    limparProgressoVideoSimulado();

    setUploadMidiaCancelado(false);
    setUploadMidiaMensagem("Analisando vídeo...");
    setUploadMidiaProgresso(1);

    uploadMidiaProgressoIntervaloRef.current = window.setInterval(() => {
      setUploadMidiaProgresso((progressoAtual) => {
        if (progressoAtual < 12) {
          setUploadMidiaMensagem("Analisando vídeo...");
          return progressoAtual + 1;
        }

        if (progressoAtual < 60) {
          setUploadMidiaMensagem("Convertendo vídeo...");
          return progressoAtual + 1;
        }

        if (progressoAtual < 80) {
          setUploadMidiaMensagem("Enviando vídeo...");
          return progressoAtual + 1;
        }

        setUploadMidiaMensagem("Aguardando finalização...");
        return 80;
      });
    }, 700);
  }

  async function finalizarProgressoVideoRapido() {
    limparProgressoVideoSimulado();

    setUploadMidiaMensagem("Finalizando envio...");
    setUploadMidiaProgresso(90);

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    setUploadMidiaMensagem("Salvando mídia...");
    setUploadMidiaProgresso(95);

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    setUploadMidiaMensagem("Vídeo enviado com sucesso.");
    setUploadMidiaProgresso(100);

    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  function excedeLimiteStorageMidias(tamanhoArquivoBytes: number) {
    return (
      resumoMidias.tamanhoTotal + Number(tamanhoArquivoBytes || 0) >
      LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
    );
  }


  function cancelarUploadMidia() {
    uploadMidiaAbortRef.current?.abort();
    uploadMidiaAbortRef.current = null;

    limparProgressoVideoSimulado();

    setUploadMidiaCancelado(true);
    setUploadMidiaMensagem("Envio cancelado.");
    setUploadMidiaProgresso(0);
    setEnviandoMidia(false);
    setErro("Envio de vídeo cancelado.");
  }


  async function enviarNovaMidia(arquivo: File) {
    try {
      setEnviandoMidia(true);
      setErro("");
      setSucesso("");

      if (excedeLimiteStorageMidias(arquivo.size)) {
        throw new Error(
          `Limite de ${formatarTamanhoArquivo(
            LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
          )} de mídias atingido. Exclua uma mídia antes de enviar outra.`
        );
      }

      setUploadMidiaMensagem("");
      setUploadMidiaProgresso(0);
      setUploadMidiaCancelado(false);

      let midiaEnviada: MidiaOpcao;

      if (arquivo.type.startsWith("video/")) {
        setSucesso("Convertendo vídeo para o formato aceito pelo WhatsApp...");

        midiaEnviada = await enviarNovaMidiaMultipart(arquivo);
      } else {
        const preparacaoRes = await fetch("/api/automacoes/midias/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acao: "preparar_upload",
            nome: arquivo.name,
            mimeType: arquivo.type,
            tamanhoBytes: arquivo.size,
          }),
        });

        const preparacaoJson = await lerRespostaApi(
          preparacaoRes,
          "Erro ao preparar envio da mídia."
        );

        if (!preparacaoRes.ok || !preparacaoJson.ok) {
          throw new Error(
            preparacaoJson.error || "Erro ao preparar envio da mídia."
          );
        }

        const upload = preparacaoJson.upload;

        if (!upload?.bucket || !upload?.path || !upload?.token) {
          throw new Error("Dados de upload inválidos.");
        }

        const supabase = createSupabaseBrowserClient();

        const { error: uploadError } = await supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, arquivo, {
            contentType: arquivo.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(
            uploadError.message || "Erro ao enviar mídia para o Storage."
          );
        }

        const conclusaoRes = await fetch("/api/automacoes/midias/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acao: "concluir_upload",
            nome: arquivo.name,
            mimeType: arquivo.type,
            tamanhoBytes: arquivo.size,
            storagePath: upload.path,
          }),
        });

        const conclusaoJson = await lerRespostaApi(
          conclusaoRes,
          "Erro ao concluir envio da mídia."
        );

        if (!conclusaoRes.ok || !conclusaoJson.ok) {
          throw new Error(
            conclusaoJson.error || "Erro ao concluir envio da mídia."
          );
        }

        midiaEnviada = conclusaoJson.midia;
      }

      setMidiaUrlNode(midiaEnviada.url);
      setMidiaNomeNode(midiaEnviada.nome);

      setMidias((atuais) => {
        const jaExiste = atuais.some((m) => m.id === midiaEnviada.id);

        if (jaExiste) {
          return atuais;
        }

        return [midiaEnviada, ...atuais];
      });

      setSucesso(
        arquivo.type.startsWith("video/")
          ? "Vídeo enviado com sucesso."
          : "Mídia enviada com sucesso."
      );

      await carregarMidias();
    } catch (error: unknown) {
      setErro(error instanceof Error ? error.message : "Erro ao enviar mídia.");
    } finally {
        window.setTimeout(() => {
          setUploadMidiaMensagem("");
          setUploadMidiaProgresso(0);
          setUploadMidiaCancelado(false);
        }, 1800);
      limparProgressoVideoSimulado();
      setEnviandoMidia(false);
    }
  }


  async function carregarMidias(tipo?: "imagem" | "video" | "audio") {
    try {
      setCarregandoMidias(true);

      const params = tipo ? `?tipo=${tipo}` : "";

      const res = await fetch(`/api/automacoes/midias${params}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar mídias.");
      }

      setMidias(json.midias || []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar mídias.");
    } finally {
      setCarregandoMidias(false);
    }
  }

    async function excluirMidiaDefinitivamente(midia: MidiaOpcao) {
      try {
        setErro("");
        setSucesso("");
        setMidiaExcluindoId(midia.id);

        const res = await fetch("/api/automacoes/midias", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: midia.id,
          }),
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao excluir mídia.");
        }

        setMidias((atuais) => atuais.filter((item) => item.id !== midia.id));

        if (midiaUrlNode === midia.url) {
          setMidiaUrlNode("");
          setMidiaNomeNode("");
        }

        setConfirmandoExclusaoMidiaId(null);
        setSucesso("Mídia excluída definitivamente.");
      } catch (error: any) {
        setErro(error?.message || "Erro ao excluir mídia.");
      } finally {
        setMidiaExcluindoId(null);
      }
    }

  async function carregarFluxos() {
    try {
      setCarregandoFluxos(true);
      setErro("");

      const res = await fetch("/api/automacoes", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar fluxos.");
      }

      setFluxos(json.fluxos || []);

      if (!fluxoSelecionado && json.fluxos?.length > 0) {
        setFluxoSelecionado(json.fluxos[0]);
      }
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar fluxos.");
    } finally {
      setCarregandoFluxos(false);
    }
  }

  async function carregarEstrutura(fluxoId: string) {
    try {
      setCarregandoEstrutura(true);
      setErro("");
      setSucesso("");
      setEditandoNodeId(null);

      const res = await fetch(`/api/automacoes/${fluxoId}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar estrutura.");
      }

      const nosDb: AutomacaoNo[] = json.nos || [];
      const conexoesDb: AutomacaoConexao[] = json.conexoes || [];

      setNodes(nosDb.map(dbNoParaReactFlow));
      setEdges(conexoesDb.map(dbConexaoParaReactFlow));
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar estrutura.");
    } finally {
      setCarregandoEstrutura(false);
    }
  }

  async function carregarEstruturaParaValidacao(fluxoId: string) {
    const res = await fetch(`/api/automacoes/${fluxoId}`, {
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao carregar estrutura.");
    }

    const nosDb: AutomacaoNo[] = json.nos || [];
    const conexoesDb: AutomacaoConexao[] = json.conexoes || [];

    return {
      nodesValidacao: nosDb.map(dbNoParaReactFlow),
      edgesValidacao: conexoesDb.map(dbConexaoParaReactFlow),
    };
  }

  function dbConexaoParaReactFlow(conexao: AutomacaoConexao): Edge {
    const ehSempreSeguir = conexao.condicao_json?.tipo === "sempre";
    const offsetY = offsetLabelConexao(conexao.id);
    const usarIA = conexao.usar_ia === true;

    const labelConexao =
      conexao.rotulo || conexao.condicao_json?.valor || "";
    return {
      id: conexao.id,
      source: conexao.no_origem_id,
      target: conexao.no_destino_id,
      type: "default",
      ...( {
        pathOptions: {
        curvature: 0.55,
        },
      } as any ),
      animated: true,
      label: ehSempreSeguir
        ? ""
        : usarIA
        ? `✨ ${labelConexao}`
        : labelConexao,

      labelStyle: {
        fill: "#0f172a",
        fontSize: 10,
        fontWeight: 700,
        transform: `translateY(${offsetY}px)`,
      },

      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 0.92,
        transform: `translateY(${offsetY}px)`,
      },

      labelBgPadding: [4, 2],


      labelBgBorderRadius: 6,
      labelShowBg: true,
      style: {
        stroke: "#cbd5e1",
        strokeWidth: 2,
        strokeDasharray: "6 6",
      },

      data: {
        condicao_json: conexao.condicao_json || {},
        rotulo: ehSempreSeguir ? "Sempre seguir" : conexao.rotulo || "",
        usar_ia: conexao.usar_ia === true,
        descricao_ia: conexao.descricao_ia || "",
      },
    };
  }

  useEffect(() => {
    carregarFluxos();
    carregarSetores();
    carregarMidias();
    carregarTemplatesWhatsapp();
    carregarAgendasOpcoes();
  }, []);

  useEffect(() => {
    if (fluxoSelecionado?.id) {
      carregarEstrutura(fluxoSelecionado.id);
    }
  }, [fluxoSelecionado?.id]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const nodeOrigem = nodes.find((node) => node.id === connection.source);
      const tipoOrigem = String(nodeOrigem?.data?.tipo_no || "");

      const tipoCondicaoPadrao = tipoCondicaoPadraoPorTipoNo(tipoOrigem);
      const rotuloPadrao = rotuloPadraoPorTipoNo(tipoOrigem);
      const ehSempreSeguir = tipoCondicaoPadrao === "sempre";
      const id = criarIdTemporario("edge");
      const offsetY = offsetLabelConexao(id);
      const novaConexao: Edge = {
        ...connection,
        id,
        type: "default",
        pathOptions: {
          curvature: 0.75,
        },
        animated: true,
        label: ehSempreSeguir ? "" : "Nova condição",
        labelShowBg: true,

        labelStyle: {
          fill: "#0f172a",
          fontSize: 10,
          fontWeight: 700,
          transform: `translateY(${offsetY}px)`,
        },

        labelBgStyle: {
          fill: "#ffffff",
          fillOpacity: 0.92,
          transform: `translateY(${offsetY}px)`,
        },

        labelBgPadding: [4, 2],
        labelBgBorderRadius: 6,

        style: {
          stroke: "#cbd5e1",
          strokeWidth: 2,
          strokeDasharray: "6 6"
        },

        data: {
          rotulo: rotuloPadrao,
          condicao_json: {
            tipo: tipoCondicaoPadrao,
          },
          usar_ia: false,
          descricao_ia: "",
        },
      } as Edge;

      setEdges((eds) => addEdge(novaConexao, eds));
    },
    [nodes, setEdges]
  );

async function criarFluxoRapido() {
  try {
    setErro("");
    setErroEdicaoFluxo("");
    setSucesso("");
    setErroCriacaoFluxo("");

    const nome = novoFluxoNome.trim();

    if (!nome) {
      setErroCriacaoFluxo("Informe o nome do fluxo.");
      return;
    }

    const fluxoPadraoFinal = !jaExisteFluxoPadrao && novoFluxoPadrao;

    const gatilhosValidos = gatilhosNovoFluxo.filter((gatilho) =>
      String(gatilho.valor || "").trim()
    );

    if (!fluxoPadraoFinal && gatilhosValidos.length === 0) {
      setErroCriacaoFluxo(
        "Adicione pelo menos uma palavra-chave para iniciar o fluxo."
      );
      return;
    }

    const quantidadeInformada = Number(encerrarInatividadeQuantidade || 0);

    const segundosInatividade =
      encerrarInatividadeUnidade === "horas"
        ? quantidadeInformada * 60 * 60
        : quantidadeInformada * 60;

    if (!Number.isFinite(segundosInatividade) || quantidadeInformada <= 0) {
      setErroCriacaoFluxo("Informe um tempo válido para o encerramento por inatividade.");
      return;
    }

    if (segundosInatividade < 5 * 60) {
      setErroCriacaoFluxo("O tempo mínimo para encerramento por inatividade é de 5 minutos.");
      return;
    }

    if (segundosInatividade > 23 * 60 * 60) {
      setErroCriacaoFluxo("O tempo máximo para encerramento por inatividade é de 23 horas.");
      return;
    }

    const res = await fetch("/api/automacoes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        descricao: descricaoNovoFluxo,
        canal: "whatsapp",
        status: "rascunho",
        fluxo_padrao: fluxoPadraoFinal,
        configuracao_json: {
          encerramento_inatividade: {
            ativo: true,
            tempo_quantidade: quantidadeInformada,
            tempo_unidade: encerrarInatividadeUnidade,
            mensagem: encerrarInatividadeMensagem.trim(),
          },
        },
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao criar fluxo.");
    }

    const fluxoCriado = json.fluxo;

    if (!fluxoPadraoFinal) {
      for (const gatilho of gatilhosValidos) {
      const gatilhoRes = await fetch(
        `/api/automacoes/${fluxoCriado.id}/gatilhos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tipo_gatilho: "palavra_chave",
            valor: gatilho.valor,
            condicao: gatilho.condicao,
            ativo: gatilho.ativo !== false,
           }),
        }
      );

      const gatilhoJson = await gatilhoRes.json();

      if (!gatilhoRes.ok || !gatilhoJson.ok) {
        throw new Error(
          gatilhoJson.error || "Fluxo criado, mas houve erro ao criar um gatilho."
        );
      }
    }}

    setNovoFluxoNome("");
    setDescricaoNovoFluxo("");
    setGatilhosNovoFluxo([]);
    setNovoFluxoPadrao(false);
    setNovoGatilhoValor("");
    setNovoGatilhoCondicao("contem");
    resetarEncerramentoInatividadePadrao();
    setAbrirCriacao(false);

    setSucesso("Fluxo criado com sucesso.");
    await carregarFluxos();
    setFluxoSelecionado(fluxoCriado);
  } catch (error: any) {
    setErroCriacaoFluxo(error?.message || "Erro ao criar fluxo.");
  }
}

  function adicionarNo(tipoNo: string) {
    if (tipoNo === "inicio") {
        const jaExiste = nodes.some(
        (n) => n.data?.tipo_no === "inicio"
        );

        if (jaExiste) {
        setErro("Já existe um bloco de início.");
        return;
        }
    }

    if (!fluxoSelecionado) {
      setErro("Selecione um fluxo primeiro.");
      return;
    }

    const id = criarIdTemporario("node");

    const tituloPadrao = tituloPadraoTipoNo(tipoNo);
    const posicaoNovoNo = calcularPosicaoLivreNovoNo(nodes);

    const novoNoDb: AutomacaoNo = {
      id,
      tipo_no: tipoNo,
      titulo: tituloPadrao,
      descricao: null,
      posicao_x: posicaoNovoNo.x,
      posicao_y: posicaoNovoNo.y,
      configuracao_json:
      tipoNo === "enviar_texto"
        ? { mensagem: "Digite a mensagem aqui.", delay_segundos: 3 }
          : tipoNo === "pergunta_opcoes"
          ? {
              mensagem: "Escolha uma opção:",
              delay_segundos: 3,
              opcoes: [
                { valor: "1", titulo: "Opção 1" },
                { valor: "2", titulo: "Opção 2" },
              ],
              max_tentativas_invalidas: 3,
              max_tentativas_sem_resposta: 3,
              acao_excesso_tentativas: "transferir_atendimento",
              mensagem_excesso_tentativas:
                "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.",
              notificar_excesso_tentativas: true,
              notificar_email_excesso_tentativas: true,
            }
          : tipoNo === "enviar_botoes"
          ? {
              mensagem: "Escolha uma opção:",
              delay_segundos: 3,
              botoes: [
                { id: "sim", titulo: "Sim" },
                { id: "nao", titulo: "Não" },
              ],
              max_tentativas_invalidas: 3,
              max_tentativas_sem_resposta: 3,
              acao_excesso_tentativas: "transferir_atendimento",
              mensagem_excesso_tentativas:
                "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.",
              notificar_excesso_tentativas: true,
              notificar_email_excesso_tentativas: true,
            }
          : tipoNo === "botao_redirect"
          ? {
              mensagem: "Clique no botão abaixo para acessar.",
              botao_texto: "Acessar",
              url: "https://",
              delay_segundos: 3,
            }
          : tipoNo === "avaliacao"
          ? {
              mensagem: "De 1 a 5, como você avalia este atendimento?",
              nota_minima: 1,
              nota_maxima: 5,
              solicitar_comentario: false,
              mensagem_comentario: "Obrigado! Agora escreva um comentário sobre seu atendimento.",
              mensagem_erro: "Por favor, responda com uma nota de 1 a 5.",
            }
          : tipoNo === "capturar_resposta"
          ? {
              mensagem: "Me informe seu nome, por favor.",
              variavel: "nome",
              tipo_captura: "nome",
              obrigatorio: true,
              mensagem_erro: "Não consegui identificar essa informação. Por favor, envie novamente.",
              max_tentativas: 3,
              notificar_excesso_tentativas: true,
              notificar_email_excesso_tentativas: true,
            }
          : tipoNo === "agendar_disparo"
          ? {
              template_id: "",
              tempo_quantidade: 32,
              tempo_unidade: "horas",
              variaveis: [],
            }
          : tipoNo === "agenda_buscar_agendamento"
          ? {
              agenda_id: "",
              status_busca: ["agendado", "confirmado"],
              listar_para_escolha: true,
              quantidade_opcoes: 6,
              mensagem_encontrado:
                "Encontrei seu agendamento para {{agenda_data}} as {{agenda_hora}}.",
              mensagem_listar_agendamentos:
                "Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:",
              mensagem_nao_encontrado:
                "Nao encontrei nenhum agendamento futuro no seu contato.",
            }
          : tipoNo === "agenda_escolher_horario"
          ? {
              agenda_id: "",
              mensagem:
                "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira.",
              mensagem_listar_horarios:
                "Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:",
              mensagem_preferencia_indisponivel:
                "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:",
              quantidade_opcoes: 6,
              janela_dias: 14,
              mensagem_data_invalida:
                "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.",
              mensagem_sem_horarios:
                "Nao encontrei horarios livres para {{agenda_data_nova}}. Me diga outro dia ou horario.",
              mensagem_sem_expediente:
                "Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis.",
              max_tentativas_invalidas: 3,
              max_tentativas_sem_resposta: 3,
              acao_excesso_tentativas: "transferir_atendimento",
              mensagem_excesso_tentativas:
                "Nao consegui continuar o agendamento automatico. Vou te encaminhar para um atendente.",
              notificar_excesso_tentativas: true,
              notificar_email_excesso_tentativas: true,
            }
          : tipoNo === "agenda_criar_agendamento"
          ? {
              agenda_id: "",
              status_inicial: "agendado",
              mensagem:
                "Agendado! Seu horario ficou marcado para {{agenda_data}} as {{agenda_hora}}. Qualquer duvida e so entrar em contato.",
              mensagem_conflito:
                "Esse horario acabou de ficar indisponivel. Vamos escolher outro horario.",
              enviar_email_agendamento: true,
              email_agendamento_origem: "contato",
              email_agendamento_variavel: "email",
              lembrete_agendamento_ativo: false,
              lembrete_agendamento_quantidade: 2,
              lembrete_agendamento_unidade: "horas",
              lembrete_agendamento_whatsapp: true,
              lembrete_agendamento_email: false,
              lembrete_agendamento_template_id: "",
              lembrete_agendamento_variaveis: [],
            }
          : tipoNo === "agenda_remarcar_agendamento"
          ? {
              status_final: "agendado",
              mensagem:
                "Remarcado! Seu horario agora ficou para {{agenda_data}} as {{agenda_hora}}.",
              mensagem_conflito:
                "Esse novo horario acabou de ficar indisponivel. Vamos escolher outro horario.",
              enviar_email_agendamento: true,
              email_agendamento_origem: "contato",
              email_agendamento_variavel: "email",
            }
          : tipoNo === "agenda_cancelar_agendamento"
          ? {
              status_final: "cancelado",
              motivo: "Cancelado pelo cliente via automacao",
              mensagem:
                "Pronto, seu horario de {{agenda_data}} as {{agenda_hora}} foi cancelado. Quando quiser marcar novamente, e so me chamar.",
              enviar_email_agendamento: true,
              email_agendamento_origem: "contato",
              email_agendamento_variavel: "email",
            }
          : tipoNo === "encerrar"
          ? {
              mensagem: "",
              resultado_fluxo: "positivo",
              valor_conversao_tipo: "sem_valor",
            }
          : tipoNo === "interpretar_arquivo_ia"
          ? {
              mensagem: "Envie o arquivo para análise.",
              instrucao_ia:
                "Analise o arquivo enviado e responda se ele atende ao critério solicitado.",
              tipos_aceitos: ["imagem", "documento"],
              salvar_variavel: "analise_arquivo",
              max_tentativas_invalidas: 3,
              max_tentativas_sem_resposta: 3,
              acao_excesso_tentativas: "transferir_atendimento",
              mensagem_erro:
                "Não consegui interpretar o arquivo. Envie uma imagem ou PDF legível.",
              mensagem_excesso_tentativas:
                "Não consegui validar o arquivo automaticamente. Vou te encaminhar para um atendente.",
              notificar_excesso_tentativas: true,
              notificar_email_excesso_tentativas: true,
            }
          : {},
          delay_segundos: null,
    };

    const novoNodeBase = dbNoParaReactFlow(novoNoDb);

    const novoNode = novoNodeBase;

    setNodes((atuais) => [...atuais, novoNode]);

    abrirEdicaoNo(novoNode);

    if (tipoNo !== "inicio") {
    const inicio = nodes.find((n) => n.data?.tipo_no === "inicio");

    const jaExisteConexaoSaindoDoInicio = edges.some(
        (e) => e.source === inicio?.id
    );

    if (inicio && !jaExisteConexaoSaindoDoInicio) {
      const novaConexao: Edge = {
        id: criarIdTemporario("edge"),
        source: inicio.id,
        target: id,
        type: "default",
        animated: true,
        label: "",

        style: {
          stroke: "#cbd5e1",
          strokeWidth: 2,
          strokeDasharray: "6 6",
        },

        data: {
          rotulo: "Sempre seguir",
          condicao_json: {
            tipo: "sempre",
          },
        },
      };

        setEdges((atuais) => [...atuais, novaConexao]);
    }
    }

    return;
  }

  function adicionarBotaoResposta() {
    setBotoesNode((atuais) => {
      if (atuais.length >= 3) {
        setErro("O WhatsApp permite no máximo 3 botões.");
        return atuais;
      }

      return [
        ...atuais,
        {
          id: `opcao_${atuais.length + 1}`,
          titulo: `Opção ${atuais.length + 1}`,
        },
      ];
    });
  }
  
function offsetLabelConexao(edgeId: string) {
  let hash = 0;

  for (let i = 0; i < edgeId.length; i++) {
    hash = edgeId.charCodeAt(i) + ((hash << 5) - hash);
  }

  const offsets = [-20, 0, 20];

  return offsets[Math.abs(hash) % offsets.length];
}

  function atualizarBotaoResposta(
    index: number,
    campo: "id" | "titulo",
    valor: string
  ) {
    setBotoesNode((atuais) =>
      atuais.map((botao, i) =>
        i === index ? { ...botao, [campo]: valor } : botao
      )
    );
  }

  function removerBotaoResposta(index: number) {
    setBotoesNode((atuais) => atuais.filter((_, i) => i !== index));
  }

  function marcarNodeSelecionado(nodeId: string | null) {
    setNodes((atuais) =>
      atuais.map((node) => ({
        ...node,
        selected: nodeId ? node.id === nodeId : false,
        data: {
          ...(node.data || {}),
          isSelecionado: nodeId ? node.id === nodeId : false,
        },
      }))
    );

    if (nodeId) {
      setEdges((atuais) =>
        atuais.map((edge) => ({
          ...edge,
          selected: false,
          style: {
            ...(edge.style || {}),
            stroke: "#cbd5e1",
            strokeWidth: 2,
            strokeDasharray: "6 6",
          },
        }))
      );
    }
  }

  function abrirEdicaoNo(node: Node) {
    const configuracaoJson = node.data?.configuracao_json as
      | Record<string, any>
      | undefined;

    marcarNodeSelecionado(node.id);
    setEditandoNodeId(node.id);
    setTipoNodeEdicao(String(node.data?.tipo_no || ""));
    setEditandoEdgeId(null);

    setTituloNode(String(node.data?.titulo || ""));
    setMensagemNode(
      String(
        String(node.data?.tipo_no || "") === "agenda_buscar_agendamento"
          ? configuracaoJson?.mensagem_encontrado || configuracaoJson?.mensagem || ""
          : configuracaoJson?.mensagem || ""
      )
    );
    setDelayNode(
      node.data?.delay_segundos !== null &&
      node.data?.delay_segundos !== undefined
        ? String(node.data.delay_segundos)
        : ""
    );
    setSolicitarComentarioNode(
      Boolean(configuracaoJson?.solicitar_comentario)
    );

    setMensagemComentarioNode(
      String(configuracaoJson?.mensagem_comentario || "")
    );

    setNotaMinimaNode(
      String(configuracaoJson?.nota_minima ?? 1)
    );

    setNotaMaximaNode(
      String(configuracaoJson?.nota_maxima ?? 5)
    );

    setMidiaUrlNode(String(configuracaoJson?.midia_url || ""));
    setMidiaNomeNode(String(configuracaoJson?.midia_nome || ""));
    setRedirectBotaoTextoNode(
      String(configuracaoJson?.botao_texto || "Acessar")
    );
    setRedirectUrlNode(String(configuracaoJson?.url || ""));
    setSetorDestino(configuracaoJson?.setor_id || "");
    setConfirmandoExclusaoNo(false);
    
    setCapturaVariavelNode(String(configuracaoJson?.variavel || "nome"));
    setCapturaTipoNode(String(configuracaoJson?.tipo_captura || "nome"));
    setCapturaMensagemErroNode(
      String(
        configuracaoJson?.mensagem_erro ||
          "Não consegui identificar essa informação. Por favor, envie novamente."
      )
    );
    setCapturaMaxTentativasNode(String(configuracaoJson?.max_tentativas || 3));
    setMaxTentativasInvalidasNode(
      String(configuracaoJson?.max_tentativas_invalidas || 3)
    );

    setMaxTentativasSemRespostaNode(
      String(configuracaoJson?.max_tentativas_sem_resposta || 3)
    );

    setAcaoExcessoTentativasNode(
      String(configuracaoJson?.acao_excesso_tentativas || "transferir_atendimento")
    );
    setSetorExcessoTentativasNode(
      String(configuracaoJson?.setor_excesso_tentativas || "")
    );

    setMensagemExcessoTentativasNode(
      String(
        configuracaoJson?.mensagem_excesso_tentativas ||
          "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente."
      )
    );

    setNotificarExcessoTentativasNode(
      configuracaoJson?.notificar_excesso_tentativas !== false
    );

    setNotificarEmailExcessoTentativasNode(
      configuracaoJson?.notificar_email_excesso_tentativas !== false
    );
    
    setNotificarAoChegarNode(Boolean(configuracaoJson?.notificar_ao_chegar));

    setNotificacaoTituloNode(
      String(configuracaoJson?.notificacao_titulo || "")
    );

    setNotificacaoMensagemNode(
      String(configuracaoJson?.notificacao_mensagem || "")
    );

    setNotificarEmailNode(Boolean(configuracaoJson?.notificar_email));

    setAgendarDisparoTemplateIdNode(
      String(configuracaoJson?.template_id || "")
    );

    setAgendarDisparoQuantidadeNode(
      String(configuracaoJson?.tempo_quantidade || 32)
    );

    setAgendarDisparoUnidadeNode(
      configuracaoJson?.tempo_unidade === "dias" ? "dias" : "horas"
    );

    setAgendarDisparoVariaveisNode(
      Array.isArray(configuracaoJson?.variaveis)
        ? configuracaoJson.variaveis
            .map((item: any) => normalizarVariavelFluxo(String(item || "")))
            .filter(Boolean)
            .join("\n")
        : ""
    );

    setAgendaIdNode(String(configuracaoJson?.agenda_id || ""));
    setAgendaListarAgendamentosNode(
      configuracaoJson?.listar_para_escolha === true
    );
    setAgendaQuantidadeOpcoesNode(
      String(configuracaoJson?.quantidade_opcoes || 6)
    );
    setAgendaJanelaDiasNode(String(configuracaoJson?.janela_dias || 14));
    setAgendaMensagemSemHorariosNode(
      String(
        configuracaoJson?.mensagem_sem_horarios ||
          "No momento nao encontrei horarios disponiveis. Vou te encaminhar para um atendente."
      )
    );
    setAgendaMensagemSemExpedienteNode(
      String(
        configuracaoJson?.mensagem_sem_expediente ||
          "Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis."
      )
    );
    setAgendaMensagemDataInvalidaNode(
      String(
        configuracaoJson?.mensagem_data_invalida ||
          "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}."
      )
    );
    setAgendaMensagemListarAgendamentosNode(
      String(
        configuracaoJson?.mensagem_listar_agendamentos ||
          "Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:"
      )
    );
    setAgendaMensagemListarHorariosNode(
      String(
        configuracaoJson?.mensagem_listar_horarios ||
          "Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:"
      )
    );
    setAgendaMensagemPreferenciaIndisponivelNode(
      String(
        configuracaoJson?.mensagem_preferencia_indisponivel ||
          "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:"
      )
    );
    setAgendaMensagemConflitoNode(
      String(
        configuracaoJson?.mensagem_conflito ||
          "Esse horario acabou de ficar indisponivel. Vamos escolher outro horario."
      )
    );
    setAgendaStatusAgendamentoNode(
      String(
        configuracaoJson?.status_inicial ||
          configuracaoJson?.status_final ||
          "agendado"
      )
    );
    setAgendaEnviarEmailNode(configuracaoJson?.enviar_email_agendamento !== false);
    setAgendaEmailOrigemNode(
      configuracaoJson?.email_agendamento_origem === "variavel"
        ? "variavel"
        : "contato"
    );
    setAgendaEmailVariavelNode(
      String(configuracaoJson?.email_agendamento_variavel || "email")
    );
    setAgendaLembreteAtivoNode(
      configuracaoJson?.lembrete_agendamento_ativo === true
    );
    setAgendaLembreteQuantidadeNode(
      String(configuracaoJson?.lembrete_agendamento_quantidade || 2)
    );
    setAgendaLembreteUnidadeNode(
      configuracaoJson?.lembrete_agendamento_unidade === "minutos"
        ? "minutos"
        : configuracaoJson?.lembrete_agendamento_unidade === "dias"
        ? "dias"
        : "horas"
    );
    setAgendaLembreteWhatsappNode(
      configuracaoJson?.lembrete_agendamento_whatsapp !== false
    );
    setAgendaLembreteEmailNode(
      configuracaoJson?.lembrete_agendamento_email === true
    );
    setAgendaLembreteTemplateIdNode(
      String(configuracaoJson?.lembrete_agendamento_template_id || "")
    );
    setAgendaLembreteVariaveisNode(
      Array.isArray(configuracaoJson?.lembrete_agendamento_variaveis)
        ? configuracaoJson.lembrete_agendamento_variaveis
            .map((item: any) => normalizarVariavelFluxo(String(item || "")))
            .filter(Boolean)
            .join("\n")
        : ""
    );
    setAgendaMotivoCancelamentoNode(
      String(
        configuracaoJson?.motivo ||
          "Cancelado pelo cliente via automacao"
      )
    );

    setEncerrarResultadoNode(
      resultadoEncerramentoValido(configuracaoJson?.resultado_fluxo)
        ? configuracaoJson.resultado_fluxo
        : "positivo"
    );

    setEncerrarValorTipoNode(
      tipoValorConversaoValido(configuracaoJson?.valor_conversao_tipo)
        ? configuracaoJson.valor_conversao_tipo
        : "sem_valor"
    );

    setEncerrarValorFixoNode(
      configuracaoJson?.valor_conversao != null
        ? String(configuracaoJson.valor_conversao)
        : ""
    );

    setEncerrarValorVariavelNode(
      String(configuracaoJson?.valor_conversao_variavel || "")
    );

    setArquivoInstrucaoIaNode(
      String(configuracaoJson?.instrucao_ia || "")
    );

    setArquivoMensagemErroNode(
      String(
        configuracaoJson?.mensagem_erro ||
          "Não consegui interpretar o arquivo. Envie uma imagem ou PDF legível."
      )
    );

    setArquivoCamposExtracaoNode(
      Array.isArray(configuracaoJson?.campos_extracao)
        ? configuracaoJson.campos_extracao.join("\n")
        : ""
    );

    if (Array.isArray(configuracaoJson?.opcoes)) {
      setOpcoesNode(configuracaoJson.opcoes);
    } else {
      setOpcoesNode([]);
    }
    if (Array.isArray(configuracaoJson?.botoes)) {
      setBotoesNode(configuracaoJson.botoes);
    } else {
      setBotoesNode([]);
    }
  }

function abrirEdicaoConexao(edge: Edge) {
    const data = edge.data as
      | {
          condicao_json?: Record<string, any>;
          rotulo?: string;
          usar_ia?: boolean;
          descricao_ia?: string;
        }
      | undefined;

  const condicao = data?.condicao_json || {};
  const timeoutSegundos = Number(condicao.timeout_segundos || 7200);

  if (timeoutSegundos % 3600 === 0) {
    setTimeoutQuantidade(String(timeoutSegundos / 3600));
    setTimeoutUnidade("horas");
  } else {
    setTimeoutQuantidade(String(Math.max(1, Math.round(timeoutSegundos / 60))));
    setTimeoutUnidade("minutos");
  }

  setStatusEnvioTimeout(
    condicao.status_envio || "qualquer"
  );

  marcarNodeSelecionado(null);
  setEditandoEdgeId(edge.id);
  setEditandoNodeId(null);

  setRotuloConexao(String(data?.rotulo || ""));
  setValorCondicao(String(condicao.valor || ""));
  setConfirmandoExclusaoConexao(false);

  const rotuloAtual = String(data?.rotulo || "").trim();
  const valorAtual = String(condicao.valor || "").trim();

  setNomeConexaoEditadoManual(
    !!rotuloAtual &&
      rotuloAtual !== "Nova condição" &&
      rotuloAtual !== valorAtual
  );

  setUsarIaConexao(Boolean(data?.usar_ia));
  setDescricaoIaConexao(String(data?.descricao_ia || ""));

  const respostaEsperada = String(condicao.valor || "").trim();

  if (!data?.descricao_ia) {
    setDescricaoIaConexao(
      gerarSugestaoDescricaoIA(
        respostaEsperada ||
          data?.rotulo ||
          edge.label?.toString() ||
          ""
      )
    );
  } else {
    setDescricaoIaConexao(String(data.descricao_ia || ""));
  }
  
  const nodeOrigem = nodes.find((node) => node.id === edge.source);
  const tipoOrigem = String(nodeOrigem?.data?.tipo_no || "");
  const tipoPadrao = tipoCondicaoPadraoPorTipoNo(tipoOrigem);

  setTipoCondicaoConexao(String(condicao.tipo || tipoPadrao));
}

function adicionarOpcaoPergunta() {
  setOpcoesNode((atuais) => [
    ...atuais,
    {
      valor: String(atuais.length + 1),
      titulo: `Opção ${atuais.length + 1}`,
    },
  ]);
}

function atualizarOpcaoPergunta(
  index: number,
  campo: "valor" | "titulo",
  valor: string
) {
  setOpcoesNode((atuais) =>
    atuais.map((opcao, i) =>
      i === index ? { ...opcao, [campo]: valor } : opcao
    )
  );
}

function removerOpcaoPergunta(index: number) {
  setOpcoesNode((atuais) => atuais.filter((_, i) => i !== index));
}

function aplicarEdicaoNo() {
  const deveExibirAvisoDisparo =
    tipoNodeEdicao === "agendar_disparo" ||
    (tipoNodeEdicao === "agenda_criar_agendamento" &&
      agendaLembreteAtivoNode &&
      agendaLembreteWhatsappNode);

  if (deveExibirAvisoDisparo) {
    setAcaoPendenteAplicarNo(() => () => {
      aplicarEdicaoNoInterno();
    });

    setMostrarModalCustoAgendamento(true);
    return;
  }

  aplicarEdicaoNoInterno();
}

function aplicarEdicaoNoInterno() {
  if (!editandoNodeId) return;

  const valorFixoEncerramento = normalizarValorMonetario(encerrarValorFixoNode);
  const variavelEncerramento = normalizarVariavelFluxo(
    encerrarValorVariavelNode
  );

  if (
    tipoNodeEdicao === "encerrar" &&
    encerrarResultadoNode === "positivo" &&
    encerrarValorTipoNode === "valor_fixo" &&
    valorFixoEncerramento == null
  ) {
    setErro("Informe um valor fixo valido para a conversao.");
    return;
  }

  if (
    tipoNodeEdicao === "encerrar" &&
    encerrarResultadoNode === "positivo" &&
    encerrarValorTipoNode === "variavel" &&
    !variavelEncerramento
  ) {
    setErro("Informe a variavel que contem o valor da conversao.");
    return;
  }

  if (tipoNodeEdicao === "botao_redirect") {
    if (!mensagemNode.trim()) {
      setErro("Informe a mensagem do Botao redirect.");
      return;
    }

    const textoBotaoRedirect = redirectBotaoTextoNode.trim();

    if (!textoBotaoRedirect || textoBotaoRedirect.length > 20) {
      setErro("Informe um texto de botao com ate 20 caracteres.");
      return;
    }

    if (!urlHttpValida(redirectUrlNode)) {
      setErro("Informe uma URL iniciando com http:// ou https://.");
      return;
    }
  }

  if (tipoNodeEdicao === "agendar_disparo" && templateAgendarDisparoSelecionado) {
    if (templateWhatsappTemCabecalhoMidia(templateAgendarDisparoSelecionado)) {
      setErro(
        "O template selecionado possui cabecalho de midia. Use um template aprovado apenas com texto para agendar disparos."
      );
      return;
    }

    const totalVariaveisTemplate = contarVariaveisTemplateWhatsapp(
      templateAgendarDisparoSelecionado
    );
    const totalVariaveisConfiguradas = contarVariaveisObrigatoriasPreenchidas(
      agendarDisparoVariaveisNode,
      totalVariaveisTemplate
    );

    if (totalVariaveisTemplate > 3) {
      setErro(
        "O template selecionado exige mais de 3 variaveis. Use um template com ate 3 variaveis para este bloco."
      );
      return;
    }

    if (totalVariaveisConfiguradas < totalVariaveisTemplate) {
      setErro(
        `O template selecionado exige ${totalVariaveisTemplate} variavel(is). Preencha os campos Variavel 1, 2 e 3 antes de salvar o bloco.`
      );
      return;
    }
  }

  if (
    (([
      "agenda_criar_agendamento",
      "agenda_remarcar_agendamento",
      "agenda_cancelar_agendamento",
    ].includes(tipoNodeEdicao) &&
      agendaEnviarEmailNode) ||
      (tipoNodeEdicao === "agenda_criar_agendamento" &&
        agendaLembreteAtivoNode &&
        agendaLembreteEmailNode)) &&
    agendaEmailOrigemNode === "variavel" &&
    !agendaEmailVariavelNode.trim()
  ) {
    setErro("Informe a variavel que contem o email do contato.");
    return;
  }

  if (tipoNodeEdicao === "agenda_criar_agendamento" && agendaLembreteAtivoNode) {
    const quantidadeLembrete = Number(agendaLembreteQuantidadeNode || 0);

    if (!Number.isFinite(quantidadeLembrete) || quantidadeLembrete <= 0) {
      setErro("Informe uma antecedencia valida para o lembrete.");
      return;
    }

    if (!agendaLembreteWhatsappNode && !agendaLembreteEmailNode) {
      setErro("Selecione pelo menos um canal para o lembrete.");
      return;
    }

    if (agendaLembreteWhatsappNode && !agendaLembreteTemplateIdNode.trim()) {
      setErro("Selecione um template WhatsApp para o lembrete.");
      return;
    }

    if (agendaLembreteWhatsappNode && templateAgendaLembreteSelecionado) {
      if (templateWhatsappTemCabecalhoMidia(templateAgendaLembreteSelecionado)) {
        setErro(
          "O template do lembrete possui cabecalho de midia. Use um template aprovado apenas com texto para lembretes agendados."
        );
        return;
      }

      const totalVariaveisTemplate = contarVariaveisTemplateWhatsapp(
        templateAgendaLembreteSelecionado
      );
      const totalVariaveisConfiguradas = contarVariaveisObrigatoriasPreenchidas(
        agendaLembreteVariaveisNode,
        totalVariaveisTemplate
      );

      if (totalVariaveisTemplate > 3) {
        setErro(
          "O template do lembrete exige mais de 3 variaveis. Use um template com ate 3 variaveis para este bloco."
        );
        return;
      }

      if (totalVariaveisConfiguradas < totalVariaveisTemplate) {
        setErro(
          `O template do lembrete exige ${totalVariaveisTemplate} variavel(is). Preencha os campos Variavel 1, 2 e 3 antes de salvar o bloco.`
        );
        return;
      }
    }
  }

  if (
    tipoNodeEdicao === "capturar_resposta" &&
    VARIAVEIS_FIXAS_CONTATO_RESERVADAS.includes(
      capturaVariavelNode.trim().toLowerCase()
    )
  ) {
    setErro(
      "Esse nome de variavel e reservado para os dados fixos do contato."
    );
    return;
  }

  setErro("");

  setNodes((atuais) =>
    atuais.map((node) => {
      if (node.id !== editandoNodeId) return node;

      const tipoAtual = String(node.data?.tipo_no || "enviar_texto");
      const tipoFinal = tipoAtual === "inicio" ? "inicio" : tipoNodeEdicao;

      const configuracao_json: Record<string, any> = {};

      if (
        tipoFinal === "enviar_texto" ||
        tipoFinal === "pergunta_opcoes" ||
        tipoFinal === "enviar_botoes" ||
        tipoFinal === "botao_redirect" ||
        tipoFinal === "enviar_imagem" ||
        tipoFinal === "enviar_video" ||
        tipoFinal === "enviar_audio" ||
        tipoFinal === "transferir_setor" ||
        tipoFinal === "encerrar" ||
        tipoFinal === "avaliacao" ||
        tipoFinal === "capturar_resposta" ||
        tipoFinal === "agenda_buscar_agendamento" ||
        tipoFinal === "agenda_escolher_horario" ||
        tipoFinal === "agenda_criar_agendamento" ||
        tipoFinal === "agenda_remarcar_agendamento" ||
        tipoFinal === "agenda_cancelar_agendamento" ||
        tipoFinal === "interpretar_arquivo_ia"
      ) {
        configuracao_json.mensagem = mensagemNode;
      }

      if (tipoFinal === "encerrar") {
        configuracao_json.resultado_fluxo = encerrarResultadoNode;
        configuracao_json.valor_conversao_tipo =
          encerrarResultadoNode === "positivo"
            ? encerrarValorTipoNode
            : "sem_valor";

        if (
          encerrarResultadoNode === "positivo" &&
          encerrarValorTipoNode === "valor_fixo"
        ) {
          configuracao_json.valor_conversao = valorFixoEncerramento;
        }

        if (
          encerrarResultadoNode === "positivo" &&
          encerrarValorTipoNode === "variavel"
        ) {
          configuracao_json.valor_conversao_variavel = variavelEncerramento;
        }
      }

      if (tipoFinal === "agendar_disparo") {
        configuracao_json.template_id = agendarDisparoTemplateIdNode;
        configuracao_json.tempo_quantidade = Math.max(
          1,
          Number(agendarDisparoQuantidadeNode || 1)
        );
        configuracao_json.tempo_unidade = agendarDisparoUnidadeNode;
        configuracao_json.variaveis = agendarDisparoVariaveisNode
          .split("\n")
          .map((item) => normalizarVariavelFluxo(item))
          .filter(Boolean);
      }

      if (tipoFinal === "agenda_buscar_agendamento") {
        configuracao_json.agenda_id = agendaIdNode;
        configuracao_json.status_busca = ["agendado", "confirmado"];
        configuracao_json.listar_para_escolha = agendaListarAgendamentosNode;
        configuracao_json.quantidade_opcoes = Math.max(
          1,
          Math.min(10, Number(agendaQuantidadeOpcoesNode || 6))
        );
        configuracao_json.mensagem_encontrado =
          mensagemNode.trim() ||
          "Encontrei seu agendamento para {{agenda_data}} as {{agenda_hora}}.";
        configuracao_json.mensagem_listar_agendamentos =
          agendaMensagemListarAgendamentosNode.trim() ||
          "Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:";
        configuracao_json.mensagem_nao_encontrado =
          agendaMensagemSemHorariosNode.trim() ||
          "Nao encontrei nenhum agendamento futuro no seu contato.";
      }

      if (tipoFinal === "agenda_escolher_horario") {
        configuracao_json.agenda_id = agendaIdNode;
        configuracao_json.mensagem =
          mensagemNode.trim() ||
          "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira.";
        configuracao_json.mensagem_listar_horarios =
          agendaMensagemListarHorariosNode.trim() ||
          "Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:";
        configuracao_json.mensagem_preferencia_indisponivel =
          agendaMensagemPreferenciaIndisponivelNode.trim() ||
          "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:";
        configuracao_json.mensagem_data_invalida =
          agendaMensagemDataInvalidaNode.trim() ||
          "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}.";
        configuracao_json.quantidade_opcoes = Math.max(
          1,
          Math.min(10, Number(agendaQuantidadeOpcoesNode || 6))
        );
        configuracao_json.janela_dias = Math.max(
          1,
          Math.min(60, Number(agendaJanelaDiasNode || 14))
        );
        configuracao_json.mensagem_sem_horarios =
          agendaMensagemSemHorariosNode.trim() ||
          "Nao encontrei horarios livres para {{agenda_data_nova}}. Me diga outro dia ou horario.";
        configuracao_json.mensagem_sem_expediente =
          agendaMensagemSemExpedienteNode.trim() ||
          "Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis.";
      }

      if (tipoFinal === "agenda_criar_agendamento") {
        configuracao_json.agenda_id = agendaIdNode;
        configuracao_json.status_inicial =
          agendaStatusAgendamentoNode === "confirmado" ? "confirmado" : "agendado";
        configuracao_json.mensagem =
          mensagemNode.trim() ||
          "Agendado! Seu horario ficou marcado para {{agenda_data}} as {{agenda_hora}}. Qualquer duvida e so entrar em contato.";
        configuracao_json.mensagem_conflito =
          agendaMensagemConflitoNode.trim() ||
          "Esse horario acabou de ficar indisponivel. Vamos escolher outro horario.";
        configuracao_json.enviar_email_agendamento = agendaEnviarEmailNode;
        configuracao_json.email_agendamento_origem =
          agendaEmailOrigemNode === "variavel" ? "variavel" : "contato";
        configuracao_json.email_agendamento_variavel =
          agendaEmailVariavelNode.trim() || "email";
        configuracao_json.lembrete_agendamento_ativo =
          agendaLembreteAtivoNode;
        configuracao_json.lembrete_agendamento_quantidade = Math.max(
          1,
          Number(agendaLembreteQuantidadeNode || 2)
        );
        configuracao_json.lembrete_agendamento_unidade =
          agendaLembreteUnidadeNode;
        configuracao_json.lembrete_agendamento_whatsapp =
          agendaLembreteWhatsappNode;
        configuracao_json.lembrete_agendamento_email =
          agendaLembreteEmailNode;
        configuracao_json.lembrete_agendamento_template_id =
          agendaLembreteTemplateIdNode;
        configuracao_json.lembrete_agendamento_variaveis =
          agendaLembreteVariaveisNode
            .split("\n")
            .map((item) => normalizarVariavelFluxo(item))
            .filter(Boolean);
      }

      if (tipoFinal === "agenda_remarcar_agendamento") {
        configuracao_json.status_final =
          agendaStatusAgendamentoNode === "confirmado" ? "confirmado" : "agendado";
        configuracao_json.mensagem =
          mensagemNode.trim() ||
          "Remarcado! Seu horario agora ficou para {{agenda_data}} as {{agenda_hora}}.";
        configuracao_json.mensagem_conflito =
          agendaMensagemConflitoNode.trim() ||
          "Esse novo horario acabou de ficar indisponivel. Vamos escolher outro horario.";
        configuracao_json.enviar_email_agendamento = agendaEnviarEmailNode;
        configuracao_json.email_agendamento_origem =
          agendaEmailOrigemNode === "variavel" ? "variavel" : "contato";
        configuracao_json.email_agendamento_variavel =
          agendaEmailVariavelNode.trim() || "email";
      }

      if (tipoFinal === "agenda_cancelar_agendamento") {
        configuracao_json.status_final =
          agendaStatusAgendamentoNode === "faltou" ? "faltou" : "cancelado";
        configuracao_json.motivo =
          agendaMotivoCancelamentoNode.trim() ||
          "Cancelado pelo cliente via automacao";
        configuracao_json.mensagem =
          mensagemNode.trim() ||
          "Pronto, seu horario de {{agenda_data}} as {{agenda_hora}} foi cancelado. Quando quiser marcar novamente, e so me chamar.";
        configuracao_json.enviar_email_agendamento = agendaEnviarEmailNode;
        configuracao_json.email_agendamento_origem =
          agendaEmailOrigemNode === "variavel" ? "variavel" : "contato";
        configuracao_json.email_agendamento_variavel =
          agendaEmailVariavelNode.trim() || "email";
      }

      if (tipoFinal === "pergunta_opcoes") {
        configuracao_json.opcoes = opcoesNode;
      }

      if (tipoFinal === "enviar_botoes") {
        configuracao_json.botoes = botoesNode;
      }

      if (tipoFinal === "botao_redirect") {
        configuracao_json.botao_texto =
          redirectBotaoTextoNode.trim() || "Acessar";
        configuracao_json.url = redirectUrlNode.trim();
      }

      if (
        tipoFinal === "pergunta_opcoes" ||
        tipoFinal === "enviar_botoes" ||
        tipoFinal === "capturar_resposta" ||
        tipoFinal === "agenda_buscar_agendamento" ||
        tipoFinal === "agenda_escolher_horario" ||
        tipoFinal === "avaliacao" ||
        tipoFinal === "interpretar_arquivo_ia"
      ) {
        configuracao_json.max_tentativas_invalidas = Math.max(
          1,
          Number(maxTentativasInvalidasNode || 3)
        );

        configuracao_json.max_tentativas_sem_resposta = Math.max(
          1,
          Number(maxTentativasSemRespostaNode || 3)
        );

        configuracao_json.acao_excesso_tentativas =
          acaoExcessoTentativasNode || "transferir_atendimento";

        configuracao_json.setor_excesso_tentativas =
          setorExcessoTentativasNode || null;

        configuracao_json.mensagem_excesso_tentativas =
          mensagemExcessoTentativasNode.trim() ||
          "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.";
        configuracao_json.notificar_excesso_tentativas =
          notificarExcessoTentativasNode;

        configuracao_json.notificar_email_excesso_tentativas =
          notificarEmailExcessoTentativasNode;
      }

      if (tipoFinal === "transferir_setor") {
        configuracao_json.setor_id = setorDestino;
      }

      if (
        tipoFinal === "enviar_imagem" ||
        tipoFinal === "enviar_video" ||
        tipoFinal === "enviar_audio"
      ) {
        configuracao_json.midia_url = midiaUrlNode;
        configuracao_json.midia_nome = midiaNomeNode;
      }

      if (tipoFinal === "avaliacao") {
        configuracao_json.solicitar_comentario =
          solicitarComentarioNode;

        configuracao_json.mensagem_comentario =
          mensagemComentarioNode;

        configuracao_json.nota_minima = Math.max(
          0,
          Number(notaMinimaNode || 0)
        );

        configuracao_json.nota_maxima = Math.max(
          Number(notaMinimaNode || 0),
          Number(notaMaximaNode || 5)
        );

        configuracao_json.mensagem_erro =
          `Por favor, responda com uma nota de ${configuracao_json.nota_minima} a ${configuracao_json.nota_maxima}.`;
      }

      if (tipoFinal === "capturar_resposta") {
        configuracao_json.variavel =
          capturaVariavelNode.trim().toLowerCase() || "resposta";

        configuracao_json.tipo_captura = capturaTipoNode || "texto";
        configuracao_json.obrigatorio = true;

        configuracao_json.mensagem_erro =
          capturaMensagemErroNode.trim() ||
          "Não consegui identificar essa informação. Por favor, envie novamente.";
      }

      if (tipoFinal === "interpretar_arquivo_ia") {
        configuracao_json.instrucao_ia = arquivoInstrucaoIaNode.trim();
        configuracao_json.tipos_aceitos = ["imagem", "documento"];
        configuracao_json.salvar_variavel = "analise_arquivo";
        configuracao_json.mensagem_erro =
          arquivoMensagemErroNode.trim() ||
          "Não consegui interpretar o arquivo. Envie uma imagem ou PDF legível.";

        configuracao_json.campos_extracao = arquivoCamposExtracaoNode
          .split(",")
          .map((campo) =>
            campo
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9_]/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_|_$/g, "")
          )
          .filter(Boolean);
      }

        configuracao_json.notificar_ao_chegar = notificarAoChegarNode;
        configuracao_json.notificacao_titulo = notificacaoTituloNode.trim();
        configuracao_json.notificacao_mensagem = notificacaoMensagemNode.trim();
        configuracao_json.notificar_email = notificarEmailNode;

      const noAtualizado = dbNoParaReactFlow({
        id: node.id,
        tipo_no: tipoFinal,
        titulo: tituloNode.trim() || tituloPadraoTipoNo(tipoFinal),
        descricao: String(node.data?.descricao || "") || null,
        posicao_x: node.position.x,
        posicao_y: node.position.y,
        configuracao_json,
        delay_segundos:
          tipoFinal === "inicio"
            ? null
            : normalizarDelaySegundos(delayNode),
      });

      return {
        ...noAtualizado,
        selected: true,
        data: {
          ...noAtualizado.data,
          isSelecionado: true,
        },
      };
    })
  );

  setSucesso("Bloco atualizado. Clique em Salvar fluxo para gravar no banco.");
  fecharPainelEdicao();
}

function aplicarEdicaoConexao() {
  if (!editandoEdgeId) return;

  setEdges((atuais) =>
    atuais.map((edge) => {
      if (edge.id !== editandoEdgeId) return edge;

      const ehSempreSeguir = tipoCondicaoConexao === "sempre";
      const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";
      const labelBase = ehTimeout
        ? `Sem resposta em ${timeoutQuantidade} ${timeoutUnidade}`
        : rotuloConexao || valorCondicao || "Condição";

      const labelFinal =
        usarIaConexao && !ehSempreSeguir
          ? `✨ ${labelBase}`
          : labelBase;
          
      let condicaoJson: Record<string, any> = {};

      if (ehSempreSeguir) {
        condicaoJson = {
          tipo: "sempre",
        };
      } else if (ehTimeout) {
        const quantidade = Math.max(1, Number(timeoutQuantidade || 1));

        const multiplicador =
          timeoutUnidade === "horas" ? 3600 : 60;

        const timeoutSegundos = quantidade * multiplicador;

        if (timeoutSegundos < 300) {
          setErro(
            "O tempo mínimo para timeout sem resposta é de 5 minutos."
          );

          return edge;
        }

        const LIMITE_TIMEOUT_SEGUNDOS = 79200; // 22 horas

        if (timeoutSegundos > LIMITE_TIMEOUT_SEGUNDOS) {
          setErro(
            "Para mensagens comuns, o tempo máximo sem resposta é de 22 horas."
          );

          return edge;
        }

        condicaoJson = {
          tipo: "timeout_sem_resposta",
          timeout_segundos: timeoutSegundos,
          tempo_quantidade: quantidade,
          tempo_unidade: timeoutUnidade,
          status_envio: statusEnvioTimeout,
        };
      } else if (valorCondicao) {
        condicaoJson = {
          tipo: tipoCondicaoConexao,
          valor: valorCondicao,
        };
      }

      return {
        ...edge,
        label: ehSempreSeguir ? "" : labelFinal,

        data: {
          ...(edge.data || {}),
          rotulo: ehSempreSeguir
            ? "Sempre seguir"
            : ehTimeout
            ? `Sem resposta em ${timeoutQuantidade} ${timeoutUnidade}`
            : rotuloConexao,

          condicao_json: condicaoJson,
          usar_ia: usarIaConexao,
          descricao_ia: descricaoIaConexao.trim(),
        },
      };
    })
  );

  setSucesso("Conexão atualizada. Clique em Salvar fluxo para gravar no banco.");
}

function obterFluxoAlvoEdicao() {
  return fluxoEmEdicao || fluxoSelecionado;
}

function existeOutroFluxoPadraoNaEmpresa() {
  const fluxoParaEditar = obterFluxoAlvoEdicao();

  if (!fluxoParaEditar) return false;

  return fluxos.some(
    (fluxo) =>
      fluxo.fluxo_padrao &&
      fluxo.status !== "arquivado" &&
      fluxo.id !== fluxoParaEditar.id
  );
}

function abrirEdicaoFluxo(fluxoAlvo?: Fluxo) {
  const fluxoParaEditar = fluxoAlvo || fluxoSelecionado;

  if (!fluxoParaEditar) return;

  if (fluxoPadraoEdicao && existeOutroFluxoPadraoNaEmpresa()) {
    setErroEdicaoFluxo(
      "Já existe outro fluxo padrão cadastrado. Desmarque o fluxo padrão atual antes de definir este fluxo como padrão."
    );
    return;
  }

  setErro("");
  setErroEdicaoFluxo("");
  setFluxoEmEdicao(fluxoParaEditar);
  setEditandoFluxo(true);
  setNomeFluxoEdicao(fluxoParaEditar.nome || "");
  setDescricaoFluxoEdicao(fluxoParaEditar.descricao || "");
  setFluxoPadraoEdicao(Boolean(fluxoParaEditar.fluxo_padrao));

  const config = fluxoParaEditar.configuracao_json || {};
  const encerramento = config.encerramento_inatividade || {};
  const unidadeEncerramento =
    encerramento.tempo_unidade === "minutos" ? "minutos" : "horas";
  const quantidadePadraoEncerramento =
    unidadeEncerramento === "minutos" ? 1380 : 23;

  setEncerrarInatividadeQuantidade(
    String(encerramento.tempo_quantidade || quantidadePadraoEncerramento)
  );

  setEncerrarInatividadeUnidade(unidadeEncerramento);

  setEncerrarInatividadeMensagem(
    String(
      encerramento.mensagem ||
        "Como não tivemos retorno, este atendimento será encerrado. Caso precise de ajuda, envie uma nova mensagem."
    )
  );

  setNovoGatilhoValor("");
  setNovoGatilhoCondicao("contem");

  if (fluxoParaEditar.fluxo_padrao) {
    setGatilhosFluxo([]);
  } else {
    carregarGatilhosFluxo(fluxoParaEditar.id);
  }
}

async function salvarEdicaoFluxo() {
  const fluxoParaEditar = obterFluxoAlvoEdicao();

  if (!fluxoParaEditar) return;

  const quantidadeInformada = Number(encerrarInatividadeQuantidade || 0);

  const segundosInatividade =
    encerrarInatividadeUnidade === "horas"
      ? quantidadeInformada * 60 * 60
      : quantidadeInformada * 60;

  if (!Number.isFinite(segundosInatividade) || quantidadeInformada <= 0) {
    setErroEdicaoFluxo("Informe um tempo válido para o encerramento por inatividade.");
    return;
  }

  if (segundosInatividade < 5 * 60) {
    setErroEdicaoFluxo("O tempo mínimo para encerramento por inatividade é de 5 minutos.");
    return;
  }

  if (segundosInatividade > 23 * 60 * 60) {
    setErroEdicaoFluxo("O tempo máximo para encerramento por inatividade é de 23 horas.");
    return;
  }

  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxoParaEditar.id,
        nome: nomeFluxoEdicao,
        descricao: descricaoFluxoEdicao,
        fluxo_padrao: fluxoPadraoEdicao,
        configuracao_json: {
          ...(fluxoParaEditar.configuracao_json || {}),
          encerramento_inatividade: {
            ativo: true,
            tempo_quantidade: quantidadeInformada,
            tempo_unidade: encerrarInatividadeUnidade,
            mensagem: encerrarInatividadeMensagem.trim(),
          },
        },
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao editar fluxo.");
    }

    setSucesso("Fluxo atualizado com sucesso.");
    setEditandoFluxo(false);
    setFluxoEmEdicao(null);
    setFluxoSelecionado(json.fluxo);
    await carregarFluxos();
  } catch (error: any) {
    setErroEdicaoFluxo(error?.message || "Erro ao editar fluxo.");
  }
}

function obterLimitesInatividade(unidade: "minutos" | "horas") {
  if (unidade === "horas") {
    return {
      min: 1,
      max: 23,
    };
  }

  return {
    min: 5,
    max: 1380, // 23 horas em minutos
  };
}

function limitarQuantidadeInatividade(
  valor: string,
  unidade: "minutos" | "horas"
) {
  const somenteNumeros = valor.replace(/\D/g, "");

  if (!somenteNumeros) {
    return "";
  }

  const numero = Number(somenteNumeros);
  const limites = obterLimitesInatividade(unidade);

  if (!Number.isFinite(numero)) {
    return "";
  }

  if (numero > limites.max) {
    return String(limites.max);
  }

  return String(numero);
}

function corrigirQuantidadeMinimaInatividade(
  valor: string,
  unidade: "minutos" | "horas"
) {
  const numero = Number(valor || 0);
  const limites = obterLimitesInatividade(unidade);

  if (!Number.isFinite(numero) || numero < limites.min) {
    return String(limites.min);
  }

  if (numero > limites.max) {
    return String(limites.max);
  }

  return String(numero);
}

function mensagemErroFluxo(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function duplicarFluxo(fluxo: Fluxo) {
  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxo.id,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao duplicar fluxo.");
    }

    setSucesso("Fluxo duplicado com sucesso.");
    await carregarFluxos();
    setFluxoSelecionado(json.fluxo);
  } catch (error: any) {
    setErro(error?.message || "Erro ao duplicar fluxo.");
  }
}

async function gerarCodigoCompartilhamento(fluxo: Fluxo) {
  try {
    setCarregandoCodigoCompartilhamento(true);
    setErroCompartilhamento("");
    setCodigoCompartilhamento("");

    const res = await fetch("/api/automacoes/compartilhamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fluxo_id: fluxo.id,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao gerar codigo.");
    }

    setCodigoCompartilhamento(json.codigo || "");
  } catch (error: unknown) {
    setErroCompartilhamento(mensagemErroFluxo(error, "Erro ao gerar codigo."));
  } finally {
    setCarregandoCodigoCompartilhamento(false);
  }
}

function abrirCompartilhamentoFluxo(fluxo: Fluxo) {
  setFluxoParaCompartilhar(fluxo);
  setModalCompartilharAberto(true);
  gerarCodigoCompartilhamento(fluxo);
}

async function copiarCodigoCompartilhamento() {
  try {
    if (!codigoCompartilhamento) return;

    await navigator.clipboard.writeText(codigoCompartilhamento);
    setSucesso("Codigo copiado com sucesso.");
  } catch {
    setErroCompartilhamento(
      "Nao foi possivel copiar automaticamente. Selecione e copie o codigo."
    );
  }
}

async function importarFluxoCompartilhado() {
  try {
    setErroImportacao("");
    setErro("");
    setSucesso("");

    const codigo = codigoImportacao.trim();

    if (!codigo) {
      setErroImportacao("Cole o codigo do fluxo.");
      return;
    }

    setImportandoFluxo(true);

    const res = await fetch("/api/automacoes/compartilhamentos", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ codigo }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao importar fluxo.");
    }

    setCodigoImportacao("");
    setModalImportarAberto(false);
    setSucesso("Fluxo importado como rascunho.");
    await carregarFluxos();
    setFluxoSelecionado(json.fluxo);
  } catch (error: unknown) {
    setErroImportacao(mensagemErroFluxo(error, "Erro ao importar fluxo."));
  } finally {
    setImportandoFluxo(false);
  }
}

  async function salvarEstrutura() {
    if (!fluxoSelecionado) {
      setErro("Selecione um fluxo primeiro.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const nosParaSalvar = nodes.map((node) => {
      const tipoNo = String(node.data?.tipo_no || "");

        return {
          id: node.id,
          tipo_no: tipoNo,
          titulo: node.data?.titulo,
          descricao: node.data?.descricao || null,
          posicao_x: node.position.x,
          posicao_y: node.position.y,
          configuracao_json: node.data?.configuracao_json || {},
          delay_segundos:
            node.data?.tipo_no === "inicio"
              ? null
              : normalizarDelaySegundos(node.data?.delay_segundos as any),
        };
      });

    const conexoesParaSalvar = edges.map((edge, index) => {
    const data = edge.data as
        | {
            condicao_json?: Record<string, any>;
            rotulo?: string;
            usar_ia?: boolean;
            descricao_ia?: string;
        }
        | undefined;

    return {
        id: edge.id,
        no_origem_id: edge.source,
        no_destino_id: edge.target,
        rotulo:
        data?.rotulo ||
        (typeof edge.label === "string" ? edge.label : null),
        ordem: index + 1,
        condicao_json: data?.condicao_json || {},
        usar_ia: data?.usar_ia === true,
        descricao_ia: data?.descricao_ia || null,
    };
    });

      const res = await fetch(
        `/api/automacoes/${fluxoSelecionado.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nos: nosParaSalvar,
            conexoes: conexoesParaSalvar,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar estrutura.");
      }

      setSucesso("Fluxo salvo com sucesso.");
      await carregarEstrutura(fluxoSelecionado.id);
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar estrutura.");
    } finally {
      setSalvando(false);
    }
  }

function abrirModalArquivarFluxo(fluxo: Fluxo) {
  setFluxoParaArquivar(fluxo);
  setModalArquivarAberto(true);
}

async function confirmarArquivarFluxo() {
  if (!fluxoParaArquivar) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxoParaArquivar.id,
        definitivo: false,
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao arquivar fluxo.");
    }

    setSucesso("Fluxo arquivado com sucesso.");
    setModalArquivarAberto(false);

    if (fluxoSelecionado?.id === fluxoParaArquivar.id) {
      setFluxoSelecionado(null);
      setNodes([]);
      setEdges([]);
      setEditandoNodeId(null);
      setEditandoEdgeId(null);
    }

    setFluxoParaArquivar(null);
    await carregarFluxos();
  } catch (error: any) {
    setErro(error?.message || "Erro ao arquivar fluxo.");
  }
}


async function carregarGatilhosFluxo(fluxoId: string) {
  try {
    const res = await fetch(`/api/automacoes/${fluxoId}/gatilhos`, {
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao carregar gatilhos.");
    }

    setGatilhosFluxo(json.gatilhos || []);
  } catch (error: any) {
    setErro(error?.message || "Erro ao carregar gatilhos.");
  }
}

async function criarGatilhoFluxo() {
  const fluxoParaEditar = obterFluxoAlvoEdicao();

  if (!fluxoParaEditar) return;

  try {
    setErro("");
    setSucesso("");

    const valor = novoGatilhoValor.trim();

    if (!valor) {
      setErro("Informe a palavra-chave do gatilho.");
      return;
    }

    const res = await fetch(
      `/api/automacoes/${fluxoParaEditar.id}/gatilhos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo_gatilho: "palavra_chave",
          valor,
          condicao: novoGatilhoCondicao,
        }),
      }
    );

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao criar gatilho.");
    }

    setNovoGatilhoValor("");
    setNovoGatilhoCondicao("contem");
    setSucesso("Gatilho criado com sucesso.");
    await carregarGatilhosFluxo(fluxoParaEditar.id);
  } catch (error: any) {
    setErro(error?.message || "Erro ao criar gatilho.");
  }
}

async function removerGatilhoFluxo(gatilhoId: string) {
  const fluxoParaEditar = obterFluxoAlvoEdicao();

  if (!fluxoParaEditar) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch(
      `/api/automacoes/${fluxoParaEditar.id}/gatilhos`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: gatilhoId,
        }),
      }
    );

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao remover gatilho.");
    }

    setSucesso("Gatilho removido com sucesso.");
    await carregarGatilhosFluxo(fluxoParaEditar.id);
  } catch (error: any) {
    setErro(error?.message || "Erro ao remover gatilho.");
  }
}

async function alternarGatilhoFluxo(gatilho: GatilhoFluxo) {
  const fluxoParaEditar = obterFluxoAlvoEdicao();

  if (!fluxoParaEditar) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch(
      `/api/automacoes/${fluxoParaEditar.id}/gatilhos`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: gatilho.id,
          ativo: !gatilho.ativo,
        }),
      }
    );

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao atualizar gatilho.");
    }

    await carregarGatilhosFluxo(fluxoParaEditar.id);
  } catch (error: any) {
    setErro(error?.message || "Erro ao atualizar gatilho.");
  }
}


function adicionarGatilhoNovoFluxo() {
  const valor = novoGatilhoValor.trim().toLowerCase();

  if (!valor) {
    setErro("Informe a palavra-chave do gatilho.");
    return;
  }

  const jaExiste = gatilhosNovoFluxo.some(
    (gatilho) =>
      gatilho.valor === valor && gatilho.condicao === novoGatilhoCondicao
  );

  if (jaExiste) {
    setErro("Esse gatilho já foi adicionado.");
    return;
  }

    setGatilhosNovoFluxo((atuais) => [
    ...atuais,
    {
        valor,
        condicao: novoGatilhoCondicao,
        ativo: true,
    },
    ]);

  setNovoGatilhoValor("");
  setNovoGatilhoCondicao("contem");
}


async function restaurarFluxo(fluxo: Fluxo) {
  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxo.id,
        status: "rascunho",
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao restaurar fluxo.");
    }

    setSucesso("Fluxo restaurado como rascunho.");
    await carregarFluxos();
    setFluxoSelecionado(json.fluxo);
  } catch (error: any) {
    setErro(error?.message || "Erro ao restaurar fluxo.");
  }
}
  

async function apagarFluxoDefinitivo(fluxo: Fluxo) {
  const confirmar = window.confirm(
    `Tem certeza que deseja apagar DEFINITIVAMENTE o fluxo "${fluxo.nome}"?\n\nEssa ação não poderá ser desfeita.`
  );

  if (!confirmar) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxo.id,
        definitivo: true,
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao apagar definitivamente.");
    }

    setSucesso("Fluxo apagado definitivamente.");

    if (fluxoSelecionado?.id === fluxo.id) {
      setFluxoSelecionado(null);
      setNodes([]);
      setEdges([]);
      setEditandoNodeId(null);
      setEditandoEdgeId(null);
    }

    await carregarFluxos();
  } catch (error: any) {
    setErro(error?.message || "Erro ao apagar definitivamente.");
  }
}

function abrirModalApagarDefinitivo(fluxo: Fluxo) {
  setFluxoParaApagarDefinitivo(fluxo);
  setModalApagarDefinitivoAberto(true);
}

async function confirmarApagarDefinitivo() {
  if (!fluxoParaApagarDefinitivo) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxoParaApagarDefinitivo.id,
        definitivo: true,
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao apagar definitivamente.");
    }

    setSucesso("Fluxo apagado definitivamente.");
    setModalApagarDefinitivoAberto(false);

    if (fluxoSelecionado?.id === fluxoParaApagarDefinitivo.id) {
      setFluxoSelecionado(null);
      setNodes([]);
      setEdges([]);
      setEditandoNodeId(null);
      setEditandoEdgeId(null);
    }

    setFluxoParaApagarDefinitivo(null);
    await carregarFluxos();
  } catch (error: any) {
    setErro(error?.message || "Erro ao apagar definitivamente.");
  }
}

function validarFluxoAntesDeAtivar(params?: {
  fluxo?: Fluxo | null;
  nodesValidacao?: Node[];
  edgesValidacao?: Edge[];
}) {
  const fluxoValidacao = params?.fluxo ?? fluxoSelecionado;
  const nodesValidacao = params?.nodesValidacao ?? nodes;
  const edgesValidacao = params?.edgesValidacao ?? edges;

  if (!fluxoValidacao) {
    return "Selecione um fluxo.";
  }

  const inicio = nodesValidacao.find((node) => node.data?.tipo_no === "inicio");

  if (!inicio) {
    return "Adicione um bloco de início antes de ativar o fluxo.";
  }

  const conexaoSaindoDoInicio = edgesValidacao.some((edge) => edge.source === inicio.id);

  if (!conexaoSaindoDoInicio) {
    return "O bloco de início precisa estar conectado a outro bloco.";
  }

  const temBlocoFinal = nodesValidacao.some(
    (node) =>
      node.data?.tipo_no === "encerrar" ||
      node.data?.tipo_no === "transferir_setor"
  );

  if (!temBlocoFinal) {
    return "Adicione pelo menos um bloco final: Encerrar ou Transferir.";
  }

  for (const node of nodesValidacao) {
    const tipoNo = String(node.data?.tipo_no || "");
    const config = (node.data?.configuracao_json || {}) as Record<string, any>;

    if (tipoNo === "enviar_texto" && !String(config.mensagem || "").trim()) {
      return `O bloco "${node.data?.titulo}" precisa ter uma mensagem.`;
    }

    if (tipoNo === "encerrar") {
      const resultadoFluxo = String(config.resultado_fluxo || "positivo");
      const tipoValorConversao = String(config.valor_conversao_tipo || "sem_valor");

      if (!resultadoEncerramentoValido(resultadoFluxo)) {
        return `O bloco "${node.data?.titulo}" precisa ter um resultado valido.`;
      }

      if (resultadoFluxo === "positivo") {
        if (!tipoValorConversaoValido(tipoValorConversao)) {
          return `O bloco "${node.data?.titulo}" precisa ter um tipo de valor valido.`;
        }

        if (
          tipoValorConversao === "valor_fixo" &&
          normalizarValorMonetario(config.valor_conversao) == null
        ) {
          return `O bloco "${node.data?.titulo}" precisa ter um valor fixo valido.`;
        }

        if (
          tipoValorConversao === "variavel" &&
          !normalizarVariavelFluxo(String(config.valor_conversao_variavel || ""))
        ) {
          return `O bloco "${node.data?.titulo}" precisa informar a variavel do valor.`;
        }
      }
    }

    if (tipoNo === "pergunta_opcoes") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter uma pergunta.`;
      }

      if (!Array.isArray(config.opcoes) || config.opcoes.length === 0) {
        return `O bloco "${node.data?.titulo}" precisa ter pelo menos uma opção.`;
      }
    }

    if (tipoNo === "enviar_botoes") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter uma mensagem.`;
      }

      if (!Array.isArray(config.botoes) || config.botoes.length === 0) {
        return `O bloco "${node.data?.titulo}" precisa ter pelo menos um botão.`;
      }

      if (config.botoes.length > 3) {
        return `O bloco "${node.data?.titulo}" pode ter no máximo 3 botões.`;
      }

      const botaoInvalido = config.botoes.some(
        (botao: any) =>
          !String(botao.id || "").trim() ||
          !String(botao.titulo || "").trim() ||
          String(botao.titulo || "").length > 20
      );

      if (botaoInvalido) {
        return `O bloco "${node.data?.titulo}" tem botão inválido. Verifique ID e título.`;
      }
    }

    if (tipoNo === "botao_redirect") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter uma mensagem.`;
      }

      const textoBotao = String(config.botao_texto || "").trim();

      if (!textoBotao || textoBotao.length > 20) {
        return `O bloco "${node.data?.titulo}" precisa ter texto do botão com até 20 caracteres.`;
      }

      if (!urlHttpValida(config.url)) {
        return `O bloco "${node.data?.titulo}" precisa ter uma URL começando com http:// ou https://.`;
      }
    }

    if (
      tipoNo === "avaliacao" &&
      config.solicitar_comentario === true &&
      !String(config.mensagem_comentario || "").trim()
    ) {
      return `O bloco "${node.data?.titulo}" precisa ter uma mensagem para solicitar comentário.`;
    }

    if (tipoNo === "avaliacao") {
      const notaMinima = Number(config.nota_minima);
      const notaMaxima = Number(config.nota_maxima);

      if (notaMinima >= notaMaxima) {
        return `O bloco "${node.data?.titulo}" precisa ter uma nota máxima maior que a mínima.`;
      }
    }

    if (tipoNo === "capturar_resposta") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter uma pergunta.`;
      }

      if (!String(config.variavel || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa informar a variável onde a resposta será salva.`;
      }

      if (!String(config.tipo_captura || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter um tipo de captura.`;
      }
    }

    if (tipoNo === "agendar_disparo") {
      if (!String(config.template_id || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter um template WhatsApp.`;
      }

      const templateSelecionado = templatesWhatsapp.find(
        (template) => template.id === String(config.template_id || "").trim()
      );

      if (templateWhatsappTemCabecalhoMidia(templateSelecionado)) {
        return `O bloco "${node.data?.titulo}" usa um template com cabecalho de midia. Use um template apenas com texto para disparos agendados.`;
      }

      if (templateSelecionado) {
        const totalVariaveisTemplate =
          contarVariaveisTemplateWhatsapp(templateSelecionado);
        const totalVariaveisConfiguradas =
          contarVariaveisObrigatoriasPreenchidas(
            Array.isArray(config.variaveis) ? config.variaveis : [],
            totalVariaveisTemplate
          );

        if (totalVariaveisTemplate > 3) {
          return `O bloco "${node.data?.titulo}" usa um template com mais de 3 variaveis.`;
        }

        if (totalVariaveisConfiguradas < totalVariaveisTemplate) {
          return `O bloco "${node.data?.titulo}" precisa informar ${totalVariaveisTemplate} variavel(is) do template WhatsApp.`;
        }
      }

      const quantidade = Number(config.tempo_quantidade || 0);

      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return `O bloco "${node.data?.titulo}" precisa ter um tempo válido para agendar o disparo.`;
      }

      if (!["horas", "dias"].includes(String(config.tempo_unidade || ""))) {
        return `O bloco "${node.data?.titulo}" precisa ter uma unidade válida.`;
      }
    }

    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.agenda_id || "").trim()
    ) {
      return `O bloco "${node.data?.titulo}" precisa ter uma agenda.`;
    }

    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.mensagem || "").trim()
    ) {
      return `O bloco "${node.data?.titulo}" precisa ter uma mensagem para pedir o dia.`;
    }

    if (tipoNo === "agenda_criar_agendamento") {
      if (config.lembrete_agendamento_ativo === true) {
        const quantidade = Number(config.lembrete_agendamento_quantidade || 0);

        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          return `O bloco "${node.data?.titulo}" precisa ter uma antecedencia valida para o lembrete.`;
        }

        if (
          !["minutos", "horas", "dias"].includes(
            String(config.lembrete_agendamento_unidade || "")
          )
        ) {
          return `O bloco "${node.data?.titulo}" precisa ter uma unidade valida para o lembrete.`;
        }

        if (
          config.lembrete_agendamento_whatsapp !== true &&
          config.lembrete_agendamento_email !== true
        ) {
          return `O bloco "${node.data?.titulo}" precisa ter pelo menos um canal de lembrete.`;
        }

        if (
          config.lembrete_agendamento_whatsapp === true &&
          !String(config.lembrete_agendamento_template_id || "").trim()
        ) {
          return `O bloco "${node.data?.titulo}" precisa ter um template WhatsApp para o lembrete.`;
        }

        if (config.lembrete_agendamento_whatsapp === true) {
          const templateSelecionado = templatesWhatsapp.find(
            (template) =>
              template.id ===
              String(config.lembrete_agendamento_template_id || "").trim()
          );

          if (templateWhatsappTemCabecalhoMidia(templateSelecionado)) {
            return `O bloco "${node.data?.titulo}" usa um template de lembrete com cabecalho de midia. Use um template apenas com texto.`;
          }

          if (templateSelecionado) {
            const totalVariaveisTemplate =
              contarVariaveisTemplateWhatsapp(templateSelecionado);
            const totalVariaveisConfiguradas =
              contarVariaveisObrigatoriasPreenchidas(
                Array.isArray(config.lembrete_agendamento_variaveis)
                  ? config.lembrete_agendamento_variaveis
                  : [],
                totalVariaveisTemplate
              );

            if (totalVariaveisTemplate > 3) {
              return `O bloco "${node.data?.titulo}" usa um template de lembrete com mais de 3 variaveis.`;
            }

            if (totalVariaveisConfiguradas < totalVariaveisTemplate) {
              return `O bloco "${node.data?.titulo}" precisa informar ${totalVariaveisTemplate} variavel(is) do template de lembrete.`;
            }
          }
        }
      }
    }

    if (tipoNo === "interpretar_arquivo_ia") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter uma mensagem solicitando o arquivo.`;
      }

      if (!String(config.instrucao_ia || "").trim()) {
        return `O bloco "${node.data?.titulo}" precisa ter uma instrução para IA.`;
      }
    }

    if (
      tipoNo === "transferir_setor" &&
      !String(config.setor_id || "").trim()
    ) {
      return `O bloco "${node.data?.titulo}" precisa ter um setor destino.`;
    }

    if (
        (
          tipoNo === "enviar_imagem" ||
          tipoNo === "enviar_video" ||
          tipoNo === "enviar_audio"
        ) &&
      !String(config.midia_url || "").trim()
    ) {
      return `O bloco "${node.data?.titulo}" precisa ter uma URL de mídia.`;
    }
  }

  return "";
}


async function alterarStatusFluxo(
  fluxo: Fluxo,
  novoStatus: "ativo" | "rascunho" | "pausado"
) {
  try {
    setErro("");
    setSucesso("");

    if (novoStatus === "ativo") {
      if (headerUser.assinatura?.status === "bloqueada") {
        window.dispatchEvent(new Event("assinatura:abrir-renovacao"));
        setErro("Plano bloqueado. Renove a assinatura para ativar fluxos.");
        return;
      }

      const erroValidacao = validarFluxoAntesDeAtivar();

      if (erroValidacao) {
        setErro(erroValidacao);
        return;
      }

      await salvarEstrutura();
    }

    const res = await fetch("/api/automacoes", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxo.id,
        status: novoStatus,
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok || !json.ok) {
      if (json.code === "ASSINATURA_BLOQUEADA") {
        window.dispatchEvent(new Event("assinatura:abrir-renovacao"));
      }

      throw new Error(json.error || "Erro ao alterar status do fluxo.");
    }

    setSucesso(
      novoStatus === "ativo"
        ? "Fluxo ativado com sucesso."
        : "Fluxo pausado com sucesso."
    );

    setFluxoSelecionado(json.fluxo);
    await carregarFluxos();
  } catch (error: any) {
    setErro(error?.message || "Erro ao alterar status do fluxo.");
  }
}

  function badgeClass(status: string) {
    if (status === "ativo") return `${styles.badge} ${styles.badgeGreen}`;
    if (status === "pausado") return `${styles.badge} ${styles.badgeRed}`;
    if (status === "arquivado") return `${styles.badge} ${styles.badgeYellow}`;
    return `${styles.badge} ${styles.badgeGray}`;
  }

function removerNode(nodeId: string) {
  const node = nodes.find((n) => n.id === nodeId);

  if (!node) {
    return;
  }

  if (node.data?.tipo_no === "inicio") {
    setErro("O bloco de início não pode ser removido.");
    return;
  }

  setNodes((nodesAtuais) => nodesAtuais.filter((n) => n.id !== nodeId));

  setEdges((edgesAtuais) =>
    edgesAtuais.filter((e) => e.source !== nodeId && e.target !== nodeId)
  );

  setEditandoNodeId(null);
  setEditandoEdgeId(null);
  setSucesso("Bloco removido. Clique em Salvar fluxo para gravar no banco.");
}

function removerConexao(edgeId: string) {
  setEdges((edgesAtuais) => edgesAtuais.filter((edge) => edge.id !== edgeId));

  setEditandoEdgeId(null);
  setEditandoNodeId(null);
  setSucesso("Conexão removida. Clique em Salvar fluxo para gravar no banco.");
}

function fecharPainelEdicao() {
  setEditandoNodeId(null);
  setEditandoEdgeId(null);
  setConfirmandoExclusaoNo(false);
  setConfirmandoExclusaoConexao(false);
  marcarNodeSelecionado(null);

  setEdges((atuais) =>
    atuais.map((edge) => ({
      ...edge,
      selected: false,
      style: {
        ...(edge.style || {}),
        stroke: "#cbd5e1",
        strokeWidth: 2,
        strokeDasharray: "6 6",
      },
    }))
  );
}

useEffect(() => {
  function handleClick() {
    setMenuFluxo(null);
  }
  window.addEventListener("click", handleClick);
  return () => window.removeEventListener("click", handleClick);
}, []);

useEffect(() => {
  const deveCalcularCustoDisparo =
    tipoNodeEdicao === "agendar_disparo" ||
    (tipoNodeEdicao === "agenda_criar_agendamento" &&
      agendaLembreteAtivoNode &&
      agendaLembreteWhatsappNode);

  if (!deveCalcularCustoDisparo) {
    setPreviewCustoAgendarDisparo(null);
    return;
  }

  const templateSelecionado =
    tipoNodeEdicao === "agendar_disparo"
      ? templateAgendarDisparoSelecionado
      : templateAgendaLembreteSelecionado;

  const categoria = String(
    templateSelecionado?.categoria || ""
  ).toLowerCase();

  if (!categoria) {
    setPreviewCustoAgendarDisparo(null);
    return;
  }

  calcularPreviewCustoAgendarDisparo(categoria);
}, [
  tipoNodeEdicao,
  agendaLembreteAtivoNode,
  agendaLembreteWhatsappNode,
  templateAgendarDisparoSelecionado?.id,
  templateAgendarDisparoSelecionado?.categoria,
  templateAgendaLembreteSelecionado?.id,
  templateAgendaLembreteSelecionado?.categoria,
]);

const nodesRenderizados = useMemo(
  () =>
    nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        arquivo_ia_sem_conexao_erro: nodeArquivoIaSemConexaoErro(node, edges),
      },
    })),
  [nodes, edges]
);

function abrirTooltipAlertaFluxo(elemento: HTMLElement) {
  const rect = elemento.getBoundingClientRect();
  const larguraTooltip = 280;
  const margem = 12;
  const x = Math.min(
    rect.right + 12,
    window.innerWidth - larguraTooltip - margem
  );
  const y = Math.min(
    Math.max(margem, rect.top - 8),
    window.innerHeight - 140
  );

  setTooltipAlertaFluxo({
    texto: AVISO_FLUXO_CONEXAO_ERRO_ARQUIVO_IA,
    x,
    y,
  });
}

  return (
    <>
      <Header
        title="Fluxos de automação"
        subtitle="Monte fluxos para automatizar atendimentos, direcionar clientes e escalar suas conversas no WhatsApp."
      />
    <main className={styles.pageContent}>
      <aside className={styles.sidebarFluxos}>
        <div className={styles.sidebarHeader}>
          <p className={styles.eyebrow}>Automações</p>
          <h1 className={styles.sidebarTitle}>Fluxos</h1>
          <p className={styles.sidebarSubtitle}>
            Selecione um fluxo ou crie um novo.
          </p>
        </div>

        <div className={styles.sidebarFilters}>
          <input
            className={styles.input}
            placeholder="Buscar fluxo..."
            value={buscaFluxo}
            onChange={(e) => setBuscaFluxo(e.target.value)}
          />

          <div className={styles.filterRow}>
            <select
              className={styles.input}
              value={filtroStatusFluxo}
              onChange={(e) =>
                setFiltroStatusFluxo(
                  e.target.value as
                    | "todos"
                    | "rascunho"
                    | "ativo"
                    | "pausado"
                    | "arquivado"
                )
              }
            >
              <option value="todos">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="rascunho">Rascunhos</option>
              <option value="pausado">Pausados</option>
              <option value="arquivado">Arquivados</option>
            </select>

            <button
              type="button"
              className={styles.newFlowButton}
              title="Criar fluxo"
              onClick={() => {
                setErroCriacaoFluxo("");
                setNovoFluxoNome("");
                setDescricaoNovoFluxo("");
                setNovoFluxoPadrao(false);
                setGatilhosNovoFluxo([]);
                setNovoGatilhoValor("");
                setNovoGatilhoCondicao("contem");
                resetarEncerramentoInatividadePadrao();
                setAbrirCriacao(true);
              }}
            >
              +
            </button>

            <button
              type="button"
              className={styles.importFlowButton}
              title="Importar por codigo"
              onClick={() => {
                setErroImportacao("");
                setCodigoImportacao("");
                setModalImportarAberto(true);
              }}
            >
              <CopyPlus size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className={styles.flowList}>
          {carregandoFluxos ? (
            <div className={styles.emptyMini}>Carregando...</div>
          ) : fluxos.length === 0 ? (
            <div className={styles.emptyMini}>Nenhum fluxo cadastrado.</div>
          ) : (
            fluxos
              .filter((f) =>
                f.nome.toLowerCase().includes(buscaFluxo.toLowerCase())
              )
              .filter((f) =>
                filtroStatusFluxo === "todos" ? true : f.status === filtroStatusFluxo
              )
              .sort((a, b) => {
                const ordemStatus = {
                  rascunho: 1,
                  ativo: 2,
                  pausado: 3,
                  arquivado: 4,
                };

                const statusDiff =
                  ordemStatus[a.status] - ordemStatus[b.status];

                if (statusDiff !== 0) return statusDiff;

                // 🔥 Ordenação por data (mais recente primeiro)
                return (
                  new Date(b.created_at || 0).getTime() -
                  new Date(a.created_at || 0).getTime()
                );
              })
              .map((fluxo) => (
              <div
                key={fluxo.id}
                role="button"
                tabIndex={0}
                className={
                  fluxoSelecionado?.id === fluxo.id
                    ? styles.flowItemActive
                    : styles.flowItem
                }
                onClick={() => {
                  setFluxoSelecionado(fluxo);
                  setMenuFluxoAbertoId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setFluxoSelecionado(fluxo);
                    setMenuFluxoAbertoId(null);
                  }
                }}
              >
                <div className={styles.flowItemTop}>
                  <div className={styles.flowItemInfo}>
                    <span className={styles.flowItemTitle}>{fluxo.nome}</span>

                    <div className={styles.flowBadges}>
                      {fluxo.fluxo_padrao && (
                        <span className={`${styles.badge} ${styles.badgeBlue}`}>
                          padrão
                        </span>
                      )}

                      <span className={badgeClass(fluxo.status)}>
                        {fluxo.status}
                      </span>

                      {Number(
                        fluxo.alertas_configuracao
                          ?.interpretar_arquivo_ia_sem_conexao_erro || 0
                      ) > 0 && (
                        <span
                          className={`${styles.infoAlertIcon} ${styles.infoAlertIconFlow}`}
                          aria-label={AVISO_FLUXO_CONEXAO_ERRO_ARQUIVO_IA}
                          role="img"
                          tabIndex={0}
                          onMouseEnter={(event) =>
                            abrirTooltipAlertaFluxo(event.currentTarget)
                          }
                          onMouseLeave={() => setTooltipAlertaFluxo(null)}
                          onFocus={(event) =>
                            abrirTooltipAlertaFluxo(event.currentTarget)
                          }
                          onBlur={() => setTooltipAlertaFluxo(null)}
                        >
                          i
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.flowMenuWrapper}>
                    <button
                      type="button"
                      className={styles.flowMenuButton}
                      onClick={(e) => {
                        e.stopPropagation();

                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

                        setMenuFluxo((menuAtual) => {
                          if (menuAtual?.fluxo?.id === fluxo.id) {
                            return null;
                          }

                          return {
                            fluxo,
                            x: rect.right,
                            y: rect.bottom,
                            buttonTop: rect.top,
                            buttonBottom: rect.bottom,
                          };
                        });
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                </div>

              </div>
            ))
          )}
        </div>
      </aside>

      <section className={styles.editorPanel}>
        <header className={styles.editorHeader}>
          <div>
            <p className={styles.eyebrow}>Construtor visual</p>
            <h2 className={styles.editorTitle}>
              {fluxoSelecionado?.nome || "Selecione um fluxo"}
            </h2>
            <p className={styles.editorSubtitle}>
              Adicione blocos, arraste no painel e conecte um bloco no outro.
            </p>
          </div>

          <div className={styles.headerActions}>
            {fluxoSelecionado?.status === "arquivado" ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => restaurarFluxo(fluxoSelecionado)}
                >
                  Restaurar
                </button>

                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => abrirModalApagarDefinitivo(fluxoSelecionado)}
                >
                  Apagar definitivo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => adicionarNo("enviar_texto")}
                  disabled={!fluxoSelecionado}
                >
                  + Bloco
                </button>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => abrirEdicaoFluxo()}
                  disabled={!fluxoSelecionado}
                >
                  Editar fluxo
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={salvarEstrutura}
                  disabled={!fluxoSelecionado || salvando}
                >
                  {salvando ? "Salvando..." : "Salvar fluxo"}
                </button>

                {fluxo &&
                  fluxo.status !== "ativo" &&
                  fluxo.status !== "arquivado" && (
                    <button
                      type="button"
                      className={styles.primaryButtonActv}
                      onClick={() =>
                        alterarStatusFluxo(fluxo, "ativo")
                      }
                    >
                      Ativar fluxo
                    </button>
                )}

                <div className={styles.headerMenuWrapper}>
                  <button
                    type="button"
                    className={styles.headerMenuButton}
                    disabled={!fluxoSelecionado}
                    onClick={() => setMenuHeaderAberto((atual) => !atual)}
                  >
                    ⋮
                  </button>

                  {menuHeaderAberto && fluxoSelecionado && (
                    <div className={styles.headerDropdownMenu}>
                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("enviar_texto");
                        }}
                      >
                        + Mensagem
                      </button>
                      
                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("pergunta_opcoes");
                        }}
                      >
                        + Pergunta
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("capturar_resposta");
                        }}
                      >
                        + Capturar resposta
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("transferir_setor");
                        }}
                      >
                        + Transferência
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("encerrar");
                        }}
                      >
                        + Encerramento
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("enviar_imagem");
                        }}
                      >
                        + Imagem
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("enviar_video");
                        }}
                      >
                        + Vídeo
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("enviar_audio");
                        }}
                      >
                        + Áudio
                      </button>
                      
                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("enviar_botoes");
                        }}
                      >
                        + Pergunta com botões
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("botao_redirect");
                        }}
                      >
                        + Botão redirect
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("agendar_disparo");
                        }}
                      >
                        + Agendar disparo
                      </button>
                      
                      <div className={styles.headerSubmenuWrapper}>
                        <button
                          type="button"
                          className={`${styles.headerDropdownItem} ${styles.headerSubmenuTrigger}`}
                        >
                          <span>+ Agendar Dia/hora</span>
                          <span className={styles.headerSubmenuArrow}>‹</span>
                        </button>

                        <div className={styles.headerSubmenuLeft}>
                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              adicionarNo("agenda_buscar_agendamento");
                            }}
                          >
                            + Buscar agendamento
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              adicionarNo("agenda_escolher_horario");
                            }}
                          >
                            + Escolher horário
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              adicionarNo("agenda_criar_agendamento");
                            }}
                          >
                            + Criar agendamento
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              adicionarNo("agenda_remarcar_agendamento");
                            }}
                          >
                            + Remarcar agendamento
                          </button>

                          <button
                            type="button"
                            className={styles.headerDropdownItem}
                            onClick={() => {
                              setMenuHeaderAberto(false);
                              adicionarNo("agenda_cancelar_agendamento");
                            }}
                          >
                            + Cancelar agendamento
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("avaliacao");
                        }}
                      >
                        + Avaliação
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          adicionarNo("interpretar_arquivo_ia");
                        }}
                      >
                        + Interpretar arquivo IA
                      </button>

                      <div className={styles.headerDropdownDivider} />

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          duplicarFluxo(fluxoSelecionado);
                        }}
                      >
                        Clonar fluxo
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          abrirCompartilhamentoFluxo(fluxoSelecionado);
                        }}
                      >
                        Compartilhar fluxo
                      </button>

                      <button
                        type="button"
                        className={styles.headerDropdownItem}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          alterarStatusFluxo(
                            fluxoSelecionado,
                            fluxoSelecionado.status === "ativo" ? "pausado" : "ativo"
                          );
                        }}
                      >
                        {fluxoSelecionado.status === "ativo"
                          ? "Pausar fluxo"
                          : "Ativar fluxo"}
                      </button>

                      <button
                        type="button"
                        className={`${styles.headerDropdownItem} ${styles.headerDropdownDanger}`}
                        onClick={() => {
                          setMenuHeaderAberto(false);
                          abrirModalArquivarFluxo(fluxoSelecionado);
                        }}
                      >
                        Apagar fluxo
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          </header>

          {fluxoSelecionado?.status === "arquivado" && (
            <div className={styles.archivedNotice}>
              <strong>Fluxo arquivado.</strong>
              <span>
                Este fluxo não está em execução e não pode ser editado. Restaure o fluxo para voltar a usar.
              </span>
            </div>
          )}

          {erro && (
          <div className={styles.alertArea}>
            {erro && <div className={styles.errorAlert}>{erro}</div>}
          </div>
        )}
        <FeedbackToast
          success={sucesso}
          onSuccessDismiss={() => setSucesso("")}
        />

        <div className={styles.editorBody}>
          <div className={styles.canvasArea}>
            {carregandoEstrutura ? (
              <div className={styles.emptyState}>Carregando estrutura...</div>
            ) : (
              <ReactFlow
                nodes={nodesRenderizados}
                edges={edges}
                fitView
                fitViewOptions={{
                  padding: 0.25,
                }}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStart={() => {
                  ignorarCliqueNodeAposArrasteRef.current = true;
                }}
                onNodeDragStop={() => {
                  window.setTimeout(() => {
                    ignorarCliqueNodeAposArrasteRef.current = false;
                  }, 120);
                }}
                onNodeClick={(_, node) => {
                  if (ignorarCliqueNodeAposArrasteRef.current) {
                    return;
                  }

                  abrirEdicaoNo(node);
                }}
                onEdgeClick={(_, edge) => {
                  abrirEdicaoConexao(edge);

                  setEdges((atuais) =>
                    atuais.map((item) => ({
                      ...item,
                      selected: item.id === edge.id,
                      style: {
                        ...(item.style || {}),
                        stroke: item.id === edge.id ? "#0098bab6" : "#cbd5e1",
                        strokeWidth: item.id === edge.id ? 3 : 2,
                        strokeDasharray: "6 6",
                      },
                    }))
                  );
                }}
                nodeTypes={nodeTypes}
                
              >
                <Background />
                <Controls
                  showInteractive={false}
                />
                <MiniMap />
              </ReactFlow>
            )}
          </div>


          {(nodeEditado || edgeEditada) && (
            <aside className={styles.propertiesPanel}>
                <div className={styles.propertiesHeader}>
                    <h3 className={styles.propertiesTitle}>Configuração</h3>

                    <button
                      type="button"
                      className={styles.closePanelButton}
                      onClick={fecharPainelEdicao}
                      >
                      ×
                    </button>
                </div>

                {!nodeEditado && !edgeEditada ? (
                <p className={styles.propertiesEmpty}>
                    Clique em um bloco ou em uma conexão para editar.
                </p>
                ) : nodeEditado ? (
                <div className={styles.propertiesForm}>
                  {tipoNodeEdicao !== "inicio" && (
                    <label className={styles.field}>
                      <span className={styles.label}>Tipo do bloco</span>

                      <select
                        className={styles.input}
                        value={tipoNodeEdicao}
                        onChange={(e) => {
                          const novoTipo = e.target.value;
                          const tipoAnterior = tipoNodeEdicao;

                          setTipoNodeEdicao(novoTipo);

                          if (tituloEhPadraoDoSistema(tituloNode, tipoAnterior)) {
                            setTituloNode(tituloPadraoTipoNo(novoTipo));
                          }

                          if (novoTipo === "encerrar") {
                            setMensagemNode("");
                            setSetorDestino("");
                            setOpcoesNode([]);
                            setEncerrarResultadoNode("positivo");
                            setEncerrarValorTipoNode("sem_valor");
                            setEncerrarValorFixoNode("");
                            setEncerrarValorVariavelNode("");
                          }

                          if (novoTipo === "transferir_setor") {
                            setSetorDestino("");
                            setOpcoesNode([]);
                          }

                          if (novoTipo === "enviar_texto") {
                            setSetorDestino("");
                            setOpcoesNode([]);
                            setBotoesNode([]);
                          }
                          
                          if (novoTipo === "pergunta_opcoes") {
                            setSetorDestino("");
                            setBotoesNode([]);
                          }

                          if (novoTipo === "enviar_botoes") {
                            setSetorDestino("");
                            setOpcoesNode([]);

                            if (botoesNode.length === 0) {
                              setBotoesNode([
                                { id: "sim", titulo: "Sim" },
                                { id: "nao", titulo: "Não" },
                              ]);
                            }
                          }

                          if (novoTipo === "botao_redirect") {
                            setSetorDestino("");
                            setOpcoesNode([]);
                            setBotoesNode([]);
                            setMidiaUrlNode("");

                            if (!redirectBotaoTextoNode.trim()) {
                              setRedirectBotaoTextoNode("Acessar");
                            }

                            if (!redirectUrlNode.trim()) {
                              setRedirectUrlNode("https://");
                            }
                          }

                          if (
                            novoTipo === "enviar_imagem" ||
                            novoTipo === "enviar_video" ||
                            novoTipo === "enviar_audio"
                          ) {
                            setSetorDestino("");
                            setOpcoesNode([]);
                          }

                          if (
                            novoTipo !== "enviar_imagem" &&
                            novoTipo !== "enviar_video" &&
                            novoTipo !== "enviar_audio"
                          ) {
                            setMidiaUrlNode("");
                          }
                          if (novoTipo === "agendar_disparo") {
                            setMensagemNode("");
                            setSetorDestino("");
                            setOpcoesNode([]);
                            setBotoesNode([]);
                            setMidiaUrlNode("");
                          }

                          if (novoTipo.startsWith("agenda_")) {
                            setSetorDestino("");
                            setOpcoesNode([]);
                            setBotoesNode([]);
                            setMidiaUrlNode("");

                            if (novoTipo === "agenda_buscar_agendamento") {
                              setAgendaListarAgendamentosNode(true);
                              setAgendaQuantidadeOpcoesNode("6");
                              setAgendaMensagemListarAgendamentosNode(
                                "Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:"
                              );
                            }

                            if (novoTipo === "agenda_escolher_horario") {
                              setMensagemNode(
                                "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira."
                              );
                              setAgendaMensagemListarHorariosNode(
                                "Para {{agenda_data_nova}} tenho estes horarios. Responda com o numero do horario ou me diga outro dia:"
                              );
                              setAgendaMensagemPreferenciaIndisponivelNode(
                                "Nao tenho horario {{agenda_preferencia_solicitada}} livre em {{agenda_data_nova}}. Tenho estas alternativas:"
                              );
                              setAgendaMensagemDataInvalidaNode(
                                "Essa data ja passou. Para evitar confusao, me envie uma data futura. Se quiser marcar para outro ano, informe o ano completo, por exemplo {{agenda_data_sugestao_ano}}."
                              );
                              setAgendaMensagemSemExpedienteNode(
                                "Nao temos atendimento em {{agenda_data_nova}}. Me diga outro dia para eu verificar os horarios disponiveis."
                              );
                            }

                            if (novoTipo === "agenda_criar_agendamento") {
                              setMensagemNode(
                                "Agendado! Seu horario ficou marcado para {{agenda_data}} as {{agenda_hora}}. Qualquer duvida e so entrar em contato."
                              );
                              setAgendaEnviarEmailNode(true);
                              setAgendaEmailOrigemNode("contato");
                              setAgendaEmailVariavelNode("email");
                            }

                            if (novoTipo === "agenda_remarcar_agendamento") {
                              setMensagemNode(
                                "Remarcado! Seu horario agora ficou para {{agenda_data}} as {{agenda_hora}}."
                              );
                            }

                            if (novoTipo === "agenda_cancelar_agendamento") {
                              setMensagemNode(
                                "Pronto, seu horario de {{agenda_data}} as {{agenda_hora}} foi cancelado. Quando quiser marcar novamente, e so me chamar."
                              );
                              setAgendaStatusAgendamentoNode("cancelado");
                              setAgendaEnviarEmailNode(true);
                              setAgendaEmailOrigemNode("contato");
                              setAgendaEmailVariavelNode("email");
                            }
                          }
                        }}
                      >
                        <option value="enviar_texto">Mensagem</option>
                        <option value="pergunta_opcoes">Pergunta</option>
                        <option value="capturar_resposta">Capturar resposta</option>
                        <option value="transferir_setor">Transferir</option>
                        <option value="encerrar">Encerrar</option>
                        <option value="enviar_imagem">Imagem</option>
                        <option value="enviar_video">Vídeo</option>
                        <option value="enviar_audio">Áudio</option>
                        <option value="enviar_botoes">Pergunta com Botões</option>
                        <option value="botao_redirect">Botão redirect</option>
                        <option value="agendar_disparo">Agendar disparo</option>
                        <option value="agenda_buscar_agendamento">Agenda: Buscar agendamento</option>
                        <option value="agenda_escolher_horario">Agenda: Escolher horário</option>
                        <option value="agenda_criar_agendamento">Agenda: Criar agendamento</option>
                        <option value="agenda_remarcar_agendamento">Agenda: Remarcar agendamento</option>
                        <option value="agenda_cancelar_agendamento">Agenda: Cancelar agendamento</option>
                        <option value="avaliacao">Avaliação</option>
                        <option value="interpretar_arquivo_ia">Interpretar arquivo IA</option>
                      </select>
                    </label>
                  )}

                  <label className={styles.field}>
                    <span className={styles.label}>
                      Título
                    </span>

                    <span className={styles.help}>
                      Esse título é interno e não aparece na conversa.
                    </span>

                    <input
                      className={styles.input}
                      value={tituloNode}
                      onChange={(e) => setTituloNode(e.target.value)}
                    />
                  </label>

                  {[
                    "enviar_texto",
                    "pergunta_opcoes",
                    "enviar_botoes",
                    "botao_redirect",
                    "enviar_imagem",
                    "enviar_video",
                    "enviar_audio",
                    "transferir_setor",
                    "encerrar",
                    "avaliacao",
                    "capturar_resposta",
                    "agenda_buscar_agendamento",
                    "agenda_escolher_horario",
                    "agenda_criar_agendamento",
                    "agenda_remarcar_agendamento",
                    "agenda_cancelar_agendamento",
                    "interpretar_arquivo_ia",
                  ].includes(tipoNodeEdicao) && (
                    <label className={styles.field}>
                      <span className={styles.label}>
                        {tipoNodeEdicao === "pergunta_opcoes"
                          ? "Pergunta"
                          : tipoNodeEdicao === "enviar_botoes"
                          ? "Pergunta dos botões"
                          : tipoNodeEdicao === "botao_redirect"
                          ? "Mensagem do botão"
                          : tipoNodeEdicao === "enviar_imagem"
                          ? "Legenda da imagem"
                          : tipoNodeEdicao === "enviar_video"
                          ? "Legenda do vídeo"
                          : tipoNodeEdicao === "enviar_audio"
                          ? "Legenda do áudio"
                          : tipoNodeEdicao === "transferir_setor"
                          ? "Mensagem antes de transferir"
                          : tipoNodeEdicao === "encerrar"
                          ? "Mensagem de encerramento (opcional)"
                          : tipoNodeEdicao === "avaliacao"
                          ? "Pergunta de avaliação"
                          : tipoNodeEdicao === "agenda_buscar_agendamento"
                          ? "Mensagem quando encontrar"
                          : tipoNodeEdicao === "agenda_escolher_horario"
                          ? "Mensagem para pedir o dia"
                          : tipoNodeEdicao === "agenda_criar_agendamento"
                          ? "Mensagem depois de criar"
                          : tipoNodeEdicao === "agenda_remarcar_agendamento"
                          ? "Mensagem depois de remarcar"
                          : tipoNodeEdicao === "agenda_cancelar_agendamento"
                          ? "Mensagem depois de cancelar"
                          : tipoNodeEdicao === "interpretar_arquivo_ia"
                          ? "Mensagem solicitando o arquivo"
                          : "Mensagem"}
                      </span>

                      <textarea
                        className={styles.textarea}
                        value={mensagemNode}
                        onChange={(e) => setMensagemNode(e.target.value)}
                        placeholder="Digite o conteúdo"
                      />
                      <p className={styles.help}>
                        Use variaveis com duas chaves de cada lado. Exemplo: {"{{variavel}}"} ou {"{{teste}}"}.
                      </p>
                      <p className={styles.help}>
                        {VARIAVEIS_FIXAS_CONTATO_HELP}
                      </p>
                    </label>

                  )}

                  {tipoNodeEdicao === "encerrar" && (
                    <div className={styles.optionsBox}>
                      <label className={styles.field}>
                        <span className={styles.label}>Resultado do fluxo</span>
                        <select
                          className={styles.input}
                          value={encerrarResultadoNode}
                          onChange={(e) => {
                            const resultado = e.target.value;

                            setEncerrarResultadoNode(
                              resultadoEncerramentoValido(resultado)
                                ? resultado
                                : "positivo"
                            );

                            if (resultado !== "positivo") {
                              setEncerrarValorTipoNode("sem_valor");
                              setEncerrarValorFixoNode("");
                              setEncerrarValorVariavelNode("");
                            }
                          }}
                        >
                          <option value="positivo">Positivo</option>
                          <option value="negativo">Negativo</option>
                          <option value="neutro">Neutro</option>
                        </select>
                        <span className={styles.help}>
                          Esse resultado sera usado nos eventos e relatorios do
                          rastreamento.
                        </span>
                      </label>

                      {encerrarResultadoNode === "positivo" && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.label}>
                              Valor da conversao
                            </span>
                            <select
                              className={styles.input}
                              value={encerrarValorTipoNode}
                              onChange={(e) => {
                                const tipoValor = e.target.value;

                                setEncerrarValorTipoNode(
                                  tipoValorConversaoValido(tipoValor)
                                    ? tipoValor
                                    : "sem_valor"
                                );

                                if (tipoValor !== "valor_fixo") {
                                  setEncerrarValorFixoNode("");
                                }

                                if (tipoValor !== "variavel") {
                                  setEncerrarValorVariavelNode("");
                                }
                              }}
                            >
                              <option value="sem_valor">Sem valor</option>
                              <option value="valor_fixo">Valor fixo</option>
                              <option value="variavel">Variavel do fluxo</option>
                            </select>
                          </label>

                          {encerrarValorTipoNode === "valor_fixo" && (
                            <label className={styles.field}>
                              <span className={styles.label}>
                                Valor fixo da conversao
                              </span>
                              <input
                                className={styles.input}
                                value={encerrarValorFixoNode}
                                onChange={(e) =>
                                  setEncerrarValorFixoNode(e.target.value)
                                }
                                placeholder="Ex: 497,00"
                              />
                            </label>
                          )}

                          {encerrarValorTipoNode === "variavel" && (
                            <label className={styles.field}>
                              <span className={styles.label}>
                                Variavel com o valor
                              </span>
                              <input
                                className={styles.input}
                                value={encerrarValorVariavelNode}
                                onChange={(e) =>
                                  setEncerrarValorVariavelNode(e.target.value)
                                }
                                placeholder="Ex: valor_plano"
                              />
                              <span className={styles.help}>
                                Informe o nome da variavel salva no fluxo, sem
                                chaves. Exemplo: valor_plano.
                              </span>
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {tipoNodeEdicao === "capturar_resposta" && (
                    <div className={styles.optionsBox}>
                      <label className={styles.field}>
                        <span className={styles.label}>Tipo de captura</span>
                          <select
                            className={styles.input}
                            value={capturaTipoNode}
                            onChange={(e) => {
                              const novoTipo = e.target.value;
                              const variavelAtual = capturaVariavelNode.trim().toLowerCase();

                              setCapturaTipoNode(novoTipo);

                              const variaveisPadrao = [
                                "resposta",
                                "texto",
                                "nome",
                                "cpf",
                                "cnpj",
                                "email",
                                "telefone",
                                "numero",
                                "data",
                                "cep",
                              ];

                              if (!variavelAtual || variaveisPadrao.includes(variavelAtual)) {
                                setCapturaVariavelNode(novoTipo);
                              }
                            }}
                          >
                          <option value="texto">Texto livre</option>
                          <option value="nome">Nome</option>
                          <option value="cpf">CPF</option>
                          <option value="cnpj">CNPJ</option>
                          <option value="email">Email</option>
                          <option value="telefone">Telefone</option>
                          <option value="numero">Número</option>
                          <option value="data">Data</option>
                          <option value="cep">CEP</option>
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span className={styles.label}>Salvar resposta na variável</span>
                        <input
                          className={styles.input}
                          value={capturaVariavelNode}
                          onChange={(e) => setCapturaVariavelNode(e.target.value)}
                          placeholder="Ex: nome, cpf, email"
                        />
                        <p className={styles.help}>
                          Use variaveis com duas chaves de cada lado. Exemplo: {"{{variavel}}"} ou {"{{teste}}"}.
                        </p>
                        <p className={styles.help}>
                          Nao use os nomes fixos do contato para salvar respostas.
                        </p>
                      </label>
                      
                      <label className={styles.field}>
                        <span className={styles.label}>Mensagem quando inválido</span>
                        <textarea
                          className={styles.textarea}
                          value={capturaMensagemErroNode}
                          onChange={(e) => setCapturaMensagemErroNode(e.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  {tipoNodeEdicao === "avaliacao" && (

                    <div className={styles.optionsBox}>

                      <div className={styles.optionRow}>
                        <label className={styles.field}>
                          <span className={styles.label}>Nota mínima</span>

                          <input
                            type="number"
                            className={styles.input}
                            value={notaMinimaNode}
                            onChange={(e) => setNotaMinimaNode(e.target.value)}
                            min={0}
                          />
                        </label>

                        <label className={styles.field}>
                          <span className={styles.label}>Nota máxima</span>

                          <input
                            type="number"
                            className={styles.input}
                            value={notaMaximaNode}
                            onChange={(e) => setNotaMaximaNode(e.target.value)}
                            min={1}
                          />
                        </label>
                      </div>

                      <label className={styles.switchField}>
                        <input
                          type="checkbox"
                          checked={solicitarComentarioNode}
                          onChange={(e) => setSolicitarComentarioNode(e.target.checked)}
                        />

                        <div>
                          <strong>Solicitar comentário</strong>
                          <p>
                            Após enviar a nota, o cliente poderá escrever um comentário sobre o atendimento.
                          </p>
                        </div>
                      </label>

                      {solicitarComentarioNode && (
                        <label className={styles.field}>
                          <span className={styles.label}>
                            Mensagem para solicitar comentário
                          </span>

                          <textarea
                            className={styles.textarea}
                            value={mensagemComentarioNode}
                            onChange={(e) => setMensagemComentarioNode(e.target.value)}
                            placeholder="Ex: Conte como foi sua experiência."
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {["enviar_imagem", "enviar_video", "enviar_audio"].includes(tipoNodeEdicao) && (
                    <div className={styles.field}>
                      <span className={styles.label}>
                        {tipoNodeEdicao === "enviar_imagem"
                          ? "Imagem"
                          : tipoNodeEdicao === "enviar_video"
                          ? "Vídeo"
                          : "Áudio"}
                      </span>

                      {midiaUrlNode ? (
                        <div className={styles.midiaSelecionadaBox}>
                          <div className={styles.midiaSelecionadaInfo}>
                            <div className={styles.midiaSelecionadaIcone}>
                              {tipoNodeEdicao === "enviar_imagem"
                                ? "🖼️"
                                : tipoNodeEdicao === "enviar_video"
                                ? "🎬"
                                : "🎧"}
                            </div>

                            <div>
                              <strong className={styles.midiaSelecionadaTitulo}>
                                {tipoNodeEdicao === "enviar_imagem"
                                  ? "Imagem selecionada"
                                  : tipoNodeEdicao === "enviar_video"
                                  ? "Vídeo selecionado"
                                  : "Áudio selecionado"}
                              </strong>

                              <p className={styles.midiaSelecionadaNome}>
                                {midiaNomeNode || "Mídia selecionada"}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            className={styles.dangerSmallButton}
                            onClick={() => {
                              setMidiaUrlNode("");
                              setMidiaNomeNode("");
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`${styles.optionsBox} ${
                              tipoNodeEdicao === "enviar_imagem"
                                ? styles.mediaOptionsBoxImagem
                                : tipoNodeEdicao === "enviar_video"
                                ? styles.mediaOptionsBoxVideo
                                : styles.mediaOptionsBoxAudio
                            }`}
                          >
                              <select
                                className={styles.input}
                                value={midiaUrlNode}
                                onChange={(e) => {
                                  const urlSelecionada = e.target.value;
                                  const midiaSelecionada = midias.find(
                                    (m) => m.url === urlSelecionada
                                  );

                                  setMidiaUrlNode(urlSelecionada);
                                  setMidiaNomeNode(midiaSelecionada?.nome || "");
                                }}
                                disabled={carregandoMidias || enviandoMidia}
                              >
                                <option value="">
                                  {carregandoMidias ? "Carregando mídias..." : "Selecione uma mídia"}
                                </option>

                                {midias
                                  .filter((midia) =>
                                    tipoNodeEdicao === "enviar_imagem"
                                      ? midia.tipo === "imagem"
                                      : tipoNodeEdicao === "enviar_video"
                                      ? midia.tipo === "video"
                                      : midia.tipo === "audio"
                                  )
                                  .map((midia) => (
                                    <option key={midia.id} value={midia.url}>
                                      {midia.nome}
                                    </option>
                                  ))}
                              </select>

                              <label
                                className={`${styles.secondaryButton} ${
                                  limiteStorageMidiasAtingido ? styles.disabledButton : ""
                                }`}
                              >
                                  {enviandoMidia
                                    ? tipoNodeEdicao === "enviar_video"
                                      ? uploadMidiaMensagem || "Analisando vídeo..."
                                      : "Enviando..."
                                    : "Subir nova mídia"}

                                <input
                                  type="file"
                                  accept={
                                    tipoNodeEdicao === "enviar_imagem"
                                      ? "image/*"
                                      : tipoNodeEdicao === "enviar_video"
                                      ? "video/*"
                                      : "audio/*"
                                  }
                                  style={{ display: "none" }}
                                  disabled={enviandoMidia || limiteStorageMidiasAtingido}
                                  onChange={(e) => {
                                    const arquivo = e.target.files?.[0];

                                    if (!arquivo) return;

                                    setErro("");
                                    setSucesso("");

                                    if (arquivo.type.startsWith("image/")) {
                                      if (arquivo.size > LIMITE_IMAGEM_BYTES) {
                                        setErro("A imagem deve ter no máximo 5MB.");
                                        return;
                                      }
                                    }

                                    if (arquivo.type.startsWith("video/")) {
                                      if (arquivo.size > LIMITE_VIDEO_BYTES) {
                                        setErro(
                                          "O vídeo deve ter no máximo 16MB. Reduza o tamanho antes de enviar."
                                        );
                                        return;
                                      }
                                    }

                                    if (arquivo.type.startsWith("audio/")) {
                                      if (arquivo.size > LIMITE_AUDIO_BYTES) {
                                        setErro(
                                          "O áudio deve ter no máximo 16MB. Reduza o tamanho antes de enviar."
                                        );
                                        return;
                                      }
                                    }

                                    enviarNovaMidia(arquivo);

                                    e.target.value = "";
                                  }}
                                />
                              </label>

                              <span className={styles.help}>
                                Imagens até 5MB, vídeos até 16MB e áudios até 16MB.
                                Para envio rápido, use vídeo MP4 com codec H.264/AVC e áudio AAC.
                              </span>
                              <span className={styles.help}>
                                Se o vídeo estiver em outro formato, o sistema converte automaticamente antes de salvar,
                                o que pode demorar alguns minutos.
                              </span>

                              {enviandoMidia && tipoNodeEdicao === "enviar_video" && (
                                <div className={styles.videoUploadProgressBox}>
                                  <div className={styles.videoUploadProgressTop}>
                                    <span>{uploadMidiaMensagem || "Analisando vídeo..."}</span>
                                    <strong>{Math.max(0, Math.min(100, uploadMidiaProgresso))}%</strong>
                                  </div>

                                  <div className={styles.videoUploadProgressTrack}>
                                    <div
                                      className={styles.videoUploadProgressBar}
                                      style={{
                                        width: `${Math.max(0, Math.min(100, uploadMidiaProgresso))}%`,
                                      }}
                                    />
                                  </div>

                                  <div className={styles.videoUploadProgressFooter}>
                                    <p className={styles.videoUploadProgressHelp}>
                                      {uploadMidiaProgresso < 12
                                        ? "Verificando se o vídeo já está no formato aceito pelo WhatsApp."
                                        : uploadMidiaProgresso < 60
                                        ? "Se necessário, o sistema está convertendo o vídeo para MP4 H.264/AAC."
                                        : uploadMidiaProgresso < 80
                                        ? "Enviando e salvando a mídia no sistema."
                                        : "Aguardando a finalização do processamento no servidor."}
                                    </p>

                                    <button
                                      type="button"
                                      className={styles.videoUploadCancelButton}
                                      onClick={cancelarUploadMidia}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className={styles.mediaLimitPremiumRow}>
                                <button
                                  type="button"
                                  className={styles.mediaManagePremiumCard}
                                  onClick={() => {
                                    setAbaMidias(
                                      tipoNodeEdicao === "enviar_imagem"
                                        ? "imagem"
                                        : tipoNodeEdicao === "enviar_video"
                                        ? "video"
                                        : "audio"
                                    );
                                    setModalMidiasAberto(true);
                                  }}
                                >
                                  <span className={styles.mediaManagePremiumIcon}>
                                    {tipoNodeEdicao === "enviar_imagem"
                                      ? "🖼️"
                                      : tipoNodeEdicao === "enviar_video"
                                      ? "🎬"
                                      : "🎧"}
                                  </span>

                                  <span className={styles.mediaManagePremiumContent}>
                                    <strong>Gerenciar mídias</strong>
                                    <small>Abrir biblioteca</small>
                                  </span>
                                </button>

                                <div
                                  className={`${styles.mediaLimitPremiumCard} ${classeUsoStorageMidias(
                                    resumoMidias.tamanhoTotal,
                                    LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
                                  )}`}
                                >
                                  <div className={styles.mediaLimitPremiumNumbers}>
                                    <strong>{formatarStorageMidiasMb(resumoMidias.tamanhoTotal)} /</strong>
                                    <span>100 MB</span>
                                  </div>

                                  <small>Limite usado</small>
                                </div>
                              </div>

                              {limiteStorageMidiasAtingido && (
                                <span className={styles.help}>
                                   Limite de 100 MB atingido. Exclua uma mídia no gerenciador antes de subir outra.
                                </span>
                              )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {tipoNodeEdicao === "pergunta_opcoes" && (
                    <div className={styles.optionsBox}>
                      <div className={styles.optionsHeader}>
                        <span className={styles.label}>Opções da pergunta</span>
                        <button
                          type="button"
                          className={styles.smallButton}
                          onClick={adicionarOpcaoPergunta}
                        >
                          + Opção
                        </button>
                      </div>

                      {opcoesNode.length === 0 ? (
                        <p className={styles.help}>Nenhuma opção cadastrada.</p>
                      ) : (
                        opcoesNode.map((opcao, index) => (
                          <div key={index} className={styles.optionRow}>
                            <label className={styles.botaoRespostaCampo}>
                              <span className={styles.botaoRespostaLabel}>ID da resposta</span>
                              <input
                                className={styles.optionValueInput}
                                value={opcao.valor}
                                onChange={(e) =>
                                  atualizarOpcaoPergunta(index, "valor", e.target.value)
                                }
                                placeholder="1"
                              />
                            </label>
                            <label className={styles.botaoRespostaCampo}>
                              <span className={styles.botaoRespostaLabel}>Texto do botão</span>
                              <input
                                className={styles.input}
                                value={opcao.titulo}
                                onChange={(e) =>
                                  atualizarOpcaoPergunta(index, "titulo", e.target.value)
                                }
                                placeholder="Comercial"
                              />
                            </label>

                            <button
                              type="button"
                              className={styles.dangerSmallButton}
                              onClick={() => removerOpcaoPergunta(index)}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {tipoNodeEdicao === "enviar_botoes" && (
                    <div className={styles.optionsBox}>
                      <div className={styles.optionsHeader}>
                        <span className={styles.label}>Botões de resposta</span>

                        <button
                          type="button"
                          className={styles.smallButton}
                          onClick={adicionarBotaoResposta}
                          disabled={botoesNode.length >= 3}
                        >
                          + Botão
                        </button>
                      </div>

                      {botoesNode.length === 0 ? (
                        <p className={styles.help}>Nenhum botão cadastrado.</p>
                      ) : (
                        botoesNode.map((botao, index) => (
                          <div key={index} className={styles.botaoRespostaRow}>
                            <label className={styles.botaoRespostaCampo}>
                              <span className={styles.botaoRespostaLabel}>ID da resposta</span>
                              <input
                                className={styles.optionValueInput}
                                value={botao.id}
                                onChange={(e) =>
                                  atualizarBotaoResposta(index, "id", e.target.value)
                                }
                                placeholder="sim"
                              />
                            </label>

                            <label className={styles.botaoRespostaCampo}>
                              <span className={styles.botaoRespostaLabel}>Texto do botão</span>
                              <input
                                className={styles.input}
                                value={botao.titulo}
                                onChange={(e) =>
                                  atualizarBotaoResposta(index, "titulo", e.target.value)
                                }
                                placeholder="Sim"
                                maxLength={20}
                              />
                            </label>

                            <button
                              type="button"
                              className={styles.dangerSmallButton}
                              onClick={() => removerBotaoResposta(index)}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      )}

                      <p className={styles.help}>
                        O cliente vê o texto do botão. A conexão do fluxo deve usar o ID da resposta.
                        Exemplo: ID “não” conecta com resposta esperada “não”.
                      </p>
                        <p className={styles.help}> O WhatsApp permite até 20 caracteres no botão.</p>
                    </div>
                  )}

                  {tipoNodeEdicao === "botao_redirect" && (
                    <div className={styles.optionsBox}>
                      <label className={styles.field}>
                        <span className={styles.label}>Texto do botão</span>
                        <input
                          className={styles.input}
                          value={redirectBotaoTextoNode}
                          onChange={(e) =>
                            setRedirectBotaoTextoNode(e.target.value)
                          }
                          placeholder="Acessar"
                          maxLength={20}
                        />
                        <span className={styles.help}>
                          O WhatsApp permite ate 20 caracteres no botão CTA.
                        </span>
                      </label>

                      <label className={styles.field}>
                        <span className={styles.label}>URL de destino</span>
                        <input
                          className={styles.input}
                          value={redirectUrlNode}
                          onChange={(e) => setRedirectUrlNode(e.target.value)}
                          placeholder="https://chat.whatsapp.com/..."
                        />
                        <span className={styles.help}>
                          Use um link https, incluindo convites de grupo do
                          WhatsApp ou links externos.
                        </span>
                      </label>
                    </div>
                  )}

                  {tipoNodeEdicao === "agendar_disparo" && (
                    <div className={styles.optionsBox}>
                      <div className={styles.agendarDisparoCostAlert}>
                        <div className={styles.agendarDisparoCostAlertIcon}>⚠</div>

                        <div className={styles.agendarDisparoCostAlertContent}>
                          <strong>Este disparo gera custos</strong>

                          <p>
                            O envio será feito usando template oficial do WhatsApp e poderá gerar
                            cobrança da Meta quando o disparo ocorrer.
                          </p>
                        </div>
                      </div>

                      <div>
                        <span className={styles.label}>Configuração do disparo</span>
                        <p className={styles.help}>
                          Este bloco não envia mensagem comum. Ele agenda um template WhatsApp para ser enviado depois.
                        </p>
                      </div>

                      <label className={styles.field}>
                        <span className={styles.label}>Template WhatsApp</span>

                        <select
                          className={styles.input}
                          value={agendarDisparoTemplateIdNode}
                          onChange={(e) => setAgendarDisparoTemplateIdNode(e.target.value)}
                          disabled={carregandoTemplatesWhatsapp}
                        >
                          <option value="">
                            {carregandoTemplatesWhatsapp
                              ? "Carregando templates..."
                              : "Selecione um template aprovado"}
                          </option>

                          {templatesWhatsapp.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.nome} - {template.idioma}
                            </option>
                          ))}
                        </select>

                        <span className={styles.help}>
                          Apenas templates aprovados devem ser usados para disparos após 24h.
                        </span>
                      </label>

                      <div className={styles.optionRow}>
                        <label className={styles.field}>
                          <span className={styles.label}>Enviar após</span>

                          <input
                            type="number"
                            min={1}
                            className={styles.input}
                            value={agendarDisparoQuantidadeNode}
                            onChange={(e) => setAgendarDisparoQuantidadeNode(e.target.value)}
                          />
                        </label>

                        <label className={styles.field}>
                          <span className={styles.label}>Unidade</span>

                          <select
                            className={styles.input}
                            value={agendarDisparoUnidadeNode}
                            onChange={(e) =>
                              setAgendarDisparoUnidadeNode(e.target.value as "horas" | "dias")
                            }
                          >
                            <option value="horas">Horas</option>
                            <option value="dias">Dias</option>
                          </select>
                        </label>
                      </div>

                      <div className={styles.field}>
                        {indicesVariaveisTemplateAgendarDisparo.length > 0 ? (
                          <>
                            <span className={styles.label}>Variáveis do template</span>

                            <div className={styles.templateVariableGrid}>
                              {indicesVariaveisTemplateAgendarDisparo.map((index) => (
                                <label key={index} className={styles.field}>
                                  <span className={styles.label}>Variável {index + 1}</span>
                                  <input
                                    className={styles.input}
                                    value={obterLinhasVariaveisTemplate(agendarDisparoVariaveisNode)[index]}
                                    onChange={(e) =>
                                      setAgendarDisparoVariaveisNode((atual) =>
                                        atualizarLinhaVariavelTemplate(atual, index, e.target.value)
                                      )
                                    }
                                    placeholder={
                                      index === 0
                                        ? "nome_contato"
                                        : index === 1
                                        ? "numero_contato"
                                        : "email_contato"
                                    }
                                  />
                                </label>
                              ))}
                            </div>

                            <span className={styles.help}>
                              Variável 1 substitui {"{{1}}"}, Variável 2 substitui {"{{2}}"} e Variável 3 substitui {"{{3}}"}.
                            </span>
                            <span className={styles.help}>
                              {VARIAVEIS_FIXAS_CONTATO_HELP}
                            </span>
                          </>
                        ) : null}

                        <div className={styles.templatePreviewCard}>
                          <div className={styles.templatePreviewTop}>
                            <strong>Prévia WhatsApp</strong>
                            <span>{templateAgendarDisparoSelecionado?.nome || "Template"}</span>
                          </div>

                          {previewTemplateAgendarDisparo ? (
                            <div className={styles.whatsappPreviewArea}>
                              <div className={styles.whatsappBubble}>
                                <strong className={styles.whatsappPreviewTitle}>
                                  {previewTemplateAgendarDisparo.titulo}
                                </strong>

                                <p className={styles.whatsappPreviewText}>
                                  {previewTemplateAgendarDisparo.corpo}
                                </p>

                                <div className={styles.whatsappPreviewMeta}>
                                  <span className={styles.whatsappPreviewFooter}>
                                    {previewTemplateAgendarDisparo.rodape}
                                  </span>
                                  <span className={styles.whatsappPreviewTime}>
                                    {new Date().toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>

                                {previewTemplateAgendarDisparo.botoes.map((texto, index) => (
                                  <div key={`${texto}-${index}`} className={styles.whatsappPreviewButton}>
                                    ↩ {texto}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className={styles.previewEmptyState}>
                              Selecione um template aprovado para visualizar a mensagem.
                            </div>
                          )}
                        </div>

                        <div className={styles.agendarDisparoCostPreviewCard}>
                          <div className={styles.costPreviewTop}>
                            <span className={styles.costPreviewLabel}>Estimativa de custo Meta</span>

                            <span className={styles.costPreviewCategory}>
                              {templateAgendarDisparoSelecionado?.categoria || "Categoria"}
                            </span>
                          </div>

                          {loadingPreviewCustoAgendarDisparo ? (
                            <p className={styles.costPreviewMuted}>Calculando estimativa...</p>
                          ) : previewCustoAgendarDisparo ? (
                            <>
                              <strong className={styles.costPreviewValue}>
                                R$ {previewCustoAgendarDisparo.valorTotalBrlMin.toFixed(2)} ~ R${" "}
                                {previewCustoAgendarDisparo.valorTotalBrlMax.toFixed(2)}
                              </strong>

                              <p className={styles.costPreviewMeta}>
                                USD: US$ {previewCustoAgendarDisparo.valorTotalUsd.toFixed(4)} ·
                                Cobrado: {previewCustoAgendarDisparo.totalCobrados} contato
                              </p>

                              <p className={styles.costPreviewHelp}>
                                Esta é uma estimativa para 1 contato. A cobrança real pode variar
                                conforme categoria do template, país do contato, cotação, impostos e
                                regras da Meta.
                              </p>
                            </>
                          ) : (
                            <p className={styles.costPreviewMuted}>
                              Selecione um template aprovado para visualizar a estimativa.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {tipoNodeEdicao.startsWith("agenda_") && (
                    <div className={styles.optionsBox}>
                      <div>
                        <span className={styles.label}>Bloco de agenda</span>
                        <p className={styles.help}>
                          Use junto com Pergunta, Condições e Mensagens para montar agendamento, remarcacao ou cancelamento.
                        </p>
                      </div>

                      {[
                        "agenda_buscar_agendamento",
                        "agenda_escolher_horario",
                        "agenda_criar_agendamento",
                      ].includes(tipoNodeEdicao) && (
                        <label className={styles.field}>
                          <span className={styles.label}>
                            {tipoNodeEdicao === "agenda_criar_agendamento"
                              ? "Selecione a agenda"
                              : "Agenda"}
                          </span>

                          <select
                            className={styles.input}
                            value={agendaIdNode}
                            onChange={(e) => setAgendaIdNode(e.target.value)}
                            disabled={carregandoAgendasOpcoes}
                          >
                            <option value="">
                              {tipoNodeEdicao === "agenda_buscar_agendamento"
                                ? "Qualquer agenda"
                                : carregandoAgendasOpcoes
                                ? "Carregando agendas..."
                                : "Selecione uma agenda ativa"}
                            </option>

                            {agendasOpcoes.map((agenda) => (
                              <option key={agenda.id} value={agenda.id}>
                                {agenda.nome} - {agenda.duracao_minutos}min
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {tipoNodeEdicao === "agenda_escolher_horario" && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem ao listar horarios</span>
                            <textarea
                              className={styles.textarea}
                              value={agendaMensagemListarHorariosNode}
                              onChange={(e) =>
                                setAgendaMensagemListarHorariosNode(e.target.value)
                              }
                            />
                            <span className={styles.help}>
                              Variaveis: {"{{agenda_data_nova}}"} e {"{{agenda_nome_nova}}"}.
                            </span>
                          </label>

                          <div className={styles.optionRow}>
                            <label className={styles.field}>
                              <span className={styles.label}>Opcoes enviadas</span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                className={styles.input}
                                value={agendaQuantidadeOpcoesNode}
                                onChange={(e) =>
                                  setAgendaQuantidadeOpcoesNode(e.target.value)
                                }
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.label}>Buscar por dias</span>
                              <input
                                type="number"
                                min={1}
                                max={60}
                                className={styles.input}
                                value={agendaJanelaDiasNode}
                                onChange={(e) => setAgendaJanelaDiasNode(e.target.value)}
                              />
                            </label>
                          </div>

                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem se horario pedido estiver ocupado</span>
                            <textarea
                              className={styles.textarea}
                              value={agendaMensagemPreferenciaIndisponivelNode}
                              onChange={(e) =>
                                setAgendaMensagemPreferenciaIndisponivelNode(e.target.value)
                              }
                            />
                            <span className={styles.help}>
                              Variaveis: {"{{agenda_data_nova}}"},{" "}
                              {"{{agenda_hora_solicitada}}"} e{" "}
                              {"{{agenda_preferencia_solicitada}}"}.
                            </span>
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem para data passada</span>
                            <textarea
                              className={styles.textarea}
                              value={agendaMensagemDataInvalidaNode}
                              onChange={(e) =>
                                setAgendaMensagemDataInvalidaNode(e.target.value)
                              }
                            />
                            <span className={styles.help}>
                              Variaveis: {"{{agenda_data_informada}}"} e{" "}
                              {"{{agenda_data_sugestao_ano}}"}.
                            </span>
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem sem horarios</span>
                            <textarea
                              className={styles.textarea}
                              value={agendaMensagemSemHorariosNode}
                              onChange={(e) =>
                                setAgendaMensagemSemHorariosNode(e.target.value)
                              }
                            />
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem sem expediente</span>
                            <textarea
                              className={styles.textarea}
                              value={agendaMensagemSemExpedienteNode}
                              onChange={(e) =>
                                setAgendaMensagemSemExpedienteNode(e.target.value)
                              }
                            />
                            <span className={styles.help}>
                              Use quando o dia pedido nao tem horario configurado na agenda.
                              Variavel: {"{{agenda_data_nova}}"}.
                            </span>
                          </label>
                        </>
                      )}

                      {tipoNodeEdicao === "agenda_buscar_agendamento" && (
                        <>
                          <label className={styles.switchField}>
                            <input
                              type="checkbox"
                              checked={agendaListarAgendamentosNode}
                              onChange={(e) =>
                                setAgendaListarAgendamentosNode(e.target.checked)
                              }
                            />

                            <div>
                              <strong>Listar agendamentos para escolha</strong>
                              <p>
                                Envia os agendamentos futuros e aguarda o contato responder o numero.
                              </p>
                            </div>
                          </label>

                          {agendaListarAgendamentosNode && (
                            <>
                              <label className={styles.field}>
                                <span className={styles.label}>Mensagem ao listar agendamentos</span>
                                <textarea
                                  className={styles.textarea}
                                  value={agendaMensagemListarAgendamentosNode}
                                  onChange={(e) =>
                                    setAgendaMensagemListarAgendamentosNode(e.target.value)
                                  }
                                />
                              </label>

                              <label className={styles.field}>
                                <span className={styles.label}>Agendamentos enviados</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  className={styles.input}
                                  value={agendaQuantidadeOpcoesNode}
                                  onChange={(e) =>
                                    setAgendaQuantidadeOpcoesNode(e.target.value)
                                  }
                                />
                              </label>
                            </>
                          )}

                        <label className={styles.field}>
                          <span className={styles.label}>Mensagem quando não encontrar</span>
                          <textarea
                            className={styles.textarea}
                            value={agendaMensagemSemHorariosNode}
                            onChange={(e) =>
                              setAgendaMensagemSemHorariosNode(e.target.value)
                            }
                          />
                        </label>

                        <p className={styles.help}>
                          Este bloco escolhe a proxima conexao usando respostas internas.
                          Crie conexoes do tipo Exata com os valores: encontrado,
                          nao_encontrado e, se quiser tratar falhas, erro. Exemplo:
                          encontrado continua o fluxo; nao_encontrado vai para Transferir.
                        </p>
                        </>
                      )}

                      {["agenda_criar_agendamento", "agenda_remarcar_agendamento"].includes(
                        tipoNodeEdicao
                      ) && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.label}>Status do agendamento</span>
                            <select
                              className={styles.input}
                              value={agendaStatusAgendamentoNode}
                              onChange={(e) =>
                                setAgendaStatusAgendamentoNode(e.target.value)
                              }
                            >
                              <option value="agendado">Agendado</option>
                              <option value="confirmado">Confirmado</option>
                            </select>
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem sem horário / indisponivel</span>
                            <textarea
                              className={styles.textarea}
                              value={agendaMensagemConflitoNode}
                              onChange={(e) =>
                                setAgendaMensagemConflitoNode(e.target.value)
                              }
                            />
                          </label>
                        </>
                      )}
                      <span className={styles.help}>
                        Variaveis principais: {"{{agenda_data}}"}, {"{{agenda_hora}}"},{" "}
                        {"{{agenda_data_nova}}"}, {"{{agenda_hora_nova}}"} e{" "}
                        {"{{agenda_agendamento_id}}"}.
                      </span>

                      {tipoNodeEdicao === "agenda_remarcar_agendamento" && (
                        <>
                          <label className={styles.switchField}>
                            <input
                              type="checkbox"
                              checked={agendaEnviarEmailNode}
                              onChange={(e) =>
                                setAgendaEnviarEmailNode(e.target.checked)
                              }
                            />

                            <div>
                              <strong>Enviar email de confirmacao</strong>
                              <p>
                                O email sera enviado assim que o agendamento for remarcado, usando o mesmo formato do bloco Criar agendamento.
                              </p>
                            </div>
                          </label>

                          {agendaEnviarEmailNode && (
                            <>
                              <label className={styles.field}>
                                <span className={styles.label}>Origem do email</span>
                                <select
                                  className={styles.input}
                                  value={agendaEmailOrigemNode}
                                  onChange={(e) =>
                                    setAgendaEmailOrigemNode(
                                      e.target.value === "variavel"
                                        ? "variavel"
                                        : "contato"
                                    )
                                  }
                                >
                                  <option value="contato">Email cadastrado no contato</option>
                                  <option value="variavel">Email salvo em uma variavel</option>
                                </select>
                                <span className={styles.help}>
                                  Informe qual email o sistema vai usar, email do Contato ou uma variavel do bloco Capturar resposta.
                                </span>
                              </label>

                              {agendaEmailOrigemNode === "variavel" && (
                                <label className={styles.field}>
                                  <span className={styles.label}>Variavel do email</span>
                                  <input
                                    className={styles.input}
                                    value={agendaEmailVariavelNode}
                                    onChange={(e) =>
                                      setAgendaEmailVariavelNode(e.target.value)
                                    }
                                    placeholder="email"
                                  />
                                  <span className={styles.help}>
                                    Use o nome da variavel criada em Capturar resposta. Exemplo: email.
                                  </span>
                                </label>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {tipoNodeEdicao === "agenda_criar_agendamento" && (
                        <>
                          <label className={styles.switchField}>
                            <input
                              type="checkbox"
                              checked={agendaEnviarEmailNode}
                              onChange={(e) =>
                                setAgendaEnviarEmailNode(e.target.checked)
                              }
                            />

                            <div>
                              <strong>Enviar email de confirmacao</strong>
                              <p>
                                O email será enviado para o contato que está agendando. Selecione a origem do email abaixo.
                              </p>
                            </div>
                          </label>

                          {(agendaEnviarEmailNode ||
                            (agendaLembreteAtivoNode &&
                              agendaLembreteEmailNode)) && (
                            <>
                              <label className={styles.field}>
                                <span className={styles.label}>Origem do email</span>
                                <select
                                  className={styles.input}
                                  value={agendaEmailOrigemNode}
                                  onChange={(e) =>
                                    setAgendaEmailOrigemNode(
                                      e.target.value === "variavel"
                                        ? "variavel"
                                        : "contato"
                                    )
                                  }
                                >
                                  <option value="contato">Email cadastrado no contato</option>
                                  <option value="variavel">Email salvo em uma variavel</option>
                                </select>
                                <span className={styles.help}>
                                  Informe qual email o sistema vai usar, email do Contato ou uma variável do bloco Capturar resposta.
                                </span>

                              </label>

                              {agendaEmailOrigemNode === "variavel" && (
                                <label className={styles.field}>
                                  <span className={styles.label}>Variavel do email</span>
                                  <input
                                    className={styles.input}
                                    value={agendaEmailVariavelNode}
                                    onChange={(e) =>
                                      setAgendaEmailVariavelNode(e.target.value)
                                    }
                                    placeholder="email"
                                  />
                                  <span className={styles.help}>
                                    Use o nome da variavel criada em Capturar resposta.
                                    Exemplo: email.
                                  </span>
                                </label>
                              )}
                            </>
                          )}

                          <label className={styles.switchField}>
                            <input
                              type="checkbox"
                              checked={agendaLembreteAtivoNode}
                              onChange={(e) =>
                                setAgendaLembreteAtivoNode(e.target.checked)
                              }
                            />

                            <div>
                              <strong>Enviar lembrete antes do agendamento</strong>
                              <p>
                                Agenda um template WhatsApp, email ou ambos antes do horario marcado.
                              </p>
                            </div>
                          </label>

                          {agendaLembreteAtivoNode && (
                            <>
                              <div className={styles.optionRow}>
                                <label className={styles.field}>
                                  <span className={styles.label}>Enviar antes</span>
                                  <input
                                    type="number"
                                    min={1}
                                    className={styles.input}
                                    value={agendaLembreteQuantidadeNode}
                                    onChange={(e) =>
                                      setAgendaLembreteQuantidadeNode(e.target.value)
                                    }
                                  />
                                </label>

                                <label className={styles.field}>
                                  <span className={styles.label}>Unidade</span>
                                  <select
                                    className={styles.input}
                                    value={agendaLembreteUnidadeNode}
                                    onChange={(e) =>
                                      setAgendaLembreteUnidadeNode(
                                        e.target.value === "minutos"
                                          ? "minutos"
                                          : e.target.value === "dias"
                                          ? "dias"
                                          : "horas"
                                      )
                                    }
                                  >
                                    <option value="minutos">Minutos</option>
                                    <option value="horas">Horas</option>
                                    <option value="dias">Dias</option>
                                  </select>
                                </label>
                              </div>

                              <label className={styles.switchField}>
                                <input
                                  type="checkbox"
                                  checked={agendaLembreteWhatsappNode}
                                  onChange={(e) =>
                                    setAgendaLembreteWhatsappNode(e.target.checked)
                                  }
                                />

                                <div>
                                  <strong>Lembrete por WhatsApp</strong>
                                  <p>
                                    Usa um template aprovado. Templates com botoes podem capturar confirmar, remarcar ou cancelar.
                                  </p>
                                </div>
                              </label>

                              {agendaLembreteWhatsappNode && (
                                <>
                                  <div className={styles.agendarDisparoCostAlert}>
                                    <div className={styles.agendarDisparoCostAlertIcon}>⚠</div>

                                    <div className={styles.agendarDisparoCostAlertContent}>
                                      <strong>Este lembrete gera um disparo oficial do WhatsApp</strong>

                                      <p>
                                        O envio usara template aprovado e podera gerar cobranca da Meta quando o lembrete ocorrer.
                                      </p>
                                    </div>
                                  </div>

                                  <label className={styles.field}>
                                    <span className={styles.label}>Template WhatsApp</span>
                                    <select
                                      className={styles.input}
                                      value={agendaLembreteTemplateIdNode}
                                      onChange={(e) =>
                                        setAgendaLembreteTemplateIdNode(e.target.value)
                                      }
                                      disabled={carregandoTemplatesWhatsapp}
                                    >
                                      <option value="">
                                        {carregandoTemplatesWhatsapp
                                          ? "Carregando templates..."
                                          : "Selecione um template aprovado"}
                                      </option>

                                      {templatesWhatsapp.map((template) => (
                                        <option key={template.id} value={template.id}>
                                          {template.nome} - {template.idioma}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <div className={styles.field}>
                                    {indicesVariaveisTemplateAgendaLembrete.length > 0 ? (
                                      <>
                                        <span className={styles.label}>Variaveis do template</span>

                                        <div className={`${styles.templateVariableGrid} ${styles.templateVariableStack}`}>
                                          {indicesVariaveisTemplateAgendaLembrete.map((index) => (
                                            <label key={index} className={styles.field}>
                                              <span className={styles.label}>Variavel {index + 1}</span>
                                              <input
                                                className={styles.input}
                                                value={obterLinhasVariaveisTemplate(agendaLembreteVariaveisNode)[index]}
                                                onChange={(e) =>
                                                  setAgendaLembreteVariaveisNode((atual) =>
                                                    atualizarLinhaVariavelTemplate(
                                                      atual,
                                                      index,
                                                      e.target.value
                                                    )
                                                  )
                                                }
                                                placeholder={
                                                  index === 0
                                                    ? "nome_contato"
                                                    : index === 1
                                                    ? "agenda_data"
                                                    : "agenda_hora"
                                                }
                                              />
                                            </label>
                                          ))}
                                        </div>

                                        <span className={styles.help}>
                                          Variavel 1 substitui {"{{1}}"}, Variavel 2 substitui {"{{2}}"} e Variavel 3 substitui {"{{3}}"}.
                                        </span>
                                        <span className={styles.help}>
                                          Variaveis do agendamento como agenda_data e agenda_hora ficam disponiveis para o template.
                                        </span>
                                      </>
                                    ) : null}

                                    <div className={styles.templatePreviewCard}>
                                      <div className={styles.templatePreviewTop}>
                                        <strong>Previa WhatsApp</strong>
                                        <span>{templateAgendaLembreteSelecionado?.nome || "Template"}</span>
                                      </div>

                                      {previewTemplateAgendaLembrete ? (
                                        <div className={styles.whatsappPreviewArea}>
                                          <div className={styles.whatsappBubble}>
                                            <strong className={styles.whatsappPreviewTitle}>
                                              {previewTemplateAgendaLembrete.titulo}
                                            </strong>

                                            <p className={styles.whatsappPreviewText}>
                                              {previewTemplateAgendaLembrete.corpo}
                                            </p>

                                            <div className={styles.whatsappPreviewMeta}>
                                              <span className={styles.whatsappPreviewFooter}>
                                                {previewTemplateAgendaLembrete.rodape}
                                              </span>
                                              <span className={styles.whatsappPreviewTime}>
                                                {new Date().toLocaleTimeString("pt-BR", {
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                })}
                                              </span>
                                            </div>

                                            {previewTemplateAgendaLembrete.botoes.map((texto, index) => (
                                              <div key={`${texto}-${index}`} className={styles.whatsappPreviewButton}>
                                                ↩ {texto}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className={styles.previewEmptyState}>
                                          Selecione um template aprovado para visualizar a mensagem.
                                        </div>
                                      )}
                                    </div>

                                    <div className={styles.agendarDisparoCostPreviewCard}>
                                      <div className={styles.costPreviewTop}>
                                        <span className={styles.costPreviewLabel}>Estimativa de custo Meta</span>

                                        <span className={styles.costPreviewCategory}>
                                          {templateAgendaLembreteSelecionado?.categoria || "Categoria"}
                                        </span>
                                      </div>

                                      {loadingPreviewCustoAgendarDisparo ? (
                                        <p className={styles.costPreviewMuted}>Calculando estimativa...</p>
                                      ) : previewCustoAgendarDisparo ? (
                                        <>
                                          <strong className={styles.costPreviewValue}>
                                            R$ {previewCustoAgendarDisparo.valorTotalBrlMin.toFixed(2)} ~ R${" "}
                                            {previewCustoAgendarDisparo.valorTotalBrlMax.toFixed(2)}
                                          </strong>

                                          <p className={styles.costPreviewMeta}>
                                            USD: US$ {previewCustoAgendarDisparo.valorTotalUsd.toFixed(4)} ·
                                            Cobrado: {previewCustoAgendarDisparo.totalCobrados} contato
                                          </p>

                                          <p className={styles.costPreviewHelp}>
                                            Esta é uma estimativa para 1 contato. A cobrança real pode variar
                                            conforme categoria do template, país do contato, cotação, impostos e
                                            regras da Meta.
                                          </p>
                                        </>
                                      ) : (
                                        <p className={styles.costPreviewMuted}>
                                          Selecione um template aprovado para visualizar a estimativa.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}

                              <label className={styles.switchField}>
                                <input
                                  type="checkbox"
                                  checked={agendaLembreteEmailNode}
                                  onChange={(e) =>
                                    setAgendaLembreteEmailNode(e.target.checked)
                                  }
                                />

                                <div>
                                  <strong>Lembrete por email</strong>
                                  <p>
                                    Envia um email simples de lembrete usando a mesma origem de email configurada acima.
                                  </p>
                                </div>
                              </label>
                            </>
                          )}
                        </>
                      )}

                      {tipoNodeEdicao === "agenda_cancelar_agendamento" && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.label}>Status final</span>
                            <select
                              className={styles.input}
                              value={agendaStatusAgendamentoNode}
                              onChange={(e) =>
                                setAgendaStatusAgendamentoNode(e.target.value)
                              }
                            >
                              <option value="cancelado">Cancelado</option>
                              <option value="faltou">Faltou</option>
                            </select>
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Motivo</span>
                            <input
                              className={styles.input}
                              value={agendaMotivoCancelamentoNode}
                              onChange={(e) =>
                                setAgendaMotivoCancelamentoNode(e.target.value)
                              }
                            />
                          </label>

                          <label className={styles.switchField}>
                            <input
                              type="checkbox"
                              checked={agendaEnviarEmailNode}
                              onChange={(e) =>
                                setAgendaEnviarEmailNode(e.target.checked)
                              }
                            />

                            <div>
                              <strong>Enviar email de cancelamento</strong>
                              <p>
                                O email sera enviado assim que o agendamento for cancelado, usando o mesmo formato dos emails de agendamento.
                              </p>
                            </div>
                          </label>

                          {agendaEnviarEmailNode && (
                            <>
                              <label className={styles.field}>
                                <span className={styles.label}>Origem do email</span>
                                <select
                                  className={styles.input}
                                  value={agendaEmailOrigemNode}
                                  onChange={(e) =>
                                    setAgendaEmailOrigemNode(
                                      e.target.value === "variavel"
                                        ? "variavel"
                                        : "contato"
                                    )
                                  }
                                >
                                  <option value="contato">Email cadastrado no contato</option>
                                  <option value="variavel">Email salvo em uma variavel</option>
                                </select>
                                <span className={styles.help}>
                                  Informe qual email o sistema vai usar, email do Contato ou uma variavel do bloco Capturar resposta.
                                </span>
                              </label>

                              {agendaEmailOrigemNode === "variavel" && (
                                <label className={styles.field}>
                                  <span className={styles.label}>Variavel do email</span>
                                  <input
                                    className={styles.input}
                                    value={agendaEmailVariavelNode}
                                    onChange={(e) =>
                                      setAgendaEmailVariavelNode(e.target.value)
                                    }
                                    placeholder="email"
                                  />
                                  <span className={styles.help}>
                                    Use o nome da variavel criada em Capturar resposta. Exemplo: email.
                                  </span>
                                </label>
                              )}
                            </>
                          )}
                        </>
                      )}


                    </div>
                  )}

                  {tipoNodeEdicao === "interpretar_arquivo_ia" && (
                    <div className={styles.arquivoIABox}>
                      <label className={styles.field}>
                        <span className={styles.label}>Instrução para IA</span>

                        <textarea
                          className={styles.textarea}
                          value={arquivoInstrucaoIaNode}
                          onChange={(e) => setArquivoInstrucaoIaNode(e.target.value)}
                          placeholder="Ex: Interprete se este arquivo é um comprovante de pagamento no valor mínimo de R$ 150,00."
                        />

                        <span className={styles.help}>
                          Explique o que a IA deve verificar no arquivo enviado pelo cliente.
                        </span>
                      </label>

                      <label className={styles.field}>
                        <span className={styles.label}>Campos para extrair</span>

                        <textarea
                          className={styles.textarea}
                          value={arquivoCamposExtracaoNode}
                          onChange={(e) => setArquivoCamposExtracaoNode(e.target.value)}
                          placeholder="valor, banco, pagador, data, id_transacao"
                        />

                        <span className={styles.help}>
                          Informe as variáveis separadas por vírgula, palavras sem acentos. A IA só poderá retornar esses campos.
                          Exemplo: valor, banco, pagador. Depois você poderá usar como
                          {" "}{"{{analise_arquivo_valor}}"}.
                        </span>
                        <span className={styles.help}>
                          Váriaveis fixas: {"{{analise_arquivo}}"} {"{{analise_arquivo_motivo}}"}
                        </span>
                      </label>

                      <label className={styles.field}>
                        <span className={styles.label}>Mensagem quando inválido</span>

                        <textarea
                          className={styles.textarea}
                          value={arquivoMensagemErroNode}
                          onChange={(e) => setArquivoMensagemErroNode(e.target.value)}
                        />
                      </label>
                      <div className={styles.warningBox}>
                        <div className={styles.errorConnectionNotice}>
                          <strong>Crie uma conexão de Erro para este bloco</strong>
                          <p>
                            Se os tokens de IA acabarem, o fluxo vai seguir pela
                            conexão com resposta esperada <strong>erro</strong>.
                            Configure essa rota para enviar uma mensagem, transferir
                            o atendimento ou executar a tratativa que desejar.
                          </p>
                        </div>

                        <strong>Como usar as conexões deste bloco</strong>

                        <p>
                          Após interpretar o arquivo, a IA retorna um status para o fluxo seguir.
                          Crie conexões saindo deste bloco.
                        </p>

                        <ul className={styles.warningList}>
                          <li>
                            <strong>aprovado</strong> — quando o arquivo atende à instrução.
                          </li>
                          <li>
                            <strong>reprovado</strong> — quando o arquivo não atende à instrução.
                          </li>
                          <li>
                            <strong>erro</strong> — quando o arquivo está ilegível,
                            não pôde ser analisado ou os tokens de IA acabaram.
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {tipoNodeEdicao === "transferir_setor" && (
                    <label className={styles.field}>
                      <span className={styles.label}>Setor destino</span>

                      <select
                        className={styles.input}
                        value={setorDestino}
                        onChange={(e) => setSetorDestino(e.target.value)}
                        disabled={carregandoSetores}
                      >
                        <option value="">
                          {carregandoSetores ? "Carregando setores..." : "Selecione um setor"}
                        </option>

                        {setores.map((setor) => (
                          <option key={setor.id} value={setor.id}>
                            {setor.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  
                  {tipoNodeEdicao !== "inicio" && tipoNodeEdicao !== "agendar_disparo" && (
                    <label className={styles.delayField}>
                      <div className={styles.delayTopRow}>
                        <span className={styles.label}>Delay antes de enviar:</span>

                        <span className={styles.helpS}>Segundos:</span>
                          <input
                            type="number"
                            min={0}
                            max={LIMITE_DELAY_SEGUNDOS}
                            className={styles.delayInput}
                            value={delayNode}
                            onChange={(e) => {
                              const valor = e.target.value;

                              if (valor === "") {
                                setDelayNode("");
                                return;
                              }

                              const somenteNumeros = valor.replace(/\D/g, "");

                              if (!somenteNumeros) {
                                setDelayNode("");
                                return;
                              }

                              const numero = Number(somenteNumeros);

                              if (!Number.isFinite(numero)) {
                                setDelayNode("");
                                return;
                              }

                              if (numero > LIMITE_DELAY_SEGUNDOS) {
                                setDelayNode(String(LIMITE_DELAY_SEGUNDOS));
                                return;
                              }

                              setDelayNode(String(Math.floor(numero)));
                            }}
                          />

                      </div>

                      <span className={styles.help}>
                        Delay adicional antes do envio deste bloco, é somado ao tempo minimo do sistema, entre 2 a 3 segundos. Deixe vazio para envio imediato.
                      </span>
                      <span className={styles.help}>
                        Máximo: 82.800 segundos, equivalente a 23 horas.
                      </span>
                    </label>
                  )}
                  
                  {tipoNodeEdicao !== "inicio" && (
                    <div className={styles.optionsBox}>
                      <label className={styles.switchField}>
                        <input
                          type="checkbox"
                          checked={notificarAoChegarNode}
                          onChange={(e) => setNotificarAoChegarNode(e.target.checked)}
                        />

                        <div>
                          <strong>Notificar quando chegar neste bloco</strong>
                          <p>
                            Cria uma notificação no sistema quando a automação alcançar este bloco.
                          </p>
                        </div>
                      </label>

                      {notificarAoChegarNode && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.label}>Título da notificação</span>
                            <input
                              className={styles.input}
                              value={notificacaoTituloNode}
                              onChange={(e) => setNotificacaoTituloNode(e.target.value)}
                              placeholder="Ex: Lead chegou na escolha de plano"
                            />
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Mensagem da notificação</span>
                            <textarea
                              className={styles.textarea}
                              value={notificacaoMensagemNode}
                              onChange={(e) => setNotificacaoMensagemNode(e.target.value)}
                              placeholder="Ex: O contato chegou no bloco de escolha de plano."
                            />
                          </label>

                          <label className={styles.switchField}>
                            <input
                              type="checkbox"
                              checked={notificarEmailNode}
                              onChange={(e) => setNotificarEmailNode(e.target.checked)}
                            />

                            <div>
                              <strong>Enviar email também</strong>
                              <p>
                                Além da notificação no sistema, envia um email para os responsáveis.
                              </p>
                            </div>
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {[
                    "pergunta_opcoes",
                    "enviar_botoes",
                    "capturar_resposta",
                    "agenda_buscar_agendamento",
                    "agenda_escolher_horario",
                    "avaliacao",
                    "interpretar_arquivo_ia",
                  ].includes(tipoNodeEdicao) && (
                    <div className={styles.tentativasBox}>
                      <div>
                        <span className={styles.label}>Controle de tentativas</span>

                        <p className={styles.help}>
                          Evita que o fluxo fique repetindo este bloco em loop.
                        </p>
                      </div>

                      <div className={styles.optionRow}>
                        <label className={styles.field}>
                          <span className={styles.label}>
                            Respostas inválidas
                          </span>

                          <input
                            type="number"
                            min={1}
                            className={styles.input}
                            value={maxTentativasInvalidasNode}
                            onChange={(e) =>
                              setMaxTentativasInvalidasNode(e.target.value)
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          <span className={styles.label}>
                            Sem resposta
                          </span>

                          <input
                            type="number"
                            min={1}
                            className={styles.input}
                            value={maxTentativasSemRespostaNode}
                            onChange={(e) =>
                              setMaxTentativasSemRespostaNode(e.target.value)
                            }
                          />
                        </label>
                      </div>

                      <label className={styles.field}>
                        <span className={styles.label}>
                          Quando exceder
                        </span>

                        <select
                          className={styles.input}
                          value={acaoExcessoTentativasNode}
                          onChange={(e) =>
                            setAcaoExcessoTentativasNode(e.target.value)
                          }
                        >
                          <option value="transferir_atendimento">
                            Transferir para atendimento
                          </option>

                          <option value="encerrar_fluxo">
                            Encerrar fluxo
                          </option>

                          <option value="reiniciar_fluxo">
                            Reiniciar fluxo
                          </option>
                        </select>
                        {acaoExcessoTentativasNode === "transferir_atendimento" && (
                          <label className={styles.field}>
                            <span className={styles.label}>
                              Setor do atendimento
                            </span>

                            <select
                              className={styles.input}
                              value={setorExcessoTentativasNode}
                              onChange={(e) =>
                                setSetorExcessoTentativasNode(e.target.value)
                              }
                            >
                              <option value="">
                                Selecione um setor
                              </option>

                              {setores.map((setor) => (
                                <option key={setor.id} value={setor.id}>
                                  {setor.nome}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </label>

                      <label className={styles.field}>
                        <span className={styles.label}>
                          Mensagem ao exceder
                        </span>

                        <textarea
                          className={styles.textarea}
                          value={mensagemExcessoTentativasNode}
                          onChange={(e) =>
                            setMensagemExcessoTentativasNode(e.target.value)
                          }
                        />
                      </label>

                      <label className={styles.switchField}>
                        <input
                          type="checkbox"
                          checked={notificarExcessoTentativasNode}
                          onChange={(e) =>
                            setNotificarExcessoTentativasNode(e.target.checked)
                          }
                        />

                        <div>
                          <strong>Notificar no sistema</strong>
                          <p>
                            Cria uma notificação quando este bloco exceder o limite de tentativas.
                          </p>
                        </div>
                      </label>

                      <label className={styles.switchField}>
                        <input
                          type="checkbox"
                          checked={notificarEmailExcessoTentativasNode}
                          onChange={(e) =>
                            setNotificarEmailExcessoTentativasNode(e.target.checked)
                          }
                        />

                        <div>
                          <strong>Enviar email</strong>
                          <p>
                            Envia um alerta por email quando o limite de tentativas for excedido.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className={styles.actionButtonsRow}>
                    {nodeEditado.data?.tipo_no !== "inicio" && (
                      <>
                        {confirmandoExclusaoNo ? (
                          <button
                            type="button"
                            className={styles.deleteNodeConfirmButton}
                            onClick={() => removerNode(nodeEditado.id)}
                          >
                            Excluir
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.deleteNodeIconButton}
                            onClick={() => setConfirmandoExclusaoNo(true)}
                            title="Excluir bloco"
                          >
                            🗑
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={fecharPainelEdicao}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={aplicarEdicaoNo}
                    >
                      Aplicar no bloco
                    </button>
                  </div>

                  <p className={styles.help}>
                    Depois de aplicar, clique em Salvar fluxo para gravar no banco.
                  </p>


                </div>
                ) : (
                <div className={styles.propertiesForm}>
                    <label className={styles.field}>
                      <span className={styles.label}>Nome da conexão</span>
                      <input
                        className={styles.input}
                        value={tipoCondicaoConexao === "sempre" ? "Sempre seguir" : rotuloConexao}
                        onChange={(e) => {
                          setNomeConexaoEditadoManual(true);
                          setRotuloConexao(e.target.value);
                        }}
                        placeholder="Ex: Opção 1, Sim, Comercial"
                        disabled={tipoCondicaoConexao === "sempre"}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>Tipo da condição</span>
                      <select
                          className={styles.input}
                          value={tipoCondicaoConexao}
                          onChange={(e) => {
                            const novoTipo = e.target.value;

                            setTipoCondicaoConexao(novoTipo);

                            if (novoTipo === "sempre") {
                              setValorCondicao("");
                              setRotuloConexao("Sempre seguir");
                            }
                          }}
                        >
                          <option value="resposta_igual">Exata</option>
                          <option value="resposta_contem">Contém</option>
                          <option value="resposta_inicia_com">Inicia com</option>
                          <option value="resposta_regex">Regex</option>
                          <option value="sempre">Sempre seguir</option>
                          <option value="timeout_sem_resposta">Sem resposta após tempo</option>
                      </select>
                    </label>

                    {tipoCondicaoConexao === "timeout_sem_resposta" && (
                      <div className={styles.optionsBox}>
                        <div className={styles.timeoutGrid}>
                          <label className={styles.field}>
                            <span className={styles.label}>Tempo mínimo</span>

                            <input
                              type="number"
                              min={5}
                              max={timeoutUnidade === "horas" ? 22 : 1320}
                              className={styles.input}
                              value={timeoutQuantidade}
                              onChange={(e) => setTimeoutQuantidade(e.target.value)}
                            />
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Unidade</span>

                            <select
                              className={styles.input}
                              value={timeoutUnidade}
                              onChange={(e) =>
                                setTimeoutUnidade(e.target.value as "minutos" | "horas")
                              }
                            >
                              <option value="minutos">Minutos</option>
                              <option value="horas">Horas</option>
                            </select>
                          </label>
                        </div>

                        <label className={styles.field}>
                          <span className={styles.label}>Status da mensagem</span>

                          <select
                            className={styles.input}
                            value={statusEnvioTimeout}
                            onChange={(e) =>
                              setStatusEnvioTimeout(
                                e.target.value as "qualquer" | "entregue" | "lida"
                              )
                            }
                          >
                            <option value="qualquer">Qualquer status</option>
                            <option value="entregue">Apenas entregue</option>
                            <option value="lida">Apenas lida</option>
                          </select>
                        </label>

                        <p className={styles.help}>
                          Para mensagens comuns do WhatsApp, o tempo precisa ser menor que 22 horas.
                          Para 22h ou mais será necessário usar template aprovado.
                        </p>
                      </div>
                    )}

                    <div className={styles.IABox}>
                      <label className={styles.IAField}>
                        <input
                          type="checkbox"
                          checked={usarIaConexao}
                          onChange={(e) => {
                            const ativo = e.target.checked;

                            setUsarIaConexao(ativo);

                            if (!ativo) {
                              setDescricaoIaConexao("");
                              return;
                            }

                            const respostaEsperada = String(
                              valorCondicao || ""
                            ).trim();

                            setDescricaoIaConexao(
                              gerarSugestaoDescricaoIA(respostaEsperada)
                            );
                          }}
                        />

                        <div>
                          <strong>Usar IA para interpretar esta conexão</strong>
                          <p>
                            A IA vai analisar a resposta do cliente e escolher esta conexão quando a intenção combinar com a descrição abaixo.
                          </p>
                        </div>
                      </label>

                      {usarIaConexao && (
                        <label className={styles.field}>
                          <span className={styles.label}>Descrição para IA</span>

                          <textarea
                            className={styles.textarea}
                            value={descricaoIaConexao}
                            onChange={(e) => setDescricaoIaConexao(e.target.value)}
                            placeholder="Ex: Use esta conexão quando o cliente quiser saber preço, planos, mensalidade, orçamento ou contratar."
                          />

                          <span className={styles.help}>
                            Descreva a intenção do cliente. Não coloque resposta pronta; coloque quando esta conexão deve ser usada.
                          </span>
                        </label>
                      )}
                    </div>

                    {tipoCondicaoConexao !== "sempre" &&
                      tipoCondicaoConexao !== "timeout_sem_resposta" && (
                      <label className={styles.field}>
                        <span className={styles.label}>ID da resposta 
                        </span>
                        <input
                          className={styles.input}
                          value={valorCondicao}
                          onChange={(e) => {
                            const novoValor = e.target.value;

                            setValorCondicao(novoValor);

                            if (!nomeConexaoEditadoManual) {
                              setRotuloConexao(novoValor);
                            }

                            if (!descricaoIaConexao.trim()) {
                              setDescricaoIaConexao(
                                gerarSugestaoDescricaoIA(novoValor)
                              );
                            }
                          }}
                          placeholder="Ex: 1, sim, quero comprar"
                        />
                      </label>
                    )}

                    <div className={styles.actionButtonsRow}>
                      {edgeEditada && (
                        <>
                          {confirmandoExclusaoConexao ? (
                            <button
                              type="button"
                              className={styles.deleteNodeConfirmButton}
                              onClick={() => removerConexao(edgeEditada.id)}
                            >
                              Excluir
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.deleteNodeIconButton}
                              onClick={() => setConfirmandoExclusaoConexao(true)}
                              title="Excluir conexão"
                            >
                              🗑
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={fecharPainelEdicao}
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={aplicarEdicaoConexao}
                      >
                        Aplicar na conexão
                      </button>
                    </div>

                    <p className={styles.help}>
                    Depois de aplicar, clique em Salvar fluxo para gravar no banco.
                    </p>
                </div>
                )}
            </aside>
            )}
        </div>
      </section>

      {tooltipAlertaFluxo && (
        <div
          className={styles.flowAlertTooltipPortal}
          style={{
            left: tooltipAlertaFluxo.x,
            top: tooltipAlertaFluxo.y,
          }}
        >
          {tooltipAlertaFluxo.texto}
        </div>
      )}

      {modalMidiasAberto && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalCard} ${styles.mediaManagerModal}`}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Biblioteca de mídias</p>
                <h3 className={styles.modalTitle}>Gerenciar mídias</h3>
                <p className={styles.modalSubtitle}>
                  Baixe, consulte ou exclua definitivamente mídias da empresa.
                </p>
              </div>

              <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => {
                  setModalMidiasAberto(false);
                  setConfirmandoExclusaoMidiaId(null);
                }}
              >
                ×
              </button>
            </div>

            <div className={styles.mediaSummaryGrid}>
              <div className={styles.mediaSummaryCard}>
                <span>Total</span>
                <strong>{resumoMidias.total}</strong>
              </div>

              <div className={styles.mediaSummaryCard}>
                <span>Imagens</span>
                <strong>{resumoMidias.imagens}</strong>
              </div>

              <div className={styles.mediaSummaryCard}>
                <span>Vídeos</span>
                <strong>{resumoMidias.videos}</strong>
              </div>

              <div className={styles.mediaSummaryCard}>
                <span>Áudios</span>
                <strong>{resumoMidias.audios}</strong>
              </div>

              <div
                className={`${styles.mediaSummaryCard} ${styles.mediaSummaryStorageCard} ${classeUsoStorageMidias(
                  resumoMidias.tamanhoTotal,
                  LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
                )}`}
              >
                <span>Storage</span>

                <div className={styles.mediaSummaryStorageValue}>
                  <strong>{formatarStorageMidiasMb(resumoMidias.tamanhoTotal)}</strong>
                  <small>100 MB</small>
                </div>

                <div className={styles.mediaSummaryStorageTrack}>
                  <div
                    className={styles.mediaSummaryStorageBar}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (resumoMidias.tamanhoTotal / LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.mediaTabs}>
              <button
                type="button"
                className={abaMidias === "todas" ? styles.mediaTabActive : styles.mediaTab}
                onClick={() => setAbaMidias("todas")}
              >
                Todas ({resumoMidias.total})
              </button>

              <button
                type="button"
                className={abaMidias === "imagem" ? styles.mediaTabActive : styles.mediaTab}
                onClick={() => setAbaMidias("imagem")}
              >
                Imagens ({resumoMidias.imagens})
              </button>

              <button
                type="button"
                className={abaMidias === "video" ? styles.mediaTabActive : styles.mediaTab}
                onClick={() => setAbaMidias("video")}
              >
                Vídeos ({resumoMidias.videos})
              </button>

              <button
                type="button"
                className={abaMidias === "audio" ? styles.mediaTabActive : styles.mediaTab}
                onClick={() => setAbaMidias("audio")}
              >
                Áudios ({resumoMidias.audios})
              </button>
            </div>

            <div className={styles.mediaManagerList}>
              {carregandoMidias ? (
                <div className={styles.emptyMini}>Carregando mídias...</div>
              ) : midiasFiltradasModal.length === 0 ? (
                <div className={styles.emptyMini}>Nenhuma mídia encontrada.</div>
              ) : (
                midiasFiltradasModal.map((midia) => (
                  <div key={midia.id} className={styles.mediaManagerItem}>
                    <div className={styles.mediaManagerIcon}>
                      {iconeTipoMidia(midia.tipo)}
                    </div>

                    <div className={styles.mediaManagerInfo}>
                      <strong>{midia.nome}</strong>

                      <span>
                        {labelTipoMidia(midia.tipo)} · {formatarTamanhoArquivo(midia.tamanho_bytes)}
                      </span>

                      <small>
                        {midia.mime_type || "Tipo não informado"} · {formatarDataMidia(midia.created_at)}
                      </small>
                    </div>

                    <div className={styles.mediaManagerActions}>
                      <a
                        className={styles.smallButton}
                        href={midia.url}
                        download={midia.nome}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Baixar
                      </a>

                      {confirmandoExclusaoMidiaId === midia.id ? (
                        <button
                          type="button"
                          className={styles.dangerSmallButton}
                          disabled={midiaExcluindoId === midia.id}
                          onClick={() => excluirMidiaDefinitivamente(midia)}
                        >
                          {midiaExcluindoId === midia.id ? "Excluindo..." : "Confirmar"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.dangerSmallButton}
                          onClick={() => setConfirmandoExclusaoMidiaId(midia.id)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <p className={styles.help}>
              A exclusão é definitiva: remove o registro da tabela e o arquivo do Storage. Se algum bloco estiver usando essa mídia, ele ficará sem mídia selecionada e precisará ser ajustado antes de ativar/salvar o fluxo.
            </p>
          </div>
        </div>
      )}

        {editandoFluxo && (
        <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
                <div>
                <p className={styles.eyebrow}>Editar fluxo</p>
                <h3 className={styles.modalTitle}>Nome e descrição</h3>
                </div>

                <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => {
                  setErroEdicaoFluxo("");
                  setEditandoFluxo(false);
                  setFluxoEmEdicao(null);
                }}
                >
                ×
                </button>
            </div>

            <div className={styles.modalBody}>
                {erroEdicaoFluxo && (
                  <div className={styles.errorAlert}>{erroEdicaoFluxo}</div>
                )}

                <label className={styles.field}>
                <span className={styles.label}>Nome</span>
                <input
                    className={styles.input}
                    value={nomeFluxoEdicao}
                    onChange={(e) => {
                      setErroEdicaoFluxo("");
                      setNomeFluxoEdicao(e.target.value);
                    }}
                />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Descrição</span>
                  <textarea
                      className={styles.textareadesc}
                      value={descricaoFluxoEdicao}
                      onChange={(e) => setDescricaoFluxoEdicao(e.target.value)}
                  />
                </label>

                <label className={styles.switchField}>
                  <input
                    type="checkbox"
                    checked={fluxoPadraoEdicao}
                    disabled={!fluxoPadraoEdicao && existeOutroFluxoPadraoNaEmpresa()}
                    onChange={(e) => {
                      const marcado = e.target.checked;

                      setErroEdicaoFluxo("");
                      setFluxoPadraoEdicao(marcado);

                      if (marcado) {
                        setNovoGatilhoValor("");
                        setNovoGatilhoCondicao("contem");
                      }
                    }}
                  />

                  <div>
                    <strong>Tornar este fluxo padrão</strong>

                    <p>
                      O fluxo padrão é iniciado automaticamente quando nenhuma palavra-chave de outro fluxo for encontrada.
                    </p>

                    {!fluxoPadraoEdicao && existeOutroFluxoPadraoNaEmpresa() && (
                      <p className={styles.help}>
                        Já existe outro fluxo padrão nesta empresa. Só pode existir 1 fluxo padrão por empresa.
                      </p>
                    )}
                  </div>
                </label>


                {fluxoPadraoEdicao ? (
                  <div className={styles.defaultFlowNotice}>
                    <div className={styles.defaultFlowIcon}>↪</div>

                    <div className={styles.defaultFlowContent}>
                      <div className={styles.defaultFlowTop}>
                        <strong>Fluxo padrão de fallback</strong>
                        <span className={styles.defaultFlowBadge}>Padrão</span>
                      </div>

                      <p>
                        Este fluxo é iniciado automaticamente quando nenhuma palavra-chave de outro fluxo for encontrada.
                      </p>

                      <p>
                        Por isso, ele não usa gatilhos próprios.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.gatilhosBox}>
                    <div>
                        <p className={styles.modalSectionTitle}>Gatilhos do fluxo</p>
                        <p className={styles.help}>
                        Palavras que iniciam este fluxo quando o cliente envia uma mensagem.
                        </p>
                    </div>

                    <div className={styles.gatilhoCreateRow}>
                        <input
                        className={styles.input}
                        value={novoGatilhoValor}
                        onChange={(e) => setNovoGatilhoValor(e.target.value)}
                        placeholder="Ex: suporte, login, senha"
                        />

                        <div className={styles.gatilhoBottomRow}>
                          <select
                              className={styles.input}
                              value={novoGatilhoCondicao}
                              onChange={(e) =>
                              setNovoGatilhoCondicao(e.target.value as GatilhoFluxo["condicao"])
                              }
                          >
                              <option value="contem">Contém a palavra</option>
                              <option value="exata">Igual exatamente</option>
                              <option value="inicia_com">Começa com</option>
                              <option value="regex">Regex</option>
                          </select>

                          <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={criarGatilhoFluxo}
                          >
                              Adicionar
                          </button>
                        </div>
                    </div>

                    {gatilhosFluxo.length === 0 ? (
                        <div className={styles.emptyMini}>
                        Nenhum gatilho cadastrado para este fluxo.
                        </div>
                      ) : (
                          <div className={styles.gatilhosList}>
                            {gatilhosFluxo.map((gatilho) => (
                                <div key={gatilho.id} className={styles.gatilhoItem}>
                                  <div>
                                      <strong className={styles.gatilhoValor}>{gatilho.valor}</strong>
                                      <p className={styles.gatilhoMeta}>
                                      Condição: {gatilho.condicao} ·{" "}
                                      {gatilho.ativo ? "Ativo" : "Inativo"}
                                      </p>
                                  </div>

                                  <div className={styles.gatilhoActions}>
                                      <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      onClick={() => alternarGatilhoFluxo(gatilho)}
                                      >
                                      {gatilho.ativo ? "Desativar" : "Ativar"}
                                      </button>

                                      <button
                                      type="button"
                                      className={styles.dangerSmallButton}
                                      onClick={() => removerGatilhoFluxo(gatilho.id)}
                                      >
                                      ×
                                      </button>
                                  </div>
                                </div>
                            ))}
                          </div>
                        )}
                  </div>
                )}
                <div className={styles.sectionBlock}>
                  <div>
                    <p className={styles.modalSectionTitle}>Encerramento por inatividade</p>
                    <p className={styles.helperText}>
                      Todo fluxo será encerrado automaticamente quando o contato ficar sem responder pelo tempo definido.
                      Essa regra tem prioridade sobre conexões "Sem resposta após tempo" maiores.
                    </p>
                  </div>

                  <div className={styles.inlineFields}>
                    <label className={styles.field}>
                      <span className={styles.label}>Tempo sem resposta</span>

                      <input
                        className={styles.input}
                        type="number"
                        min={encerrarInatividadeUnidade === "minutos" ? 5 : 1}
                        max={encerrarInatividadeUnidade === "minutos" ? 1380 : 23}
                        value={encerrarInatividadeQuantidade}
                        onChange={(e) =>
                          setEncerrarInatividadeQuantidade(
                            limitarQuantidadeInatividade(
                              e.target.value,
                              encerrarInatividadeUnidade
                            )
                          )
                        }
                        onBlur={() =>
                          setEncerrarInatividadeQuantidade(
                            corrigirQuantidadeMinimaInatividade(
                              encerrarInatividadeQuantidade,
                              encerrarInatividadeUnidade
                            )
                          )
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>Unidade</span>

                      <select
                        className={styles.input}
                        value={encerrarInatividadeUnidade}
                        onChange={(e) => {
                          const novaUnidade =
                            e.target.value === "minutos" ? "minutos" : "horas";

                          setEncerrarInatividadeUnidade(novaUnidade);

                          setEncerrarInatividadeQuantidade((valorAtual) =>
                            corrigirQuantidadeMinimaInatividade(valorAtual, novaUnidade)
                          );
                        }}
                      >
                        <option value="minutos">Minutos</option>
                        <option value="horas">Horas</option>
                      </select>
                    </label>
                  </div>

                  <p className={styles.helperText}>
                    O tempo mínimo é de 5 minutos e o máximo é de 23 horas.
                  </p>

                  <label className={styles.field}>
                    <span className={styles.label}>Mensagem antes de encerrar</span>

                    <textarea
                      className={styles.textarea}
                      value={encerrarInatividadeMensagem}
                      onChange={(e) => setEncerrarInatividadeMensagem(e.target.value)}
                      placeholder="Mensagem enviada antes de encerrar o atendimento."
                    />
                  </label>
                </div>
            </div>

            <div className={styles.modalFooter}>
                <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setErroEdicaoFluxo("");
                  setEditandoFluxo(false);
                  setFluxoEmEdicao(null);
                }}
                >
                Cancelar
                </button>

                <button
                type="button"
                className={styles.primaryButton}
                onClick={salvarEdicaoFluxo}
                >
                Salvar alterações
                </button>
            </div>
            </div>
        </div>
        )}

        {modalArquivarAberto && fluxoParaArquivar && (
        <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
                <div>
                <p className={styles.eyebrow}>Arquivar fluxo</p>
                <h3 className={styles.modalTitle}>Confirmar arquivamento</h3>
                </div>

                <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => {
                    setModalArquivarAberto(false);
                    setFluxoParaArquivar(null);
                }}
                >
                ×
                </button>
            </div>

            <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                <strong>O fluxo será arquivado, não excluído definitivamente.</strong>
                <p>
                    O fluxo <strong>{fluxoParaArquivar.nome}</strong> ficará com status{" "}
                    <strong>arquivado</strong>. Ele não será executado e poderá ser
                    restaurado depois ou excluido definitivo clicando em apagar. 
                </p>
                </div>
            </div>

            <div className={styles.modalFooter}>
                <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                    setModalArquivarAberto(false);
                    setFluxoParaArquivar(null);
                }}
                >
                Cancelar
                </button>

                <button
                type="button"
                className={styles.dangerButton}
                onClick={confirmarArquivarFluxo}
                >
                Arquivar fluxo
                </button>
            </div>
            </div>
        </div>
        )}

        {modalApagarDefinitivoAberto && fluxoParaApagarDefinitivo && (
        <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
                <div>
                <p className={styles.eyebrow}>Apagar definitivo</p>
                <h3 className={styles.modalTitle}>Essa ação não poderá ser desfeita</h3>
                </div>

                <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => {
                    setModalApagarDefinitivoAberto(false);
                    setFluxoParaApagarDefinitivo(null);
                }}
                >
                ×
                </button>
            </div>

            <div className={styles.modalBody}>
                <div className={styles.dangerBox}>
                <strong>Você está prestes a apagar este fluxo definitivamente.</strong>
                <p>
                    O fluxo <strong>{fluxoParaApagarDefinitivo.nome}</strong> será removido
                    do banco de dados junto com seus blocos, conexões e gatilhos
                    relacionados. Essa ação não poderá ser desfeita.
                </p>
                </div>
            </div>

            <div className={styles.modalFooter}>
                <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                    setModalApagarDefinitivoAberto(false);
                    setFluxoParaApagarDefinitivo(null);
                }}
                >
                Cancelar
                </button>

                <button
                type="button"
                className={styles.dangerButton}
                onClick={confirmarApagarDefinitivo}
                >
                Apagar definitivamente
                </button>
            </div>
            </div>
        </div>
        )}

        {modalCompartilharAberto && fluxoParaCompartilhar && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Compartilhar fluxo</p>
                  <h3 className={styles.modalTitle}>Codigo do fluxo</h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setModalCompartilharAberto(false);
                    setFluxoParaCompartilhar(null);
                    setCodigoCompartilhamento("");
                    setErroCompartilhamento("");
                  }}
                >
                  x
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.shareInfoBox}>
                  <Share2 size={18} />
                  <div>
                    <strong>{fluxoParaCompartilhar.nome}</strong>
                    <p>
                      O código fica salvo neste fluxo e cria uma copia em rascunho na empresa que importar.
                      Mídias não são copiadas.
                    </p>
                  </div>
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>Codigo para compartilhar</span>

                  <div className={styles.codeCopyRow}>
                    <input
                      className={styles.codeInput}
                      value={
                        carregandoCodigoCompartilhamento
                          ? "Carregando codigo..."
                          : codigoCompartilhamento
                      }
                      readOnly
                    />

                    <button
                      type="button"
                      className={styles.iconActionButton}
                      title="Copiar codigo"
                      onClick={copiarCodigoCompartilhamento}
                      disabled={!codigoCompartilhamento}
                    >
                      <Copy size={18} strokeWidth={2.4} />
                    </button>
                  </div>
                </label>

                {erroCompartilhamento && (
                  <div className={styles.errorAlert}>{erroCompartilhamento}</div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setModalCompartilharAberto(false);
                    setFluxoParaCompartilhar(null);
                    setCodigoCompartilhamento("");
                    setErroCompartilhamento("");
                  }}
                >
                  Fechar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => gerarCodigoCompartilhamento(fluxoParaCompartilhar)}
                  disabled={carregandoCodigoCompartilhamento}
                >
                  {carregandoCodigoCompartilhamento
                    ? "Atualizando..."
                    : "Atualizar compartilhamento"}
                </button>
              </div>
            </div>
          </div>
        )}

        {modalImportarAberto && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Importar fluxo</p>
                  <h3 className={styles.modalTitle}>Colar codigo</h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setModalImportarAberto(false);
                    setCodigoImportacao("");
                    setErroImportacao("");
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.shareInfoBox}>
                  <CopyPlus size={18} />
                  <div>
                    <strong>Importar copia do fluxo</strong>
                    <p>
                      A copia sera criada como rascunho nesta empresa, sem arquivos de midia.
                    </p>
                  </div>
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>Codigo recebido</span>
                  <input
                    className={styles.input}
                    value={codigoImportacao}
                    onChange={(e) => setCodigoImportacao(e.target.value)}
                    placeholder="FLX-XXXX-XXXX-XXXX"
                  />
                </label>

                {erroImportacao && (
                  <div className={styles.errorAlert}>{erroImportacao}</div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setModalImportarAberto(false);
                    setCodigoImportacao("");
                    setErroImportacao("");
                  }}
                  disabled={importandoFluxo}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={importarFluxoCompartilhado}
                  disabled={importandoFluxo}
                >
                  {importandoFluxo ? "Importando..." : "Importar fluxo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {abrirCriacao && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Novo fluxo</p>
                  <h3 className={styles.modalTitle}>Criar automação</h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setErroCriacaoFluxo("");
                    setAbrirCriacao(false);
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <label className={styles.field}>
                  <span className={styles.label}>Nome do fluxo</span>
                  <input
                    className={styles.input}
                    value={novoFluxoNome}
                    onChange={(e) => setNovoFluxoNome(e.target.value)}
                    placeholder="Ex: Atendimento inicial"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Descrição</span>
                  <textarea
                    className={styles.textarea}
                    value={descricaoNovoFluxo}
                    onChange={(e) => setDescricaoNovoFluxo(e.target.value)}
                    placeholder="Descrição opcional"
                  />
                </label>

                <div className={styles.sectionBlock}>
                  <div>
                    <p className={styles.modalSectionTitle}>Encerramento por inatividade</p>
                    <p className={styles.helperText}>
                      Todo fluxo será encerrado automaticamente quando o contato ficar sem responder pelo tempo definido.
                      Essa regra tem prioridade sobre conexões "Sem resposta após tempo" maiores.
                    </p>
                  </div>

                  <div className={styles.inlineFields}>
                    <label className={styles.field}>
                      <span className={styles.label}>Tempo sem resposta</span>

                      <input
                        className={styles.input}
                        type="number"
                        min={encerrarInatividadeUnidade === "minutos" ? 5 : 1}
                        max={encerrarInatividadeUnidade === "minutos" ? 1380 : 23}
                        value={encerrarInatividadeQuantidade}
                        onChange={(e) =>
                          setEncerrarInatividadeQuantidade(
                            limitarQuantidadeInatividade(
                              e.target.value,
                              encerrarInatividadeUnidade
                            )
                          )
                        }
                        onBlur={() =>
                          setEncerrarInatividadeQuantidade(
                            corrigirQuantidadeMinimaInatividade(
                              encerrarInatividadeQuantidade,
                              encerrarInatividadeUnidade
                            )
                          )
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>Unidade</span>

                      <select
                        className={styles.input}
                        value={encerrarInatividadeUnidade}
                        onChange={(e) => {
                          const novaUnidade =
                            e.target.value === "minutos" ? "minutos" : "horas";

                          setEncerrarInatividadeUnidade(novaUnidade);

                          setEncerrarInatividadeQuantidade((valorAtual) =>
                            corrigirQuantidadeMinimaInatividade(valorAtual, novaUnidade)
                          );
                        }}
                      >
                        <option value="minutos">Minutos</option>
                        <option value="horas">Horas</option>
                      </select>
                    </label>
                  </div>

                  <p className={styles.helperText}>
                    O tempo mínimo é de 5 minutos e o máximo é de 23 horas.
                  </p>

                  <label className={styles.field}>
                    <span className={styles.label}>Mensagem antes de encerrar</span>

                    <textarea
                      className={styles.textarea}
                      value={encerrarInatividadeMensagem}
                      onChange={(e) => setEncerrarInatividadeMensagem(e.target.value)}
                      placeholder="Mensagem enviada antes de encerrar o atendimento."
                    />
                  </label>
                </div>

                {!jaExisteFluxoPadrao && (
                  <label className={styles.switchField}>
                    <input
                      type="checkbox"
                      checked={novoFluxoPadrao}
                      onChange={(e) => {
                        setNovoFluxoPadrao(e.target.checked);

                        if (e.target.checked) {
                          setGatilhosNovoFluxo([]);
                          setNovoGatilhoValor("");
                        }
                      }}
                    />

                    <div>
                      <strong>Fluxo padrão</strong>
                      <p>
                        Inicia automaticamente quando nenhuma palavra-chave de outro fluxo for encontrada.
                      </p>
                    </div>
                  </label>
                )}

                {!novoFluxoPadrao && (
                  <div className={styles.gatilhosBox}>
                    <div>
                      <p className={styles.modalSectionTitle}>Gatilhos do fluxo</p>
                      <p className={styles.help}>
                        Palavras que iniciam este fluxo quando o cliente envia uma mensagem.
                      </p>
                    </div>

                    <div className={styles.gatilhoCreateRow}>
                      <input
                        className={styles.input}
                        value={novoGatilhoValor}
                        onChange={(e) => setNovoGatilhoValor(e.target.value)}
                        placeholder="Ex: suporte, login, senha"
                      />

                      <div className={styles.gatilhoBottomRow}>
                        <select
                          className={styles.input}
                          value={novoGatilhoCondicao}
                          onChange={(e) =>
                            setNovoGatilhoCondicao(
                              e.target.value as GatilhoFluxo["condicao"]
                            )
                          }
                        >
                          <option value="contem">Contém</option>
                          <option value="exata">Exata</option>
                          <option value="inicia_com">Inicia com</option>
                          <option value="regex">Regex</option>
                        </select>

                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={adicionarGatilhoNovoFluxo}
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>

                    {gatilhosNovoFluxo.length === 0 ? (
                      <div className={styles.emptyMini}>
                        Nenhum gatilho adicionado para este novo fluxo.
                      </div>
                    ) : (
                      <div className={styles.gatilhosList}>
                        {gatilhosNovoFluxo.map((gatilho, index) => (
                          <div
                            key={`${gatilho.valor}-${gatilho.condicao}-${index}`}
                            className={styles.gatilhoItem}
                          >
                            <div>
                              <strong className={styles.gatilhoValor}>
                                {gatilho.valor}
                              </strong>

                              <p className={styles.gatilhoMeta}>
                                Condição:{" "}
                                {gatilho.condicao === "contem"
                                  ? "Contém a palavra"
                                  : gatilho.condicao === "exata"
                                  ? "Igual exatamente"
                                  : gatilho.condicao === "inicia_com"
                                  ? "Começa com"
                                  : gatilho.condicao}{" "}
                                · {gatilho.ativo === false ? "Inativo" : "Ativo"}
                              </p>
                            </div>

                            <div className={styles.gatilhoActions}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() =>
                                  setGatilhosNovoFluxo((atuais) =>
                                    atuais.map((item, i) =>
                                      i === index
                                        ? {
                                            ...item,
                                            ativo: item.ativo === false ? true : false,
                                          }
                                        : item
                                    )
                                  )
                                }
                              >
                                {gatilho.ativo === false ? "Ativar" : "Desativar"}
                              </button>

                              <button
                                type="button"
                                className={styles.dangerSmallButton}
                                onClick={() =>
                                  setGatilhosNovoFluxo((atuais) =>
                                    atuais.filter((_, i) => i !== index)
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {erroCriacaoFluxo && (
                <div className={styles.errorAlert}>
                  {erroCriacaoFluxo}
                </div>
              )}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setAbrirCriacao(false)}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={criarFluxoRapido}
                >
                  Criar fluxo
                </button>
              </div>
            </div>
          </div>
        )}


        {menuFluxo && menuFluxo.fluxo && (
          <div
            className={styles.flowDropdownPortal}
            style={{
              top:
                window.innerHeight - menuFluxo.buttonBottom < 170
                  ? menuFluxo.buttonTop - 8
                  : menuFluxo.buttonBottom + 6,
              left: menuFluxo.x - 180,
              transform:
                window.innerHeight - menuFluxo.buttonBottom < 170
                  ? "translateY(-100%)"
                  : "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {menuFluxo.fluxo.status === "arquivado" ? (
              <>
                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    restaurarFluxo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Restaurar
                </button>

                <button
                  className={`${styles.flowDropdownItem} ${styles.flowDropdownDanger}`}
                  onClick={() => {
                    abrirModalApagarDefinitivo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Apagar definitivo
                </button>
              </>
            ) : (
              <>
                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    alterarStatusFluxo(
                      menuFluxo.fluxo!,
                      menuFluxo.fluxo!.status === "ativo" ? "pausado" : "ativo"
                    );
                    setMenuFluxo(null);
                  }}
                >
                  {menuFluxo.fluxo.status === "ativo" ? "Pausar" : "Ativar"}
                </button>

                <button
                  type="button"
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    abrirEdicaoFluxo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Editar fluxo
                </button>

                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    duplicarFluxo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Clonar
                </button>

                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    abrirCompartilhamentoFluxo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Compartilhar
                </button>

                <button
                  className={`${styles.flowDropdownItem} ${styles.flowDropdownDanger}`}
                  onClick={() => {
                    abrirModalArquivarFluxo(menuFluxo.fluxo!);
                    setMenuFluxo(null);
                  }}
                >
                  Apagar
                </button>
              </>
            )}
          </div>
        )}

        {mostrarModalCustoAgendamento && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Confirmação</p>
                  <h3 className={styles.modalTitle}>
                    Confirmar agendamento de disparo
                  </h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setMostrarModalCustoAgendamento(false);
                    setAcaoPendenteAplicarNo(null);
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                  <strong>Este bloco agenda um disparo oficial do WhatsApp.</strong>

                  <p>Quando o disparo ocorrer:</p>

                  <ul className={styles.warningList}>
                    <li>Poderá abrir uma nova janela de conversa</li>
                    <li>Poderá gerar cobrança da Meta</li>
                    <li>O envio será realizado automaticamente</li>
                  </ul>

                  {previewCustoAgendarDisparo && (
                    <div className={styles.modalCostPreviewBox}>
                      <span>Estimativa para 1 contato</span>

                      <strong>
                        R$ {previewCustoAgendarDisparo.valorTotalBrlMin.toFixed(2)} ~ R${" "}
                        {previewCustoAgendarDisparo.valorTotalBrlMax.toFixed(2)}
                      </strong>

                      <small>
                        Categoria: {previewCustoAgendarDisparo.categoria} · USD: US${" "}
                        {previewCustoAgendarDisparo.valorTotalUsd.toFixed(4)}
                      </small>
                    </div>
                  )}

                  <p>
                    Use esse recurso apenas quando fizer sentido para recuperação ou
                    continuidade do atendimento.
                  </p>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setMostrarModalCustoAgendamento(false);
                    setAcaoPendenteAplicarNo(null);
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    setMostrarModalCustoAgendamento(false);

                    if (acaoPendenteAplicarNo) {
                      acaoPendenteAplicarNo();
                    }

                    setAcaoPendenteAplicarNo(null);
                  }}
                >
                  Continuar e aplicar
                </button>
              </div>
            </div>
          </div>
        )}

    </main>
  </>
  );
}
