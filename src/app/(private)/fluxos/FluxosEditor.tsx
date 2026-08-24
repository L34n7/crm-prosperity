"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addEdge,
  Position,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import AssistenteFluxosPanel, {
  type AssistenteFluxosFluxoCriado,
} from "./AssistenteFluxosPanel";
import type { TemplateVariableOption } from "@/components/TemplateVariableCombobox";
import { useHeaderUser } from "@/components/header-user-context";
import "@xyflow/react/dist/style.css";
import styles from "./fluxos.module.css";
import ConnectionEditor from "./components/ConnectionEditor";
import PropertiesPanel from "./components/PropertiesPanel";
import EncerrarConfig from "./components/node-config/EncerrarConfig";
import CapturarRespostaConfig from "./components/node-config/CapturarRespostaConfig";
import AvaliacaoConfig from "./components/node-config/AvaliacaoConfig";
import AgendarDisparoConfig from "./components/node-config/AgendarDisparoConfig";
import AgendaConfig from "./components/node-config/AgendaConfig";
import TentativasConfig from "./components/node-config/TentativasConfig";
import NotificacaoConfig from "./components/node-config/NotificacaoConfig";
import DelayConfig from "./components/node-config/DelayConfig";
import RedirectConfig from "./components/node-config/RedirectConfig";
import TransferenciaConfig from "./components/node-config/TransferenciaConfig";
import InterpretarArquivoIaConfig from "./components/node-config/InterpretarArquivoIaConfig";
import NodeConfigPanel from "./components/node-config/NodeConfigPanel";
import MidiaConfig from "./components/node-config/MidiaConfig";
import PerguntaOpcoesConfig from "./components/node-config/PerguntaOpcoesConfig";
import BotoesConfig from "./components/node-config/BotoesConfig";
import NodeActions from "./components/node-config/NodeActions";
import FluxoCanvas from "./components/FluxoCanvas";
import FluxoEditorHeader from "./components/FluxoEditorHeader";
import FluxosSidebar from "./components/FluxosSidebar";
import useFluxoNodes from "./hooks/useFluxoNodes";
import useFluxoConnections from "./hooks/useFluxoConnections";
import useFluxoEditor from "./hooks/useFluxoEditor";
import useFluxos from "./hooks/useFluxos";
import useFluxoResources from "./hooks/useFluxoResources";
import WhatsappFlowPreview from "./components/WhatsappFlowPreview";
import IaTokenEstimateModal from "./components/modals/IaTokenEstimateModal";
import DisparoCostConfirmModal from "./components/modals/DisparoCostConfirmModal";
import MediaManagerModal from "./components/modals/MediaManagerModal";
import ArchiveFlowModal from "./components/modals/ArchiveFlowModal";
import DeleteFlowModal from "./components/modals/DeleteFlowModal";
import ShareFlowModal from "./components/modals/ShareFlowModal";
import ImportFlowModal from "./components/modals/ImportFlowModal";
import useFluxoVariaveis from "./hooks/useFluxoVariaveis";
import VariablesManagerModal from "./components/modals/VariablesManagerModal";
import useFluxoCompartilhamento from "./hooks/useFluxoCompartilhamento";
import useFluxoGatilhos from "./hooks/useFluxoGatilhos";
import useFluxoCrud from "./hooks/useFluxoCrud";
import CreateFlowModal from "./components/modals/CreateFlowModal";
import EditFlowModal from "./components/modals/EditFlowModal";
import useFluxoForm from "./hooks/useFluxoForm";
import { validarFluxoAntesDeAtivar } from "./fluxo-validation";
import useFluxoMidias from "./hooks/useFluxoMidias";
import {
  montarPreviaWhatsappFluxo,
  type EncerramentoInatividadePreviaWhatsapp,
} from "./whatsapp-preview";
import {
  normalizarEscopoIntegracoesFluxo,
  normalizarTemplatesPorIntegracao,
  obterIntegracoesDoEscopoFluxo,
  rotuloIntegracaoWhatsapp,
  templateCompativelComIntegracao,
  templateWhatsappAprovado,
  usaTemplatesPorIntegracao,
} from "./fluxo-integracoes";

import {
  atualizarLinhaVariavelTemplate,
  contarVariaveisObrigatoriasPreenchidas,
  contarVariaveisTemplateWhatsapp,
  montarPreviewTemplateWhatsapp,
  normalizarEntradaVariavelTemplate,
  preencherPrimeiraLinhaVariavelTemplate,
  templateWhatsappTemCabecalhoMidia,
} from "./template-utils";

import type {
  AutomacaoConexao,
  AutomacaoNo,
  EscopoFilaNode,
  EstrategiaTransferenciaNode,
  Fluxo,
  IntegracaoWhatsappOpcao,
  PreviaGeracaoDescricaoIa,
  ResultadoEncerramentoFluxo,
  TemplateWhatsappOpcao,
  TipoValorConversao,
} from "./types";
import {
  AVISO_FLUXO_CONEXAO_ERRO_ARQUIVO_IA,
  LIMITE_ARQUIVO_BYTES,
  LIMITE_AUDIO_BYTES,
  LIMITE_DELAY_SEGUNDOS,
  LIMITE_IMAGEM_BYTES,
  LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES,
  LIMITE_VIDEO_BYTES,
  NODE_CARD_HEIGHT,
  NODE_CARD_WIDTH,
  NODE_GAP_X,
  NODE_GAP_Y,
  RESULTADOS_ENCERRAMENTO,
  TIPOS_NO_MIDIA,
  TIPOS_VALOR_CONVERSAO,
  TIPO_NO_PERGUNTA_LIVRE_IA,
  TOKENS_PROMPT_FIXO_DESCRICAO_IA_ESTIMADOS,
  TOKENS_SAIDA_MAX_DESCRICAO_IA,
  VARIAVEIS_FIXAS_CONTATO_RESERVADAS,
  VARIAVEIS_FIXAS_SISTEMA,
} from "./constants";
import {
  labelTipoNo,
  normalizarDelaySegundos,
  opcoesRespostaDoNo,
  tituloEhPadraoDoSistema,
  tituloPadraoTipoNo,
  tituloVisivelCard,
} from "./utils";
import { obterConfiguracaoEncerramentoInatividade } from "@/lib/automacoes/normalizar-configuracao-fluxo";
import { gerarSugestaoDescricaoIAComContexto } from "@/lib/ia/sugestoes-descricao-ia";
import { Sparkles } from "lucide-react";

// CRM_QUEUE_SCOPE_EDITOR_V1
function normalizarEscopoFilaNode(
  valor: unknown,
  setorId?: unknown,
  usarGeralComoPadrao = false
): EscopoFilaNode {
  if (String(valor || "").trim() === "geral") return "geral";
  if (String(valor || "").trim() === "setor") return "setor";
  if (String(setorId || "").trim()) return "setor";
  return usarGeralComoPadrao ? "geral" : "setor";
}

function fluxoEhSistemaCalendario(fluxo?: Fluxo | null) {
  return Boolean(
    fluxo?.configuracao_json?.fluxo_sistema_calendario === true &&
      fluxo?.configuracao_json?.protegido_sistema === true
  );
}

function normalizarEstrategiaTransferenciaNode(
  valor: unknown,
  atendenteId?: unknown
): EstrategiaTransferenciaNode {
  const estrategia = String(valor || "").trim();
  if (
    estrategia === "fila_setor" ||
    estrategia === "atendente_especifico" ||
    estrategia === "rodizio_aleatorio" ||
    estrategia === "menos_conversas"
  ) {
    return estrategia;
  }

  return String(atendenteId || "").trim()
    ? "atendente_especifico"
    : "fila_setor";
}

function criarIdTemporario(prefixo: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${prefixo}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function tipoNoEsperaResposta(tipoNo: string) {
  return (
    tipoNo === "pergunta_opcoes" ||
    tipoNo === TIPO_NO_PERGUNTA_LIVRE_IA ||
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

function configuracaoNodeComoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function nodeEhBlocoMidia(node: Node) {
  return TIPOS_NO_MIDIA.has(String(node.data?.tipo_no || ""));
}

function validarMidiasObrigatoriasNodes(nodesValidacao: Node[]) {
  for (const node of nodesValidacao) {
    if (!nodeEhBlocoMidia(node)) continue;

    const config = configuracaoNodeComoObjeto(node.data?.configuracao_json);

    if (!String(config.midia_url || "").trim()) {
      return `O bloco "${node.data?.titulo}" precisa ter uma midia selecionada.`;
    }
  }

  return "";
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

function formatarUltimoSalvamento(data: Date | null) {
  if (!data) return "Ainda não salvo nesta sessão";

  const agora = new Date();

  const mesmoDia =
    data.getDate() === agora.getDate() &&
    data.getMonth() === agora.getMonth() &&
    data.getFullYear() === agora.getFullYear();

  const hora = data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (mesmoDia) {
    return `Salvo hoje, às ${hora}`;
  }

  const diaMes = data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  return `Salvo em ${diaMes}, às ${hora}`;
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

  if (tipoNo === TIPO_NO_PERGUNTA_LIVRE_IA) {
    return "Nova intencao";
  }

  return tipoNoEsperaResposta(tipoNo) ? "Nova condição" : "Sempre seguir";
}

type EdgeDataConexao = {
  condicao_json?: Record<string, unknown>;
};

function proximaOpcaoRespostaDisponivel(
  nodeOrigem: Node | undefined,
  edgesAtuais: Edge[]
) {
  const opcoesResposta = opcoesRespostaDoNo(nodeOrigem);

  if (opcoesResposta.length === 0) return null;

  const valoresUsados = new Set(
    edgesAtuais
      .filter((edge) => edge.source === nodeOrigem?.id)
      .map((edge) =>
        String(
          ((edge.data as EdgeDataConexao | undefined)?.condicao_json || {})
            .valor || ""
        ).trim()
      )
      .filter(Boolean)
  );

  return (
    opcoesResposta.find((opcao) => !valoresUsados.has(opcao.valor)) || null
  );
}

function textoEhGenericoParaConexaoIa(texto: string) {
  const valor = String(texto || "").trim();

  if (!valor) return true;

  return new Set([
    "Nova intencao",
    "Intencao IA",
    "Nova condição",
    "Condição",
    "Nova mensagem",
    "Mensagem",
    "Novo bloco",
    "Digite a mensagem aqui.",
    "Como posso te ajudar?",
  ]).has(valor);
}

function rotuloConexaoIaPorDestino(nodeDestino?: Node | null) {
  if (!nodeDestino) return "Intencao IA";

  const configuracao = (nodeDestino.data?.configuracao_json || {}) as {
    mensagem?: string;
  };

  const candidatos = [
    String(nodeDestino.data?.titulo || ""),
    tituloVisivelCard(nodeDestino.data),
    String(configuracao.mensagem || "").replace(/\s+/g, " ").trim(),
    labelTipoNo(String(nodeDestino.data?.tipo_no || "")),
  ];

  return (
    candidatos.find((texto) => !textoEhGenericoParaConexaoIa(texto)) ||
    "Intencao IA"
  );
}

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

function nodeAgendarDisparoPrecisaTemplatePorWaba(
  node: Node,
  integracoesEscopo: IntegracaoWhatsappOpcao[],
  templates: TemplateWhatsappOpcao[]
) {
  if (String(node.data?.tipo_no || "") !== "agendar_disparo") {
    return false;
  }

  if (!usaTemplatesPorIntegracao(integracoesEscopo)) {
    return false;
  }

  const config = configuracaoNodeComoObjeto(node.data?.configuracao_json);
  const templatesPorIntegracao = normalizarTemplatesPorIntegracao(
    config.templates_por_integracao
  );

  return integracoesEscopo.some((integracao) => {
    const templateId = String(templatesPorIntegracao[integracao.id] || "").trim();
    const template = templates.find((item) => item.id === templateId);

    return (
      !templateId ||
      !template ||
      !templateWhatsappAprovado(template) ||
      !templateCompativelComIntegracao(template, integracao)
    );
  });
}

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

function calcularPosicaoLivreDuplicacaoNo(
  nodeOrigem: Node,
  nodesAtuais: Node[]
) {
  const passoX = NODE_CARD_WIDTH + NODE_GAP_X;
  const passoY = NODE_CARD_HEIGHT + NODE_GAP_Y;

  const posicaoBase = {
    x: Math.round(nodeOrigem.position.x + passoX),
    y: Math.round(nodeOrigem.position.y),
  };

  const deslocamentos = [
    { x: 0, y: 0 },
    { x: 0, y: passoY },
    { x: 0, y: -passoY },
    { x: passoX, y: 0 },
    { x: passoX, y: passoY },
    { x: passoX, y: -passoY },
    { x: passoX * 2, y: 0 },
    { x: passoX * 2, y: passoY },
    { x: passoX * 2, y: -passoY },
  ];

  for (const deslocamento of deslocamentos) {
    const candidato = {
      x: posicaoBase.x + deslocamento.x,
      y: posicaoBase.y + deslocamento.y,
    };

    const colide = nodesAtuais.some((node) =>
      posicoesSobrepostas(candidato, node.position)
    );

    if (!colide) {
      return candidato;
    }
  }

  return calcularPosicaoLivreNovoNo(nodesAtuais);
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

function configuracaoMarcada(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function FluxosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fluxoParam = searchParams.get("fluxo");
  const mobileDetailActive = Boolean(fluxoParam);

  const headerUser = useHeaderUser();
  const podeCriarFluxos = headerUser.permissoes.includes("fluxos.criar");
  const podeEditarFluxos = headerUser.permissoes.includes("fluxos.editar");
  const podeAtivarFluxos = headerUser.permissoes.includes("fluxos.ativar");
  const podeArquivarFluxos = headerUser.permissoes.includes("fluxos.arquivar");
  const podeExcluirFluxos = headerUser.permissoes.includes("fluxos.excluir");
  const podeGerenciarGatilhos = headerUser.permissoes.includes(
    "fluxos.gerenciar_gatilhos"
  );
  const podeGerenciarMidias = headerUser.permissoes.includes(
    "fluxos.gerenciar_midias"
  );

  const {
    nodes,
    setNodes,
    onNodesChange,
    marcarNodeSelecionado: marcarNodeSelecionadoNos,
  } = useFluxoNodes();

  const {
    edges,
    setEdges,
    onEdgesChange,
    rotuloConexao,
    setRotuloConexao,
    valorCondicao,
    setValorCondicao,
    tipoCondicaoConexao,
    setTipoCondicaoConexao,
    nomeConexaoEditadoManual,
    setNomeConexaoEditadoManual,
    timeoutQuantidade,
    setTimeoutQuantidade,
    timeoutUnidade,
    setTimeoutUnidade,
    statusEnvioTimeout,
    setStatusEnvioTimeout,
    usarIaConexao,
    setUsarIaConexao,
    descricaoIaConexao,
    setDescricaoIaConexao,
    gerandoDescricaoIaConexao,
    setGerandoDescricaoIaConexao,
    limparSelecaoVisualConexoes,
    marcarConexaoSelecionada,
  } = useFluxoConnections();

  const {
    editandoNodeId,
    setEditandoNodeId,
    editandoEdgeId,
    setEditandoEdgeId,
    nodeEditado,
    edgeEditada,
    confirmandoExclusaoNo,
    setConfirmandoExclusaoNo,
    confirmandoExclusaoConexao,
    setConfirmandoExclusaoConexao,
    editarNode,
    editarConexao,
    fecharPainelEdicao: fecharPainelEdicaoHook,
  } = useFluxoEditor({
    nodes,
    edges,
    onLimparSelecaoVisual: () => {
      marcarNodeSelecionadoNos(null);
      limparSelecaoVisualConexoes();
    },
  });

  const fluxoTemBuscaQualquerCalendario = useMemo(() => {
    return nodes.some((node) => {
      if (String(node.data?.tipo_no || "") !== "agenda_buscar_agendamento") {
        return false;
      }

      const configuracao =
        (node.data?.configuracao_json || {}) as Record<string, unknown>;

      return !String(configuracao.agenda_id || "").trim();
    });
  }, [nodes]);
  const [assistenteFluxosAberto, setAssistenteFluxosAberto] = useState(false);
  const [previaWhatsappRecolhida, setPreviaWhatsappRecolhida] =
    useState(false);
  const [respostasPreviaWhatsapp, setRespostasPreviaWhatsapp] = useState<
    Record<string, string>
  >({});

  const [carregandoEstrutura, setCarregandoEstrutura] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ultimoSalvamento, setUltimoSalvamento] = useState<Date | null>(null);
  const [solicitarComentarioNode, setSolicitarComentarioNode] =
    useState(false);

  const [mensagemComentarioNode, setMensagemComentarioNode] =
    useState("");

  const [notaMinimaNode, setNotaMinimaNode] = useState("1");
  const [notaMaximaNode, setNotaMaximaNode] = useState("5");

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const limparErroFluxos = useCallback(() => {
    setErro("");
  }, []);

  const {
    fluxos,
    setFluxos,
    fluxoSelecionado,
    setFluxoSelecionado,
    carregandoFluxos,
    carregarFluxos,
  } = useFluxos({
    fluxoParam,
    onClearError: limparErroFluxos,
    onError: setErro,
  });

  const {
    duplicarFluxo,
    restaurarFluxo,
    modalArquivarAberto,
    fluxoParaArquivar,
    abrirModalArquivarFluxo,
    fecharModalArquivarFluxo,
    confirmarArquivarFluxo,
    modalApagarDefinitivoAberto,
    fluxoParaApagarDefinitivo,
    apagandoFluxoDefinitivo,
    abrirModalApagarDefinitivo,
    fecharModalApagarDefinitivo,
    confirmarApagarDefinitivo,
  } = useFluxoCrud({
    fluxoSelecionado,
    setFluxoSelecionado,
    carregarFluxos,

    onLimparEditorSelecionado: () => {
      setNodes([]);
      setEdges([]);
      setEditandoNodeId(null);
      setEditandoEdgeId(null);
    },

    onError: setErro,
    onClearError: () => setErro(""),
    onSuccess: setSucesso,
    onClearSuccess: () => setSucesso(""),
  });

  const {
    templatesWhatsapp,
    carregandoTemplatesWhatsapp,
    carregarTemplatesWhatsapp,
    integracoesWhatsapp,
    limiteIntegracoesWhatsappFluxos,
    carregandoIntegracoesWhatsapp,
    carregarIntegracoesWhatsapp,
    agendasOpcoes,
    carregandoAgendasOpcoes,
    carregarAgendasOpcoes,
    setores,
    atendentes,
    carregandoSetores,
    carregarSetores,
  } = useFluxoResources({
    onError: setErro,
  });

  const [erroCriacaoFluxo, setErroCriacaoFluxo] = useState("");
  const {
    modalCompartilharAberto,
    fluxoParaCompartilhar,
    codigoCompartilhamento,
    carregandoCodigoCompartilhamento,
    erroCompartilhamento,
    gerarCodigoCompartilhamento,
    abrirCompartilhamentoFluxo,
    fecharCompartilhamentoFluxo,
    copiarCodigoCompartilhamento,
    modalImportarAberto,
    codigoImportacao,
    setCodigoImportacao,
    importandoFluxo,
    erroImportacao,
    abrirImportacaoFluxo,
    fecharImportacaoFluxo,
    importarFluxoCompartilhado,
  } = useFluxoCompartilhamento({
    carregarFluxos,
    setFluxoSelecionado,
    onClearError: () => setErro(""),
    onClearSuccess: () => setSucesso(""),
    onSuccess: setSucesso,
  });
  const [tooltipAlertaFluxo, setTooltipAlertaFluxo] = useState<{
    texto: string;
    x: number;
    y: number;
  } | null>(null);

  const [tituloNode, setTituloNode] = useState("");
  const [mensagemNode, setMensagemNode] = useState("");
  const [delayNode, setDelayNode] = useState<string>("");

  const [midiaUrlNode, setMidiaUrlNode] = useState("");
  const [midiaNomeNode, setMidiaNomeNode] = useState("");

  const selecionarMidiaNode = useCallback(
    (url: string, nome: string) => {
      setMidiaUrlNode(url);
      setMidiaNomeNode(nome);
    },
    []
  );

  const limparMidiaSelecionadaNode = useCallback(() => {
    setMidiaUrlNode("");
    setMidiaNomeNode("");
  }, []);

  const limparSucessoMidias = useCallback(() => {
    setSucesso("");
  }, []);

  const {
    midias,
    carregandoMidias,
    enviandoMidia,
    modalMidiasAberto,
    abaMidias,
    setAbaMidias,
    midiaExcluindoId,
    confirmandoExclusaoMidiaId,
    setConfirmandoExclusaoMidiaId,
    resumoMidias,
    limiteStorageMidiasAtingido,
    carregarMidias,
    enviarNovaMidia,
    excluirMidiaDefinitivamente,
    abrirGerenciadorMidias,
    fecharGerenciadorMidias,
  } = useFluxoMidias({
    podeGerenciarMidias,
    midiaUrlNode,
    setNodes,
    setFluxos,
    setFluxoSelecionado,
    onSelecionarMidia: selecionarMidiaNode,
    onLimparMidiaSelecionada: limparMidiaSelecionadaNode,
    onError: setErro,
    onClearError: limparErroFluxos,
    onSuccess: setSucesso,
    onClearSuccess: limparSucessoMidias,
  });

  const [buscaFluxo, setBuscaFluxo] = useState("");
  const [tipoNodeEdicao, setTipoNodeEdicao] = useState("");

  const [erroEdicaoFluxo, setErroEdicaoFluxo] = useState("");

  const [setorDestino, setSetorDestino] = useState("");
  const [escopoFilaTransferenciaNode, setEscopoFilaTransferenciaNode] =
    useState<EscopoFilaNode>("setor");
  const [estrategiaTransferenciaNode, setEstrategiaTransferenciaNode] =
    useState<EstrategiaTransferenciaNode>("fila_setor");
  const [atendenteDestinoNode, setAtendenteDestinoNode] = useState("");
  const [
    incluirAdministradoresTransferenciaNode,
    setIncluirAdministradoresTransferenciaNode,
  ] = useState(false);

  // CRM_SYSTEM_CALENDAR_FLOW_EDITOR_V1
  const fluxoSistemaCalendario = Boolean(
    fluxoSelecionado?.configuracao_json?.fluxo_sistema_calendario === true &&
      fluxoSelecionado?.configuracao_json?.protegido_sistema === true &&
      [
        "calendario_confirmacao",
        "calendario_cancelamento",
        "calendario_reagendamento",
      ].includes(
        String(
          fluxoSelecionado?.configuracao_json?.finalidade_sistema || ""
        ).trim()
      )
  );
  
  const [mostrarModalCustoAgendamento, setMostrarModalCustoAgendamento] =
    useState(false);

  const [acaoPendenteAplicarNo, setAcaoPendenteAplicarNo] =
    useState<(() => void) | null>(null);

  const possuiAdministradorAtivo = atendentes.some(
    (atendente) => atendente.is_administrador === true
  );

  function permiteDistribuicaoAutomaticaNoSetor(
    setorId: string,
    incluirAdministradores: boolean
  ) {
    if (!setorId) return false;

    const possuiUsuarioComum = atendentes.some(
      (atendente) =>
        atendente.is_administrador !== true &&
        atendente.setor_ids.includes(setorId)
    );

    return (
      possuiUsuarioComum ||
      (incluirAdministradores && possuiAdministradorAtivo)
    );
  }

  function estrategiaDistribuicaoDisponivel(
    estrategia: EstrategiaTransferenciaNode,
    setorId: string,
    incluirAdministradores: boolean
  ): EstrategiaTransferenciaNode {
    if (
      (estrategia === "rodizio_aleatorio" ||
        estrategia === "menos_conversas") &&
      !permiteDistribuicaoAutomaticaNoSetor(
        setorId,
        incluirAdministradores
      )
    ) {
      return "fila_setor";
    }

    return estrategia;
  }
  
  const [filtroStatusFluxo, setFiltroStatusFluxo] = useState<
    | "todos"
    | "sistema"
    | "rascunho"
    | "ativo"
    | "pausado"
    | "arquivado"
  >("todos");

  const {
    gatilhosFluxo,
    setGatilhosFluxo,
    novoGatilhoValor,
    setNovoGatilhoValor,
    novoGatilhoCondicao,
    setNovoGatilhoCondicao,
    gatilhosNovoFluxo,
    setGatilhosNovoFluxo,
    carregarGatilhosFluxo,
    criarGatilhoFluxo,
    removerGatilhoFluxo,
    alternarGatilhoFluxo,
    adicionarGatilhoNovoFluxo,
  } = useFluxoGatilhos({
    podeGerenciarGatilhos,
    onErroEdicao: setErroEdicaoFluxo,
    onErroCriacao: setErroCriacaoFluxo,
    onSuccess: setSucesso,
  });

  const resetarGatilhosNovoFluxoForm = useCallback(() => {
    setGatilhosNovoFluxo([]);
  }, [setGatilhosNovoFluxo]);

  const resetarNovoGatilhoForm = useCallback(() => {
    setNovoGatilhoValor("");
    setNovoGatilhoCondicao("contem");
  }, [setNovoGatilhoValor, setNovoGatilhoCondicao]);

  const navegarParaFluxoForm = useCallback(
    (fluxoId: string) => {
      router.push(`/fluxos?fluxo=${encodeURIComponent(fluxoId)}`);
    },
    [router]
  );

  const {
    abrirCriacao,
    descricaoNovoFluxo,
    setDescricaoNovoFluxo,
    novoFluxoNome,
    setNovoFluxoNome,
    novoFluxoPadrao,
    setNovoFluxoPadrao,
    novoFluxoEscopoIntegracoesModo,
    setNovoFluxoEscopoIntegracoesModo,
    novoFluxoIntegracoesIds,
    setNovoFluxoIntegracoesIds,
    deveMostrarEscopoIntegracoesFluxo,
    jaExisteFluxoPadrao,
    alternarIntegracaoEscopoNovoFluxo,
    abrirCriacaoFluxo,
    fecharCriacaoFluxo,
    criarFluxoRapido,

    editandoFluxo,
    fluxoEmEdicao,
    nomeFluxoEdicao,
    setNomeFluxoEdicao,
    descricaoFluxoEdicao,
    setDescricaoFluxoEdicao,
    fluxoPadraoEdicao,
    setFluxoPadraoEdicao,
    fluxoEscopoIntegracoesModoEdicao,
    setFluxoEscopoIntegracoesModoEdicao,
    fluxoIntegracoesIdsEdicao,
    setFluxoIntegracoesIdsEdicao,
    alternarIntegracaoEscopoEdicao,
    existeOutroFluxoPadraoNaEmpresa,
    abrirEdicaoFluxo,
    fecharEdicaoFluxo,
    salvarEdicaoFluxo,

    encerrarInatividadeQuantidade,
    setEncerrarInatividadeQuantidade,
    encerrarInatividadeUnidade,
    setEncerrarInatividadeUnidade,
    encerrarInatividadeMensagem,
    setEncerrarInatividadeMensagem,
    limitarQuantidadeInatividade,
    corrigirQuantidadeMinimaInatividade,
  } = useFluxoForm({
    fluxos,
    fluxoSelecionado,
    setFluxoSelecionado,
    integracoesWhatsapp,
    limiteIntegracoesWhatsappFluxos,
    carregarFluxos,

    gatilhosNovoFluxo,
    resetarGatilhosNovoFluxo: resetarGatilhosNovoFluxoForm,
    resetarNovoGatilho: resetarNovoGatilhoForm,
    setGatilhosFluxo,
    carregarGatilhosFluxo,

    navegarParaFluxo: navegarParaFluxoForm,

    onErroEdicao: setErroEdicaoFluxo,
    onErroCriacao: setErroCriacaoFluxo,

    onClearError: () => setErro(""),
    onClearSuccess: () => setSucesso(""),
    onSuccess: setSucesso,
  });

  const [opcoesNode, setOpcoesNode] = useState<
    { valor: string; titulo: string }[]
  >([]);

  const [botoesNode, setBotoesNode] = useState<
    { id: string; titulo: string }[]
  >([]);
  const [redirectBotaoTextoNode, setRedirectBotaoTextoNode] =
    useState("Acessar");
  const [redirectUrlNode, setRedirectUrlNode] = useState("");

  const [gerandoDescricoesIaBloco, setGerandoDescricoesIaBloco] =
    useState(false);
  const [previaGeracaoDescricaoIa, setPreviaGeracaoDescricaoIa] =
    useState<PreviaGeracaoDescricaoIa | null>(null);
  const [capturaVariavelNode, setCapturaVariavelNode] = useState("nome");
  const [capturaTipoNode, setCapturaTipoNode] = useState("nome");
  const [capturaMensagemErroNode, setCapturaMensagemErroNode] = useState("");
  const [arquivoCamposExtracaoNode, setArquivoCamposExtracaoNode] = useState("");

  const [maxTentativasInvalidasNode, setMaxTentativasInvalidasNode] = useState("3");
  const [maxTentativasSemRespostaNode, setMaxTentativasSemRespostaNode] = useState("3");
  const [acaoExcessoTentativasNode, setAcaoExcessoTentativasNode] =
    useState("transferir_atendimento");
  const [setorExcessoTentativasNode, setSetorExcessoTentativasNode] =
    useState("");
  const [escopoFilaExcessoTentativasNode, setEscopoFilaExcessoTentativasNode] =
    useState<EscopoFilaNode>("setor");
  const [estrategiaExcessoTentativasNode, setEstrategiaExcessoTentativasNode] =
    useState<EstrategiaTransferenciaNode>("fila_setor");
  const [atendenteExcessoTentativasNode, setAtendenteExcessoTentativasNode] =
    useState("");
  const [
    incluirAdministradoresExcessoTentativasNode,
    setIncluirAdministradoresExcessoTentativasNode,
  ] = useState(false);
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

  const [arquivoInstrucaoIaNode, setArquivoInstrucaoIaNode] = useState("");
  const [arquivoMensagemErroNode, setArquivoMensagemErroNode] = useState("");

  const [agendarDisparoTemplateIdNode, setAgendarDisparoTemplateIdNode] = useState("");
  const [
    agendarDisparoTemplatesPorIntegracaoNode,
    setAgendarDisparoTemplatesPorIntegracaoNode,
  ] = useState<Record<string, string>>({});
  const [agendarDisparoQuantidadeNode, setAgendarDisparoQuantidadeNode] = useState("32");
  const [agendarDisparoUnidadeNode, setAgendarDisparoUnidadeNode] =
    useState<"horas" | "dias">("horas");
  const [agendarDisparoVariaveisNode, setAgendarDisparoVariaveisNode] = useState("");
  const [agendaIdNode, setAgendaIdNode] = useState("");
  const [agendaUsarContextoNode, setAgendaUsarContextoNode] = useState(false);
  const [agendaListarAgendamentosNode, setAgendaListarAgendamentosNode] =
    useState(false);
  const [agendaQuantidadeOpcoesNode, setAgendaQuantidadeOpcoesNode] = useState("6");
  const [agendaJanelaDiasNode, setAgendaJanelaDiasNode] = useState("14");
  const [agendaMensagemSemHorariosNode, setAgendaMensagemSemHorariosNode] =
    useState("No momento não encontrei horários disponíveis. Vou te encaminhar para um atendente.");
  const [agendaMensagemSemExpedienteNode, setAgendaMensagemSemExpedienteNode] =
    useState("Não há atendimento disponível em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos.");
  const [agendaMensagemDataInvalidaNode, setAgendaMensagemDataInvalidaNode] =
    useState("Essa data não é válida ou já passou. Informe uma data futura.\n\nQuando necessário, inclua também o ano.");
  const [agendaMensagemListarAgendamentosNode, setAgendaMensagemListarAgendamentosNode] =
    useState("Encontrei estes agendamentos. Responda com o número do agendamento que deseja cancelar ou remarcar:");
  const [agendaMensagemListarHorariosNode, setAgendaMensagemListarHorariosNode] =
    useState("Para {{agenda_data_nova}}, estes horários estão disponíveis.\n\nResponda com o número da opção desejada ou informe outra data:");
  const [
    agendaMensagemPreferenciaIndisponivelNode,
    setAgendaMensagemPreferenciaIndisponivelNode,
  ] = useState(
    "O horário {{agenda_preferencia_solicitada}} não está disponível em {{agenda_data_nova}}.\n\nEstas são as opções mais próximas:"
  );
  const [agendaMensagemConflitoNode, setAgendaMensagemConflitoNode] =
    useState("Esse horário acabou de ficar indisponível. Vamos escolher outro horário.");
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
  const {
    modalVariaveisAberto,
    variaveisPersonalizadas,
    loadingVariaveis,
    salvandoVariavel,
    erroVariavelModal,
    novaVariavelChave,
    setNovaVariavelChave,
    novaVariavelValor,
    setNovaVariavelValor,
    novaVariavelDescricao,
    setNovaVariavelDescricao,
    carregarVariaveisPersonalizadas,
    abrirModalGerenciarVariaveis,
    fecharModalGerenciarVariaveis,
    salvarVariavelPersonalizada,
    removerVariavelPersonalizada,
    aplicarVariavelNoBloco,
  } = useFluxoVariaveis({
    onAplicarMensagemToken: (token) => {
      setMensagemNode((atual) => {
        const texto = atual.trimEnd();
        return texto ? `${texto} ${token}` : token;
      });
    },

    onAplicarAgendarDisparo: (chave) => {
      setAgendarDisparoVariaveisNode((atual) =>
        preencherPrimeiraLinhaVariavelTemplate(atual, chave)
      );
    },

    onAplicarAgendaLembrete: (chave) => {
      setAgendaLembreteVariaveisNode((atual) =>
        preencherPrimeiraLinhaVariavelTemplate(atual, chave)
      );
    },

    onError: setErro,
    onClearError: () => setErro(""),
    onSuccess: setSucesso,
    onClearSuccess: () => setSucesso(""),
  });
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

  const nodeOrigemEdgeEditada = useMemo(() => {
    if (!edgeEditada) return null;

    return nodes.find((node) => node.id === edgeEditada.source) || null;
  }, [nodes, edgeEditada]);

  const edgeEditadaOrigemPerguntaLivreIa =
    String(nodeOrigemEdgeEditada?.data?.tipo_no || "") ===
    TIPO_NO_PERGUNTA_LIVRE_IA;

  const tipoNodeEditadoAtual = String(nodeEditado?.data?.tipo_no || "");
  const nodeEditadoPermiteGerarDescricoesIa =
    tipoNodeEditadoAtual === "pergunta_opcoes" ||
    tipoNodeEditadoAtual === TIPO_NO_PERGUNTA_LIVRE_IA ||
    tipoNodeEditadoAtual === "enviar_botoes";
  const quantidadeConexoesIaNodeEditado = nodeEditado
    ? edges.filter(
        (edge) =>
          edge.source === nodeEditado.id && conexaoPermiteDescricaoIa(edge)
      ).length
    : 0;

  function textoLimpoConexao(valor: unknown) {
    return String(valor || "").replace(/\s+/g, " ").trim();
  }

  function conexaoPermiteDescricaoIa(edge: Edge) {
    const data = edge.data as
      | {
          condicao_json?: Record<string, any>;
        }
      | undefined;
    const tipoCondicao = String(data?.condicao_json?.tipo || "");

    return (
      tipoCondicao !== "sempre" &&
      tipoCondicao !== "timeout_sem_resposta"
    );
  }

  function mensagemDoNodeParaContexto(node?: Node | null) {
    return textoLimpoConexao(
      (node?.data?.configuracao_json as Record<string, any> | undefined)
        ?.mensagem
    );
  }

  function textoOpcaoRespostaDaConexao(
    nodeOrigem?: Node | null,
    idResposta?: string | null
  ) {
    const id = textoLimpoConexao(idResposta);
    if (!id) return "";

    return (
      opcoesRespostaDoNo(nodeOrigem).find((opcao) => opcao.valor === id)
        ?.titulo || ""
    );
  }

  function resumoOutraConexaoParaContexto(edge: Edge) {
    const data = edge.data as
      | {
          condicao_json?: Record<string, any>;
          rotulo?: string | null;
          descricao_ia?: string | null;
        }
      | undefined;
    const condicao = data?.condicao_json || {};
    const nodeDestino = nodes.find((node) => node.id === edge.target) || null;
    const destino = nodeDestino ? tituloVisivelCard(nodeDestino.data) : "";
    const nome = textoLimpoConexao(
      data?.rotulo ||
        condicao.valor ||
        (typeof edge.label === "string" ? edge.label.replace(/^✨\s*/, "") : "")
    );

    if (nome && destino && nome !== destino) {
      return `${nome} -> ${destino}`;
    }

    return nome || destino || textoLimpoConexao(data?.descricao_ia);
  }

  function montarContextoDescricaoIaConexao(params?: {
    edge?: Edge | null;
    rotulo?: string | null;
    valor?: string | null;
    descricaoAtual?: string | null;
  }) {
    const edge = params?.edge || edgeEditada;
    const data = edge?.data as
      | {
          condicao_json?: Record<string, any>;
          rotulo?: string | null;
          descricao_ia?: string | null;
        }
      | undefined;
    const condicao = data?.condicao_json || {};
    const nodeOrigem = edge
      ? nodes.find((node) => node.id === edge.source) || null
      : nodeOrigemEdgeEditada;
    const nodeDestino = edge
      ? nodes.find((node) => node.id === edge.target) || null
      : null;
    const idResposta = textoLimpoConexao(
      params?.valor ?? condicao.valor ?? valorCondicao
    );
    const rotuloBase =
      textoLimpoConexao(params?.rotulo) ||
      textoLimpoConexao(data?.rotulo) ||
      textoLimpoConexao(
        typeof edge?.label === "string" ? edge.label.replace(/^✨\s*/, "") : ""
      ) ||
      textoLimpoConexao(rotuloConexao);
    const destinoTitulo = nodeDestino ? tituloVisivelCard(nodeDestino.data) : "";
    const destinoTipo = nodeDestino
      ? labelTipoNo(String(nodeDestino.data?.tipo_no || ""))
      : "";

    return {
      pergunta: mensagemDoNodeParaContexto(nodeOrigem),
      nomeConexao: rotuloBase,
      idResposta,
      textoOpcao: textoOpcaoRespostaDaConexao(nodeOrigem, idResposta),
      destinoTitulo,
      destinoMensagem: mensagemDoNodeParaContexto(nodeDestino),
      destinoTipo,
      outrasConexoes: edge
        ? edges
            .filter(
              (item) => item.source === edge.source && item.id !== edge.id
            )
            .map(resumoOutraConexaoParaContexto)
            .filter(Boolean)
        : [],
      descricaoAtual: textoLimpoConexao(
        params?.descricaoAtual ?? data?.descricao_ia
      ),
      blocoOrigem: nodeOrigem
        ? {
            id: nodeOrigem.id,
            tipo: String(nodeOrigem.data?.tipo_no || ""),
            titulo: tituloVisivelCard(nodeOrigem.data),
            mensagem: mensagemDoNodeParaContexto(nodeOrigem),
          }
        : null,
      blocoDestino: nodeDestino
        ? {
            id: nodeDestino.id,
            tipo: String(nodeDestino.data?.tipo_no || ""),
            titulo: destinoTitulo,
            mensagem: mensagemDoNodeParaContexto(nodeDestino),
          }
        : null,
    };
  }

  function gerarSugestaoDescricaoIaConexao(params?: {
    edge?: Edge | null;
    rotulo?: string | null;
    valor?: string | null;
  }) {
    const contexto = montarContextoDescricaoIaConexao(params);

    return gerarSugestaoDescricaoIAComContexto(contexto);
  }

  function montarPayloadDescricaoConexaoIa(
    edge: Edge,
    contexto: ReturnType<typeof montarContextoDescricaoIaConexao>
  ) {
    return {
      blocoOrigem: contexto.blocoOrigem,
      conexao: {
        id: edge.id,
        nome: contexto.nomeConexao,
        idResposta: contexto.idResposta,
        textoOpcao: contexto.textoOpcao,
        descricaoAtual: contexto.descricaoAtual,
      },
      blocoDestino: contexto.blocoDestino,
      outrasConexoes: contexto.outrasConexoes.map((nome) => ({ nome })),
    };
  }

  function estimarTokensDescricaoConexaoIa(
    payload: ReturnType<typeof montarPayloadDescricaoConexaoIa>
  ) {
    const tokensEntrada = Math.ceil(JSON.stringify(payload).length / 3.5);
    const base =
      TOKENS_PROMPT_FIXO_DESCRICAO_IA_ESTIMADOS +
      tokensEntrada +
      TOKENS_SAIDA_MAX_DESCRICAO_IA;

    return Math.ceil(base * 1.25);
  }

  function formatarTokens(valor: number) {
    return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(valor)));
  }

  function montarPreviaGeracaoDescricaoIa(params: {
    modo: "conexao" | "bloco";
    titulo: string;
    conexoes: Array<{
      edge: Edge;
      contexto?: ReturnType<typeof montarContextoDescricaoIaConexao>;
    }>;
  }): PreviaGeracaoDescricaoIa {
    const conexoes = params.conexoes.map((item) => {
      const contexto =
        item.contexto || montarContextoDescricaoIaConexao({ edge: item.edge });
      const edge = item.edge;
      const payload = montarPayloadDescricaoConexaoIa(edge, contexto);

      return {
        edgeId: edge.id,
        nome: rotuloFinalDescricaoIa(contexto),
        tokensEstimados: estimarTokensDescricaoConexaoIa(payload),
      };
    });
    const totalEstimado = conexoes.reduce(
      (total, item) => total + item.tokensEstimados,
      0
    );

    return {
      modo: params.modo,
      titulo: params.titulo,
      conexoes,
      tokensMin: Math.ceil(totalEstimado * 0.85),
      tokensMax: Math.ceil(totalEstimado * 1.15),
    };
  }

  async function solicitarDescricaoConexaoIa(
    edge: Edge,
    contexto: ReturnType<typeof montarContextoDescricaoIaConexao>
  ) {
    if (!fluxoSelecionado) {
      throw new Error("Selecione um fluxo primeiro.");
    }

    const res = await fetch("/api/automacoes/descricao-conexao-ia", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fluxoId: fluxoSelecionado.id,
        conexaoId: edge.id,
        contexto: montarPayloadDescricaoConexaoIa(edge, contexto),
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao gerar intenção com IA.");
    }

    const descricao = String(json.descricao || "").trim();

    if (!descricao) {
      throw new Error("A IA não retornou uma descrição válida.");
    }

    return descricao;
  }

  function rotuloFinalDescricaoIa(
    contexto: ReturnType<typeof montarContextoDescricaoIaConexao>,
    fallback = "Intencao IA"
  ) {
    return (
      textoLimpoConexao(contexto.nomeConexao) ||
      textoLimpoConexao(contexto.textoOpcao) ||
      textoLimpoConexao(contexto.idResposta) ||
      textoLimpoConexao(contexto.destinoTitulo) ||
      fallback
    );
  }

  function condicaoFinalDescricaoIa(
    edge: Edge,
    contexto: ReturnType<typeof montarContextoDescricaoIaConexao>
  ) {
    const data = edge.data as
      | {
          condicao_json?: Record<string, any>;
        }
      | undefined;
    const condicaoAtual = data?.condicao_json || {};
    const condicaoJson: Record<string, any> = {
      ...condicaoAtual,
      tipo: String(condicaoAtual.tipo || "resposta_contem"),
    };
    const idResposta = textoLimpoConexao(
      condicaoAtual.valor || contexto.idResposta
    );

    if (idResposta) {
      condicaoJson.valor = idResposta;
    } else {
      delete condicaoJson.valor;
    }

    return condicaoJson;
  }

  const templateAgendarDisparoSelecionado = useMemo(() => {
    return (
      templatesWhatsapp.find(
        (template) => template.id === agendarDisparoTemplateIdNode
      ) || null
    );
  }, [templatesWhatsapp, agendarDisparoTemplateIdNode]);

  const escopoIntegracoesFluxoSelecionado = useMemo(() => {
    return normalizarEscopoIntegracoesFluxo(
      fluxoSelecionado?.configuracao_json
    );
  }, [fluxoSelecionado?.configuracao_json]);

  const integracoesEscopoFluxoSelecionado = useMemo(() => {
    return obterIntegracoesDoEscopoFluxo(
      escopoIntegracoesFluxoSelecionado,
      integracoesWhatsapp
    );
  }, [escopoIntegracoesFluxoSelecionado, integracoesWhatsapp]);

  const agendarDisparoUsaTemplatesPorIntegracao = useMemo(() => {
    return usaTemplatesPorIntegracao(integracoesEscopoFluxoSelecionado);
  }, [integracoesEscopoFluxoSelecionado]);

  const templatesAgendarDisparoSelecionados = useMemo(() => {
    if (!agendarDisparoUsaTemplatesPorIntegracao) {
      return templateAgendarDisparoSelecionado
        ? [templateAgendarDisparoSelecionado]
        : [];
    }

    return integracoesEscopoFluxoSelecionado
      .map((integracao) => {
        const templateId =
          agendarDisparoTemplatesPorIntegracaoNode[integracao.id] || "";

        return (
          templatesWhatsapp.find((template) => template.id === templateId) ||
          null
        );
      })
      .filter((template): template is TemplateWhatsappOpcao => Boolean(template));
  }, [
    agendarDisparoUsaTemplatesPorIntegracao,
    agendarDisparoTemplatesPorIntegracaoNode,
    integracoesEscopoFluxoSelecionado,
    templateAgendarDisparoSelecionado,
    templatesWhatsapp,
  ]);

  const templateAgendarDisparoPreview = useMemo(() => {
    return (
      templateAgendarDisparoSelecionado ||
      templatesAgendarDisparoSelecionados[0] ||
      null
    );
  }, [
    templateAgendarDisparoSelecionado,
    templatesAgendarDisparoSelecionados,
  ]);

  const templateAgendaLembreteSelecionado = useMemo(() => {
    return (
      templatesWhatsapp.find(
        (template) => template.id === agendaLembreteTemplateIdNode
      ) || null
    );
  }, [templatesWhatsapp, agendaLembreteTemplateIdNode]);

  const opcoesVariaveisTemplate = useMemo<TemplateVariableOption[]>(() => {
    const chavesAdicionadas = new Set<string>();
    const opcoes: TemplateVariableOption[] = [];

    for (const variavel of VARIAVEIS_FIXAS_SISTEMA) {
      if (chavesAdicionadas.has(variavel.chave)) continue;

      chavesAdicionadas.add(variavel.chave);
      opcoes.push({
        key: variavel.chave,
        description: variavel.descricao,
        category: "Fixa",
      });
    }

    for (const variavel of variaveisPersonalizadas) {
      const chave = normalizarEntradaVariavelTemplate(variavel.chave);
      if (!variavel.ativo || !chave || chavesAdicionadas.has(chave)) continue;

      chavesAdicionadas.add(chave);
      opcoes.push({
        key: chave,
        description:
          variavel.descricao?.trim() ||
          "Variável personalizada cadastrada pela empresa.",
        category: "Personalizada",
      });
    }

    return opcoes;
  }, [variaveisPersonalizadas]);

  const opcoesVariaveisFluxo = useMemo<TemplateVariableOption[]>(() => {
    const opcoes = [...opcoesVariaveisTemplate];
    const chavesAdicionadas = new Set(opcoes.map((opcao) => opcao.key));

    for (const node of nodes) {
      if (String(node.data?.tipo_no || "") !== "capturar_resposta") continue;

      const configuracao = (node.data?.configuracao_json || {}) as Record<
        string,
        unknown
      >;
      const chave = normalizarEntradaVariavelTemplate(
        String(configuracao.variavel || "")
      );

      if (!chave || chavesAdicionadas.has(chave)) continue;

      const titulo = String(node.data?.titulo || "Capturar resposta").trim();
      chavesAdicionadas.add(chave);
      opcoes.push({
        key: chave,
        description: `Resposta armazenada pelo bloco "${titulo}".`,
        category: "Fluxo",
      });
    }

    return opcoes;
  }, [nodes, opcoesVariaveisTemplate]);

  const opcoesVariaveisAgendamento = useMemo<TemplateVariableOption[]>(() => {
    const opcoes = [...opcoesVariaveisFluxo];
    const chavesAdicionadas = new Set(opcoes.map((opcao) => opcao.key));
    const variaveisAgendamento: TemplateVariableOption[] = [
      {
        key: "agenda_data",
        description: "Data do agendamento formatada para exibição.",
        category: "Agendamento",
      },
      {
        key: "agenda_hora",
        description: "Hora do agendamento formatada para exibição.",
        category: "Agendamento",
      },
      {
        key: "agenda_nome",
        description: "Nome do calendário em que o horário foi reservado.",
        category: "Agendamento",
      },
      {
        key: "agenda_inicio_at",
        description: "Data e hora inicial completas do agendamento.",
        category: "Agendamento",
      },
      {
        key: "agenda_fim_at",
        description: "Data e hora final completas do agendamento.",
        category: "Agendamento",
      },
      {
        key: "agenda_agendamento_id",
        description: "Identificador único do agendamento criado.",
        category: "Agendamento",
      },
      {
        key: "agenda_id",
        description: "Identificador da agenda utilizada.",
        category: "Agendamento",
      },
    ];

    for (const variavel of variaveisAgendamento) {
      if (chavesAdicionadas.has(variavel.key)) continue;
      chavesAdicionadas.add(variavel.key);
      opcoes.push(variavel);
    }

    return opcoes;
  }, [opcoesVariaveisFluxo]);

  const previewTemplateAgendarDisparo = useMemo(() => {
    return montarPreviewTemplateWhatsapp(
      templateAgendarDisparoPreview,
      agendarDisparoVariaveisNode
    );
  }, [templateAgendarDisparoPreview, agendarDisparoVariaveisNode]);

  const previewTemplateAgendaLembrete = useMemo(() => {
    return montarPreviewTemplateWhatsapp(
      templateAgendaLembreteSelecionado,
      agendaLembreteVariaveisNode
    );
  }, [templateAgendaLembreteSelecionado, agendaLembreteVariaveisNode]);

  const totalVariaveisTemplateAgendarDisparo = useMemo(() => {
    return contarVariaveisTemplateWhatsapp(templateAgendarDisparoPreview);
  }, [templateAgendarDisparoPreview]);

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
      conexao.rotulo ||
      conexao.condicao_json?.valor ||
      (usarIA ? "Intencao IA" : "");
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
        fill: "var(--crm-ui-private-content-hex-0f172a)",
        fontSize: 10,
        fontWeight: 700,
        transform: `translateY(${offsetY}px)`,
      },

      labelBgStyle: {
        fill: "var(--crm-text-inverse)",
        fillOpacity: 0.92,
        transform: `translateY(${offsetY}px)`,
      },

      labelBgPadding: [4, 2],


      labelBgBorderRadius: 6,
      labelShowBg: true,
      style: {
        stroke: "var(--crm-ui-private-content-hex-cbd5e1)",
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

  function normalizarStatusFluxoAssistente(
    status: string
  ): Fluxo["status"] {
    if (
      status === "ativo" ||
      status === "pausado" ||
      status === "arquivado"
    ) {
      return status;
    }

    return "rascunho";
  }

  function normalizarFluxoCriadoAssistente(
    fluxoCriado: AssistenteFluxosFluxoCriado
  ): Fluxo {
    return {
      id: fluxoCriado.id,
      nome: fluxoCriado.nome,
      descricao: fluxoCriado.descricao || null,
      status: normalizarStatusFluxoAssistente(fluxoCriado.status),
      canal: fluxoCriado.canal || "whatsapp",
      fluxo_padrao: fluxoCriado.fluxo_padrao === true,
      created_at: fluxoCriado.created_at,
      configuracao_json: (fluxoCriado.configuracao_json ||
        {}) as Fluxo["configuracao_json"],
    };
  }

  function abrirFluxoCriadoPeloAssistente(
    fluxoCriado: AssistenteFluxosFluxoCriado
  ) {
    const fluxoNormalizado = normalizarFluxoCriadoAssistente(fluxoCriado);

    setFluxos((atuais) => [
      fluxoNormalizado,
      ...atuais.filter((item) => item.id !== fluxoNormalizado.id),
    ]);
    setFluxoSelecionado(fluxoNormalizado);
    setEditandoNodeId(null);
    setEditandoEdgeId(null);
    setAssistenteFluxosAberto(false);
    setErro("");
    setSucesso(
      `Fluxo "${fluxoNormalizado.nome}" criado com IA e salvo como rascunho.`
    );
    router.push(`/fluxos?fluxo=${encodeURIComponent(fluxoNormalizado.id)}`);
  }

  useEffect(() => {
    carregarFluxos();
    carregarSetores();
    carregarMidias();
    carregarIntegracoesWhatsapp();
    carregarTemplatesWhatsapp();
    carregarAgendasOpcoes();
    carregarVariaveisPersonalizadas();
  }, []);

  useEffect(() => {
    if (fluxoSelecionado?.id) {
      setRespostasPreviaWhatsapp({});
      carregarEstrutura(fluxoSelecionado.id);
    }
  }, [fluxoSelecionado?.id]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const nodeOrigem = nodes.find((node) => node.id === connection.source);
      const nodeDestino = nodes.find((node) => node.id === connection.target);
      const tipoOrigem = String(nodeOrigem?.data?.tipo_no || "");
      const usarIaPadrao = tipoOrigem === TIPO_NO_PERGUNTA_LIVRE_IA;
      const opcaoRespostaPadrao = proximaOpcaoRespostaDisponivel(
        nodeOrigem,
        edges
      );

      const tipoCondicaoPadrao = tipoCondicaoPadraoPorTipoNo(tipoOrigem);
      const rotuloPadrao =
        opcaoRespostaPadrao?.titulo ||
        opcaoRespostaPadrao?.valor ||
        (usarIaPadrao
          ? rotuloConexaoIaPorDestino(nodeDestino)
          : rotuloPadraoPorTipoNo(tipoOrigem));
      const ehSempreSeguir = tipoCondicaoPadrao === "sempre";
      const id = criarIdTemporario("edge");
      const offsetY = offsetLabelConexao(id);
      const descricaoIaPadrao = usarIaPadrao
        ? gerarSugestaoDescricaoIAComContexto({
            pergunta: mensagemDoNodeParaContexto(nodeOrigem),
            nomeConexao: rotuloPadrao,
            idResposta: opcaoRespostaPadrao?.valor || "",
            textoOpcao: opcaoRespostaPadrao?.titulo || "",
            destinoTitulo: nodeDestino ? tituloVisivelCard(nodeDestino.data) : "",
            destinoMensagem: mensagemDoNodeParaContexto(nodeDestino),
            destinoTipo: nodeDestino
              ? labelTipoNo(String(nodeDestino.data?.tipo_no || ""))
              : "",
            outrasConexoes: edges
              .filter((edge) => edge.source === connection.source)
              .map(resumoOutraConexaoParaContexto)
              .filter(Boolean),
          })
        : "";
      const novaConexao: Edge = {
        ...connection,
        id,
        type: "default",
        pathOptions: {
          curvature: 0.75,
        },
        animated: true,
        label: ehSempreSeguir
          ? ""
          : usarIaPadrao
          ? `✨ ${rotuloPadrao}`
          : rotuloPadrao,
        labelShowBg: true,

        labelStyle: {
          fill: "var(--crm-ui-private-content-hex-0f172a)",
          fontSize: 10,
          fontWeight: 700,
          transform: `translateY(${offsetY}px)`,
        },

        labelBgStyle: {
          fill: "var(--crm-text-inverse)",
          fillOpacity: 0.92,
          transform: `translateY(${offsetY}px)`,
        },

        labelBgPadding: [4, 2],
        labelBgBorderRadius: 6,

        style: {
          stroke: "var(--crm-ui-private-content-hex-cbd5e1)",
          strokeWidth: 2,
          strokeDasharray: "6 6"
        },

        data: {
          rotulo: rotuloPadrao,
          condicao_json: opcaoRespostaPadrao
            ? {
                tipo: tipoCondicaoPadrao,
                valor: opcaoRespostaPadrao.valor,
              }
            : {
                tipo: tipoCondicaoPadrao,
              },
          usar_ia: usarIaPadrao,
          descricao_ia: descricaoIaPadrao,
        },
      } as Edge;

      setEdges((eds) => addEdge(novaConexao, eds));
    },
    [nodes, edges, setEdges]
  );



  function abrirFluxo(fluxo: Fluxo) {
    setFluxoSelecionado(fluxo);
    router.push(`/fluxos?fluxo=${encodeURIComponent(fluxo.id)}`);
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
          : tipoNo === TIPO_NO_PERGUNTA_LIVRE_IA
          ? {
              mensagem: "Como posso te ajudar?",
              delay_segundos: 3,
              max_tentativas_invalidas: 3,
              max_tentativas_sem_resposta: 3,
              acao_excesso_tentativas: "transferir_atendimento",
              escopo_fila_excesso_tentativas: fluxoSistemaCalendario
                ? "geral"
                : "setor",
              setor_excesso_tentativas: null,
              estrategia_excesso_tentativas: "fila_setor",
              atendente_excesso_tentativas: null,
              incluir_administradores_excesso_tentativas: false,
              mensagem_excesso_tentativas:
                "Nao consegui continuar o atendimento automatico. Vou te encaminhar para um atendente.",
              notificar_excesso_tentativas: true,
              notificar_email_excesso_tentativas: true,
            }
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
              escopo_fila_excesso_tentativas: fluxoSistemaCalendario
                ? "geral"
                : "setor",
              setor_excesso_tentativas: null,
              estrategia_excesso_tentativas: "fila_setor",
              atendente_excesso_tentativas: null,
              incluir_administradores_excesso_tentativas: false,
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
              escopo_fila_excesso_tentativas: fluxoSistemaCalendario
                ? "geral"
                : "setor",
              setor_excesso_tentativas: null,
              estrategia_excesso_tentativas: "fila_setor",
              atendente_excesso_tentativas: null,
              incluir_administradores_excesso_tentativas: false,
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
                "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}.",
              mensagem_listar_agendamentos:
                "Encontrei estes agendamentos. Responda com o número do agendamento que deseja cancelar ou remarcar:",
              mensagem_nao_encontrado:
                "No momento não encontrei horários disponíveis. Vou te encaminhar para um atendente.",
            }
          : tipoNo === "agenda_escolher_horario"
          ? {
              agenda_id: "",
              usar_agenda_contexto: false,
              mensagem:
                "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira.",
              mensagem_listar_horarios:
                "Para {{agenda_data_nova}}, estes horários estão disponíveis.\n\nResponda com o número da opção desejada ou informe outra data:",
              mensagem_preferencia_indisponivel:
                "O horário {{agenda_preferencia_solicitada}} não está disponível em {{agenda_data_nova}}.\n\nEstas são as opções mais próximas:",
              quantidade_opcoes: 6,
              janela_dias: 14,
              mensagem_data_invalida:
                "Essa data não é válida ou já passou. Informe uma data futura.\n\nQuando necessário, inclua também o ano.",
              mensagem_sem_horarios:
                "Não encontrei horários disponíveis em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos.",
              mensagem_sem_expediente:
                "Não há atendimento disponível em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos.",
              max_tentativas_invalidas: 3,
              max_tentativas_sem_resposta: 3,
              acao_excesso_tentativas: "transferir_atendimento",
              escopo_fila_excesso_tentativas: fluxoSistemaCalendario
                ? "geral"
                : "setor",
              setor_excesso_tentativas: null,
              estrategia_excesso_tentativas: "fila_setor",
              atendente_excesso_tentativas: null,
              incluir_administradores_excesso_tentativas: false,
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
                "Agendado! Seu horário ficou marcado para {{agenda_data}} às {{agenda_hora}}. Qualquer dúvida e so entrar em contato.",
              mensagem_conflito:
                "Esse horário acabou de ficar indisponível. Vamos escolher outro horário.",
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
                "Esse horário acabou de ficar indisponível.\n\nEscolha outra opção para continuarmos.",
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
          : tipoNo === "transferir_setor"
          ? {
              mensagem: "Vou te encaminhar para um atendente.",
              escopo_fila: fluxoSistemaCalendario ? "geral" : "setor",
              setor_id: "",
              estrategia_transferencia: "fila_setor",
              atendente_id: null,
              incluir_administradores_distribuicao: false,
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
          stroke: "var(--crm-ui-private-content-hex-cbd5e1)",
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
    marcarNodeSelecionadoNos(nodeId);

    if (nodeId) {
      limparSelecaoVisualConexoes();
    }
  }

  function abrirEdicaoNo(node: Node) {
    const configuracaoJson = node.data?.configuracao_json as
      | Record<string, any>
      | undefined;

    marcarNodeSelecionado(node.id);
    editarNode(node.id);
    setTipoNodeEdicao(String(node.data?.tipo_no || ""));

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
    setEscopoFilaTransferenciaNode(
      normalizarEscopoFilaNode(
        configuracaoJson?.escopo_fila,
        configuracaoJson?.setor_id,
        fluxoSistemaCalendario
      )
    );
    setEstrategiaTransferenciaNode(
      normalizarEstrategiaTransferenciaNode(
        configuracaoJson?.estrategia_transferencia,
        configuracaoJson?.atendente_id
      )
    );
    setAtendenteDestinoNode(String(configuracaoJson?.atendente_id || ""));
    setIncluirAdministradoresTransferenciaNode(
      configuracaoMarcada(
        configuracaoJson?.incluir_administradores_distribuicao
      )
    );
    
    setCapturaVariavelNode(String(configuracaoJson?.variavel || "nome"));
    setCapturaTipoNode(String(configuracaoJson?.tipo_captura || "nome"));
    setCapturaMensagemErroNode(
      String(
        configuracaoJson?.mensagem_erro ||
          "Não consegui identificar essa informação. Por favor, envie novamente."
      )
    );
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
    setEscopoFilaExcessoTentativasNode(
      normalizarEscopoFilaNode(
        configuracaoJson?.escopo_fila_excesso_tentativas,
        configuracaoJson?.setor_excesso_tentativas,
        fluxoSistemaCalendario
      )
    );
    setEstrategiaExcessoTentativasNode(
      normalizarEstrategiaTransferenciaNode(
        configuracaoJson?.estrategia_excesso_tentativas,
        configuracaoJson?.atendente_excesso_tentativas
      )
    );
    setAtendenteExcessoTentativasNode(
      String(configuracaoJson?.atendente_excesso_tentativas || "")
    );
    setIncluirAdministradoresExcessoTentativasNode(
      configuracaoMarcada(
        configuracaoJson?.incluir_administradores_excesso_tentativas
      )
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
    setAgendarDisparoTemplatesPorIntegracaoNode(
      normalizarTemplatesPorIntegracao(
        configuracaoJson?.templates_por_integracao
      )
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
    setAgendaUsarContextoNode(
      configuracaoJson?.usar_agenda_contexto === true ||
        configuracaoJson?.usar_agenda_contexto === "true"
    );
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
          "No momento não encontrei nenhum horário marcado. Vou te encaminhar para um atendente."
      )
    );
    setAgendaMensagemSemExpedienteNode(
      String(
        configuracaoJson?.mensagem_sem_expediente ||
          "Não há atendimento disponível em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos."
      )
    );
    setAgendaMensagemDataInvalidaNode(
      String(
        configuracaoJson?.mensagem_data_invalida ||
          "Essa data não é válida ou já passou. Informe uma data futura.\n\nQuando necessário, inclua também o ano."
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
          "Para {{agenda_data_nova}}, estes horários estão disponíveis.\n\nResponda com o número da opção desejada ou informe outra data:"
      )
    );
    setAgendaMensagemPreferenciaIndisponivelNode(
      String(
        configuracaoJson?.mensagem_preferencia_indisponivel ||
          "O horário {{agenda_preferencia_solicitada}} não está disponível em {{agenda_data_nova}}.\n\nEstas são as opções mais próximas:"
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
  editarConexao(edge.id);

  setRotuloConexao(String(data?.rotulo || ""));
  setValorCondicao(String(condicao.valor || ""));

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
      gerarSugestaoDescricaoIaConexao({
        edge,
        rotulo: data?.rotulo || edge.label?.toString() || "",
        valor: respostaEsperada,
      })
    );
  } else {
    setDescricaoIaConexao(String(data.descricao_ia || ""));
  }
  
  const nodeOrigem = nodes.find((node) => node.id === edge.source);
  const tipoOrigem = String(nodeOrigem?.data?.tipo_no || "");
  const tipoPadrao = tipoCondicaoPadraoPorTipoNo(tipoOrigem);
  const tipoCondicaoAtual = String(condicao.tipo || tipoPadrao);
  const origemPerguntaLivreIa = tipoOrigem === TIPO_NO_PERGUNTA_LIVRE_IA;
  const usarIaPadrao =
    origemPerguntaLivreIa &&
    tipoCondicaoAtual !== "sempre" &&
    tipoCondicaoAtual !== "timeout_sem_resposta";

  setUsarIaConexao(Boolean(data?.usar_ia) || usarIaPadrao);
  setTipoCondicaoConexao(tipoCondicaoAtual);
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

async function aplicarEdicaoNoInterno() {
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

  if (tipoNodeEdicao === "transferir_setor") {
      if (escopoFilaTransferenciaNode === "setor" && !setorDestino) {
        setErro("Selecione o setor destino da transferência.");
        return;
      }

      if (
        escopoFilaTransferenciaNode === "setor" &&
        estrategiaTransferenciaNode === "atendente_especifico"
      ) {
        const atendenteValido = atendentes.some(
          (atendente) =>
            atendente.id === atendenteDestinoNode &&
            (atendente.is_administrador === true ||
              atendente.setor_ids.includes(setorDestino))
        );

        if (!atendenteValido) {
          setErro("Selecione um atendente ativo vinculado ao setor destino.");
          return;
        }
      }
    }

    if (
      acaoExcessoTentativasNode === "transferir_atendimento" &&
      [
        "pergunta_opcoes",
        TIPO_NO_PERGUNTA_LIVRE_IA,
        "enviar_botoes",
        "capturar_resposta",
        "agenda_buscar_agendamento",
        "agenda_escolher_horario",
        "avaliacao",
        "interpretar_arquivo_ia",
      ].includes(tipoNodeEdicao)
    ) {
      if (
        escopoFilaExcessoTentativasNode === "setor" &&
        !setorExcessoTentativasNode
      ) {
        setErro("Selecione o setor para a transferência por excesso de tentativas ou timeout.");
        return;
      }

      if (
        escopoFilaExcessoTentativasNode === "setor" &&
        estrategiaExcessoTentativasNode === "atendente_especifico"
      ) {
        const atendenteValido = atendentes.some(
          (atendente) =>
            atendente.id === atendenteExcessoTentativasNode &&
            (atendente.is_administrador === true ||
              atendente.setor_ids.includes(setorExcessoTentativasNode))
        );

        if (!atendenteValido) {
          setErro("Selecione um atendente ativo do setor para a transferência por tentativas.");
          return;
        }
      }
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

  if (
    tipoNodeEdicao === "agendar_disparo" &&
    !agendarDisparoUsaTemplatesPorIntegracao &&
    (!templateAgendarDisparoSelecionado ||
      !templateWhatsappAprovado(templateAgendarDisparoSelecionado))
  ) {
    setErro("Selecione um template WhatsApp aprovado.");
    return;
  }

  if (tipoNodeEdicao === "agendar_disparo") {
    const templatesParaValidar = agendarDisparoUsaTemplatesPorIntegracao
      ? integracoesEscopoFluxoSelecionado.map((integracao) => {
          const templateId =
            agendarDisparoTemplatesPorIntegracaoNode[integracao.id] || "";
          const template =
            templatesWhatsapp.find((item) => item.id === templateId) || null;

          return { integracao, template };
        })
      : [
          {
            integracao: integracoesEscopoFluxoSelecionado[0] || null,
            template: templateAgendarDisparoSelecionado,
          },
        ];

    for (const item of templatesParaValidar) {
      const template = item.template;
      const rotuloIntegracao = item.integracao
        ? rotuloIntegracaoWhatsapp(item.integracao)
        : "integracao";

      if (!template || !templateWhatsappAprovado(template)) {
        setErro(
          agendarDisparoUsaTemplatesPorIntegracao
            ? `Selecione um template WhatsApp aprovado para ${rotuloIntegracao}.`
            : "Selecione um template WhatsApp aprovado."
        );
        return;
      }

      if (
        item.integracao &&
        !templateCompativelComIntegracao(template, item.integracao)
      ) {
        setErro(`O template selecionado nao pertence a WABA de ${rotuloIntegracao}.`);
        return;
      }

      if (templateWhatsappTemCabecalhoMidia(template)) {
        setErro(
          "O template selecionado possui cabecalho de midia. Use um template aprovado apenas com texto para agendar disparos."
        );
        return;
      }

      const totalVariaveisTemplate = contarVariaveisTemplateWhatsapp(template);
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

    if (tipoNodeEdicao === "agenda_escolher_horario") {
      const usarCalendarioContexto =
        fluxoEhSistemaCalendario(fluxoSelecionado) ||
        agendaUsarContextoNode;

      if (
        usarCalendarioContexto &&
        !fluxoEhSistemaCalendario(fluxoSelecionado) &&
        !fluxoTemBuscaQualquerCalendario
      ) {
        setErro(
          'O bloco "Escolher horário" só pode usar Calendário do contexto quando existir um bloco "Buscar agendamento" configurado como "Qualquer calendário".'
        );
        return;
      }

      if (!usarCalendarioContexto && !agendaIdNode.trim()) {
        setErro(
          'Selecione um calendário ativo no bloco "Escolher horário".'
        );
        return;
      }
    }

    setErro("");

      const nodesAtualizados = nodes.map((node) => {
      if (node.id !== editandoNodeId) return node;

      const tipoAtual = String(node.data?.tipo_no || "enviar_texto");
      const tipoFinal = tipoAtual === "inicio" ? "inicio" : tipoNodeEdicao;

      const configuracao_json: Record<string, any> = {};

      if (
        tipoFinal === "enviar_texto" ||
        tipoFinal === "pergunta_opcoes" ||
        tipoFinal === TIPO_NO_PERGUNTA_LIVRE_IA ||
        tipoFinal === "enviar_botoes" ||
        tipoFinal === "botao_redirect" ||
        tipoFinal === "enviar_imagem" ||
        tipoFinal === "enviar_video" ||
        tipoFinal === "enviar_audio" ||
        tipoFinal === "enviar_arquivo" ||
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
        configuracao_json.templates_por_integracao =
          agendarDisparoTemplatesPorIntegracaoNode;
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
        configuracao_json.agenda_id = fluxoSistemaCalendario ? "" : agendaIdNode;
        configuracao_json.usar_agendamento_contexto = fluxoSistemaCalendario;
        configuracao_json.status_busca = ["agendado", "confirmado"];
        configuracao_json.listar_para_escolha = agendaListarAgendamentosNode;
        configuracao_json.quantidade_opcoes = Math.max(
          1,
          Math.min(10, Number(agendaQuantidadeOpcoesNode || 6))
        );
        configuracao_json.mensagem_encontrado =
          mensagemNode.trim() ||
          "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}.";
        configuracao_json.mensagem_listar_agendamentos =
          agendaMensagemListarAgendamentosNode.trim() ||
          "Encontrei estes agendamentos. Responda com o numero do agendamento que deseja cancelar ou remarcar:";
        configuracao_json.mensagem_nao_encontrado =
          agendaMensagemSemHorariosNode.trim() ||
          "No momento não encontrei horários disponíveis. Vou te encaminhar para um atendente.";
      }

      if (tipoFinal === "agenda_escolher_horario") {
        const usarCalendarioContexto =
          fluxoSistemaCalendario || agendaUsarContextoNode;

        configuracao_json.agenda_id = usarCalendarioContexto
          ? ""
          : agendaIdNode;

        configuracao_json.usar_agenda_contexto = usarCalendarioContexto;
        configuracao_json.mensagem =
          mensagemNode.trim() ||
          "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira.";
        configuracao_json.mensagem_listar_horarios =
          agendaMensagemListarHorariosNode.trim() ||
          "Para {{agenda_data_nova}}, estes horários estão disponíveis.\n\nResponda com o número da opção desejada ou informe outra data:";
        configuracao_json.mensagem_preferencia_indisponivel =
          agendaMensagemPreferenciaIndisponivelNode.trim() ||
          "O horário {{agenda_preferencia_solicitada}} não está disponível em {{agenda_data_nova}}.\n\nEstas são as opções mais próximas:";
        configuracao_json.mensagem_data_invalida =
          agendaMensagemDataInvalidaNode.trim() ||
          "Essa data não é válida ou já passou. Informe uma data futura.\n\nQuando necessário, inclua também o ano.";
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
          "Não encontrei horários disponíveis em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos.";
        configuracao_json.mensagem_sem_expediente =
          agendaMensagemSemExpedienteNode.trim() ||
          "Não há atendimento disponível em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos.";
      }

      if (tipoFinal === "agenda_criar_agendamento") {
        configuracao_json.agenda_id = agendaIdNode;
        configuracao_json.status_inicial =
          agendaStatusAgendamentoNode === "confirmado" ? "confirmado" : "agendado";
        configuracao_json.mensagem =
          mensagemNode.trim() ||
          "Agendado! Seu horário ficou marcado para {{agenda_data}} às {{agenda_hora}}. Qualquer dúvida e so entrar em contato.";
        configuracao_json.mensagem_conflito =
          agendaMensagemConflitoNode.trim() ||
          "Esse horário acabou de ficar indisponível. Vamos escolher outro horário.";
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
          "Esse horário acabou de ficar indisponível.\n\nEscolha outra opção para continuarmos.";
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
        tipoFinal === TIPO_NO_PERGUNTA_LIVRE_IA ||
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

        configuracao_json.escopo_fila_excesso_tentativas =
          escopoFilaExcessoTentativasNode;
        configuracao_json.setor_excesso_tentativas =
          escopoFilaExcessoTentativasNode === "setor"
            ? setorExcessoTentativasNode || null
            : null;
        configuracao_json.estrategia_excesso_tentativas =
          estrategiaDistribuicaoDisponivel(
            estrategiaExcessoTentativasNode,
            setorExcessoTentativasNode,
            incluirAdministradoresExcessoTentativasNode
          );
        configuracao_json.incluir_administradores_excesso_tentativas =
          escopoFilaExcessoTentativasNode === "setor"
            ? incluirAdministradoresExcessoTentativasNode
            : false;
        configuracao_json.atendente_excesso_tentativas =
          escopoFilaExcessoTentativasNode === "setor" &&
          estrategiaExcessoTentativasNode === "atendente_especifico"
            ? atendenteExcessoTentativasNode || null
            : null;

        configuracao_json.mensagem_excesso_tentativas =
          mensagemExcessoTentativasNode.trim() ||
          "Não consegui continuar o atendimento automático. Vou te encaminhar para um atendente.";
        configuracao_json.notificar_excesso_tentativas =
          notificarExcessoTentativasNode;

        configuracao_json.notificar_email_excesso_tentativas =
          notificarEmailExcessoTentativasNode;
      }

      if (tipoFinal === "transferir_setor") {
        configuracao_json.escopo_fila = escopoFilaTransferenciaNode;
        configuracao_json.setor_id =
          escopoFilaTransferenciaNode === "setor" ? setorDestino : null;
        configuracao_json.estrategia_transferencia =
          estrategiaDistribuicaoDisponivel(
            estrategiaTransferenciaNode,
            setorDestino,
            incluirAdministradoresTransferenciaNode
          );
        configuracao_json.incluir_administradores_distribuicao =
          escopoFilaTransferenciaNode === "setor"
            ? incluirAdministradoresTransferenciaNode
            : false;
        configuracao_json.atendente_id =
          escopoFilaTransferenciaNode === "setor" &&
          estrategiaTransferenciaNode === "atendente_especifico"
            ? atendenteDestinoNode || null
            : null;
      }

      if (
        tipoFinal === "enviar_imagem" ||
        tipoFinal === "enviar_video" ||
        tipoFinal === "enviar_audio" ||
        tipoFinal === "enviar_arquivo"
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
    });

  setNodes(nodesAtualizados);

  await salvarEstrutura({
    nodesParaSalvar: nodesAtualizados,
    edgesParaSalvar: edges,
    mensagemSucesso: "Bloco atualizado e fluxo salvo com sucesso.",
  });

  fecharPainelEdicao();
}

async function aplicarEdicaoConexao() {
  if (!editandoEdgeId) return;

  const ehSempreSeguir = tipoCondicaoConexao === "sempre";
  const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";

  if (ehTimeout) {
    const quantidade = Math.max(1, Number(timeoutQuantidade || 1));
    const multiplicador = timeoutUnidade === "horas" ? 3600 : 60;
    const timeoutSegundos = quantidade * multiplicador;

    if (timeoutSegundos < 300) {
      setErro("O tempo mínimo para timeout sem resposta é de 5 minutos.");
      return;
    }

    const LIMITE_TIMEOUT_SEGUNDOS = 79200; // 22 horas

    if (timeoutSegundos > LIMITE_TIMEOUT_SEGUNDOS) {
      setErro("Para mensagens comuns, o tempo máximo sem resposta é de 22 horas.");
      return;
    }
  }

  setErro("");

  const edgesAtualizados = edges.map((edge) => {
    if (edge.id !== editandoEdgeId) return edge;

    const usarIaFinal = usarIaConexao && !ehSempreSeguir && !ehTimeout;

    const labelBase = ehTimeout
      ? `Sem resposta em ${timeoutQuantidade} ${timeoutUnidade}`
      : rotuloConexao || valorCondicao || "Condição";

    const labelFinal =
      usarIaFinal
        ? `✨ ${labelBase}`
        : labelBase;

    let condicaoJson: Record<string, any> = {};

    if (ehSempreSeguir) {
      condicaoJson = {
        tipo: "sempre",
      };
    } else if (ehTimeout) {
      const quantidade = Math.max(1, Number(timeoutQuantidade || 1));
      const multiplicador = timeoutUnidade === "horas" ? 3600 : 60;
      const timeoutSegundos = quantidade * multiplicador;

      condicaoJson = {
        tipo: "timeout_sem_resposta",
        timeout_segundos: timeoutSegundos,
        tempo_quantidade: quantidade,
        tempo_unidade: timeoutUnidade,
        status_envio: statusEnvioTimeout,
      };
    } else if (valorCondicao || usarIaFinal) {
      condicaoJson = {
        tipo: tipoCondicaoConexao,
      };

      if (valorCondicao) {
        condicaoJson.valor = valorCondicao;
      }
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
        usar_ia: usarIaFinal,
        descricao_ia: descricaoIaConexao.trim(),
      },
    };
  });

  setEdges(edgesAtualizados);

  await salvarEstrutura({
    nodesParaSalvar: nodes,
    edgesParaSalvar: edgesAtualizados,
    mensagemSucesso: "Conexão atualizada e fluxo salvo com sucesso.",
  });

  fecharPainelEdicao();
}

function gerarDescricaoConexaoComIa() {
  if (!edgeEditada) return;

  const ehSempreSeguir = tipoCondicaoConexao === "sempre";
  const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";

  if (ehSempreSeguir || ehTimeout) {
    setErro("Esta condição não usa interpretação por IA.");
    return;
  }

  if (!fluxoSelecionado) {
    setErro("Selecione um fluxo primeiro.");
    return;
  }

  const contexto = montarContextoDescricaoIaConexao({
    edge: edgeEditada,
    rotulo: rotuloConexao,
    valor: valorCondicao,
    descricaoAtual: descricaoIaConexao,
  });

  setErro("");
  setPreviaGeracaoDescricaoIa(
    montarPreviaGeracaoDescricaoIa({
      modo: "conexao",
      titulo: "Gerar intenção com IA",
      conexoes: [{ edge: edgeEditada, contexto }],
    })
  );
}

async function executarGeracaoDescricaoConexaoComIa() {
  if (!edgeEditada) return;

  const ehSempreSeguir = tipoCondicaoConexao === "sempre";
  const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";

  if (ehSempreSeguir || ehTimeout) {
    setErro("Esta condição não usa interpretação por IA.");
    return;
  }

  if (!fluxoSelecionado) {
    setErro("Selecione um fluxo primeiro.");
    return;
  }

  try {
    setGerandoDescricaoIaConexao(true);
    setErro("");
    setSucesso("");
    setPreviaGeracaoDescricaoIa(null);

    const contexto = montarContextoDescricaoIaConexao({
      edge: edgeEditada,
      rotulo: rotuloConexao,
      valor: valorCondicao,
      descricaoAtual: descricaoIaConexao,
    });

    const descricao = await solicitarDescricaoConexaoIa(edgeEditada, contexto);
    const rotuloFinal =
      textoLimpoConexao(rotuloConexao) ||
      rotuloFinalDescricaoIa(contexto);
    const condicaoJson = condicaoFinalDescricaoIa(edgeEditada, {
      ...contexto,
      idResposta: valorCondicao || contexto.idResposta,
    });

    condicaoJson.tipo = tipoCondicaoConexao || condicaoJson.tipo;

    const edgesAtualizados = edges.map((edge) => {
      if (edge.id !== edgeEditada.id) return edge;

      return {
        ...edge,
        label: `✨ ${rotuloFinal}`,
        data: {
          ...(edge.data || {}),
          rotulo: rotuloFinal,
          condicao_json: condicaoJson,
          usar_ia: true,
          descricao_ia: descricao,
        },
      };
    });

    setUsarIaConexao(true);
    setDescricaoIaConexao(descricao);
    setRotuloConexao(rotuloFinal);
    setEdges(edgesAtualizados);

    await salvarEstrutura({
      nodesParaSalvar: nodes,
      edgesParaSalvar: edgesAtualizados,
      mensagemSucesso: "Intenção gerada com IA e fluxo salvo com sucesso.",
    });
  } catch (error: unknown) {
    setErro(mensagemErroFluxo(error, "Erro ao gerar intenção com IA."));
  } finally {
    setGerandoDescricaoIaConexao(false);
  }
}

function gerarDescricoesConexoesDoBlocoComIa() {
  if (!nodeEditado || !nodeEditadoPermiteGerarDescricoesIa) return;

  if (!fluxoSelecionado) {
    setErro("Selecione um fluxo primeiro.");
    return;
  }

  const conexoesAlvo = edges.filter(
    (edge) => edge.source === nodeEditado.id && conexaoPermiteDescricaoIa(edge)
  );

  if (conexoesAlvo.length === 0) {
    setErro("Este bloco não possui conexões de resposta para gerar intenção com IA.");
    return;
  }

  setErro("");
  setPreviaGeracaoDescricaoIa(
    montarPreviaGeracaoDescricaoIa({
      modo: "bloco",
      titulo: "Gerar intenções com IA",
      conexoes: conexoesAlvo.map((edge) => ({ edge })),
    })
  );
}

async function executarGeracaoDescricoesConexoesDoBlocoComIa() {
  if (!nodeEditado || !nodeEditadoPermiteGerarDescricoesIa) return;

  if (!fluxoSelecionado) {
    setErro("Selecione um fluxo primeiro.");
    return;
  }

  const conexoesAlvo = edges.filter(
    (edge) => edge.source === nodeEditado.id && conexaoPermiteDescricaoIa(edge)
  );

  if (conexoesAlvo.length === 0) {
    setErro("Este bloco não possui conexões de resposta para gerar intenção com IA.");
    return;
  }

  try {
    setGerandoDescricoesIaBloco(true);
    setErro("");
    setSucesso("");
    setPreviaGeracaoDescricaoIa(null);

    let edgesAtualizados = edges;
    let totalGerado = 0;

    for (const edgeAlvo of conexoesAlvo) {
      const edgeAtual =
        edgesAtualizados.find((edge) => edge.id === edgeAlvo.id) || edgeAlvo;
      const contexto = montarContextoDescricaoIaConexao({
        edge: edgeAtual,
      });
      const descricao = await solicitarDescricaoConexaoIa(edgeAtual, contexto);
      const rotuloFinal = rotuloFinalDescricaoIa(contexto);
      const condicaoJson = condicaoFinalDescricaoIa(edgeAtual, contexto);

      edgesAtualizados = edgesAtualizados.map((edge) => {
        if (edge.id !== edgeAtual.id) return edge;

        return {
          ...edge,
          label: `✨ ${rotuloFinal}`,
          data: {
            ...(edge.data || {}),
            rotulo: rotuloFinal,
            condicao_json: condicaoJson,
            usar_ia: true,
            descricao_ia: descricao,
          },
        };
      });
      totalGerado += 1;
    }

    setEdges(edgesAtualizados);

    await salvarEstrutura({
      nodesParaSalvar: nodes,
      edgesParaSalvar: edgesAtualizados,
      mensagemSucesso:
        totalGerado === 1
          ? "1 intenção gerada com IA e fluxo salvo com sucesso."
          : `${totalGerado} intenções geradas com IA e fluxo salvo com sucesso.`,
    });
  } catch (error: unknown) {
    setErro(mensagemErroFluxo(error, "Erro ao gerar intenções com IA."));
  } finally {
    setGerandoDescricoesIaBloco(false);
  }
}

function cancelarPreviaGeracaoDescricaoIa() {
  if (gerandoDescricaoIaConexao || gerandoDescricoesIaBloco) return;

  setPreviaGeracaoDescricaoIa(null);
}

async function confirmarPreviaGeracaoDescricaoIa() {
  if (!previaGeracaoDescricaoIa) return;

  if (previaGeracaoDescricaoIa.modo === "conexao") {
    await executarGeracaoDescricaoConexaoComIa();
    return;
  }

  await executarGeracaoDescricoesConexoesDoBlocoComIa();
}

function mensagemErroFluxo(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}


  async function salvarEstrutura(params?: {
    nodesParaSalvar?: Node[];
    edgesParaSalvar?: Edge[];
    mensagemSucesso?: string;
  }) {
    if (!fluxoSelecionado) {
      setErro("Selecione um fluxo primeiro.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const nodesBase = params?.nodesParaSalvar || nodes;
      const edgesBase = params?.edgesParaSalvar || edges;
      const erroMidiaObrigatoria = validarMidiasObrigatoriasNodes(nodesBase);

      if (erroMidiaObrigatoria) {
        setErro(erroMidiaObrigatoria);
        return;
      }

      const nosParaSalvar = nodesBase.map((node) => {
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

    const conexoesParaSalvar = edgesBase.map((edge, index) => {
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

      setUltimoSalvamento(new Date());
      setSucesso(params?.mensagemSucesso || "Fluxo salvo com sucesso.");
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar estrutura.");
    } finally {
      setSalvando(false);
    }
  }


async function alterarStatusFluxo(
  fluxo: Fluxo,
  novoStatus: "ativo" | "rascunho" | "pausado"
) {
  // CRM_PROTECTED_SYSTEM_FLOW_EDITOR_V1
  if (fluxoEhSistemaCalendario(fluxo) && novoStatus !== "ativo") {
    setErro("Fluxos fixos do sistema não podem ser pausados.");
    return;
  }

  try {
    setErro("");
    setSucesso("");

    if (novoStatus === "ativo") {
      if (headerUser.assinatura?.status === "bloqueada") {
        window.dispatchEvent(new Event("assinatura:abrir-renovacao"));
        setErro("Plano bloqueado. Renove a assinatura para ativar fluxos.");
        return;
      }

      const fluxoEstaNoCanvas = fluxoSelecionado?.id === fluxo.id;
      let nodesValidacao = nodes;
      let edgesValidacao = edges;

      if (!fluxoEstaNoCanvas || carregandoEstrutura) {
        const estrutura = await carregarEstruturaParaValidacao(fluxo.id);
        nodesValidacao = estrutura.nodesValidacao;
        edgesValidacao = estrutura.edgesValidacao;
      }

      const erroValidacao = validarFluxoAntesDeAtivar({
        fluxo,
        nodes: nodesValidacao,
        edges: edgesValidacao,
        integracoesWhatsapp,
        templatesWhatsapp,
      });

      if (erroValidacao) {
        setErro(erroValidacao);
        return;
      }

      if (fluxoEstaNoCanvas && !carregandoEstrutura) {
        await salvarEstrutura();
      }
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

async function duplicarNode(nodeId: string) {
  if (!fluxoSelecionado) {
    setErro("Selecione um fluxo primeiro.");
    return;
  }

  const nodeOriginal = nodes.find((node) => node.id === nodeId);

  if (!nodeOriginal) {
    setErro("Bloco não encontrado.");
    return;
  }

  if (nodeOriginal.data?.tipo_no === "inicio") {
    setErro("O bloco de início não pode ser duplicado.");
    return;
  }

  try {
    setErro("");
    setSucesso("");

    const novoId = criarIdTemporario("node");
    const novaPosicao = calcularPosicaoLivreDuplicacaoNo(
      nodeOriginal,
      nodes
    );

    const configuracaoOriginal =
      (nodeOriginal.data?.configuracao_json as Record<string, any>) || {};

    const configuracaoDuplicada =
      typeof structuredClone === "function"
        ? structuredClone(configuracaoOriginal)
        : JSON.parse(JSON.stringify(configuracaoOriginal));

    const novoNoDb: AutomacaoNo = {
      id: novoId,
      tipo_no: String(nodeOriginal.data?.tipo_no || "enviar_texto"),
      titulo: String(nodeOriginal.data?.titulo || "Novo bloco"),
      descricao: nodeOriginal.data?.descricao
        ? String(nodeOriginal.data.descricao)
        : null,
      posicao_x: novaPosicao.x,
      posicao_y: novaPosicao.y,
      configuracao_json: configuracaoDuplicada,
      delay_segundos:
        nodeOriginal.data?.delay_segundos === null ||
        nodeOriginal.data?.delay_segundos === undefined
          ? null
          : normalizarDelaySegundos(nodeOriginal.data.delay_segundos as any),
    };

    const novoNodeBase = dbNoParaReactFlow(novoNoDb);

    const novoNode: Node = {
      ...novoNodeBase,
      selected: true,
      data: {
        ...novoNodeBase.data,
        isSelecionado: true,
      },
    };

    const nodesAtualizados = nodes.map((node) => ({
      ...node,
      selected: false,
      data: {
        ...(node.data || {}),
        isSelecionado: false,
      },
    }));

    const nodesParaSalvar = [...nodesAtualizados, novoNode];

    setNodes(nodesParaSalvar);
    abrirEdicaoNo(novoNode);

    await salvarEstrutura({
      nodesParaSalvar,
      edgesParaSalvar: edges,
      mensagemSucesso: "Bloco duplicado e fluxo salvo com sucesso.",
    });
  } catch (error: any) {
    setErro(error?.message || "Erro ao duplicar bloco.");
  }
}

function removerConexao(edgeId: string) {
  setEdges((edgesAtuais) => edgesAtuais.filter((edge) => edge.id !== edgeId));

  setEditandoEdgeId(null);
  setEditandoNodeId(null);
  setSucesso("Conexão removida. Clique em Salvar fluxo para gravar no banco.");
}

function fecharPainelEdicao() {
  fecharPainelEdicaoHook();
}

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
      ? templateAgendarDisparoPreview
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
  templateAgendarDisparoPreview,
  templateAgendaLembreteSelecionado,
]);

const nodesRenderizados = useMemo(
  () =>
    nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        arquivo_ia_sem_conexao_erro: nodeArquivoIaSemConexaoErro(node, edges),
        agendar_disparo_template_waba_alerta:
          nodeAgendarDisparoPrecisaTemplatePorWaba(
            node,
            integracoesEscopoFluxoSelecionado,
            templatesWhatsapp
          ),
      },
    })),
  [nodes, edges, integracoesEscopoFluxoSelecionado, templatesWhatsapp]
);

const nodesParaPreviaWhatsapp = useMemo(() => {
  if (!editandoNodeId || !nodeEditado) return nodes;

  return nodes.map((node) => {
    if (node.id !== editandoNodeId) return node;

    const tipoAtual = String(node.data?.tipo_no || "enviar_texto");
    const tipoFinal = tipoAtual === "inicio" ? "inicio" : tipoNodeEdicao || tipoAtual;
    const configuracao = {
      ...((node.data?.configuracao_json || {}) as Record<string, unknown>),
    };
    const tiposComMensagem = [
      "enviar_texto",
      "pergunta_opcoes",
      TIPO_NO_PERGUNTA_LIVRE_IA,
      "enviar_botoes",
      "botao_redirect",
      "enviar_imagem",
      "enviar_video",
      "enviar_audio",
      "enviar_arquivo",
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
    ];

    if (tiposComMensagem.includes(tipoFinal)) {
      configuracao.mensagem = mensagemNode;
    }

    if (tipoFinal === "pergunta_opcoes") {
      configuracao.opcoes = opcoesNode;
    }

    if (tipoFinal === "enviar_botoes") {
      configuracao.botoes = botoesNode;
    }

    if (tipoFinal === "botao_redirect") {
      configuracao.botao_texto = redirectBotaoTextoNode.trim() || "Acessar";
      configuracao.url = redirectUrlNode.trim();
    }

    if (
      tipoFinal === "enviar_imagem" ||
      tipoFinal === "enviar_video" ||
      tipoFinal === "enviar_audio" ||
      tipoFinal === "enviar_arquivo"
    ) {
      configuracao.midia_url = midiaUrlNode;
      configuracao.midia_nome = midiaNomeNode;
    }

    if (tipoFinal === "avaliacao") {
      configuracao.solicitar_comentario = solicitarComentarioNode;
      configuracao.mensagem_comentario = mensagemComentarioNode;
      configuracao.nota_minima = Number(notaMinimaNode || 1);
      configuracao.nota_maxima = Number(notaMaximaNode || 5);
    }

    if (tipoFinal === "capturar_resposta") {
      configuracao.variavel = capturaVariavelNode.trim().toLowerCase() || "resposta";
      configuracao.tipo_captura = capturaTipoNode || "texto";
    }

    if (tipoFinal === "agendar_disparo") {
      configuracao.template_id = agendarDisparoTemplateIdNode;
      configuracao.templates_por_integracao =
        agendarDisparoTemplatesPorIntegracaoNode;
      configuracao.tempo_quantidade = Math.max(
        1,
        Number(agendarDisparoQuantidadeNode || 1)
      );
      configuracao.tempo_unidade = agendarDisparoUnidadeNode;
      configuracao.variaveis = agendarDisparoVariaveisNode
        .split("\n")
        .map((item) => normalizarVariavelFluxo(item))
        .filter(Boolean);
    }

    if (tipoFinal === "agenda_buscar_agendamento") {
      configuracao.mensagem_encontrado =
        mensagemNode.trim() ||
        "Encontrei seu agendamento para {{agenda_data}} às {{agenda_hora}}.";
      configuracao.mensagem_listar_agendamentos =
        agendaMensagemListarAgendamentosNode.trim();
      configuracao.mensagem_nao_encontrado =
        agendaMensagemSemHorariosNode.trim();
    }

    if (tipoFinal === "agenda_escolher_horario") {
      const usarCalendarioContexto =
        fluxoEhSistemaCalendario(fluxoSelecionado) ||
        agendaUsarContextoNode;

      configuracao.agenda_id = usarCalendarioContexto
        ? ""
        : agendaIdNode;

      configuracao.usar_agenda_contexto = usarCalendarioContexto;

      configuracao.mensagem =
        mensagemNode.trim() ||
        "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira.";
      configuracao.mensagem_listar_horarios =
        agendaMensagemListarHorariosNode.trim();
      configuracao.mensagem_preferencia_indisponivel =
        agendaMensagemPreferenciaIndisponivelNode.trim();
      configuracao.mensagem_data_invalida =
        agendaMensagemDataInvalidaNode.trim();
      configuracao.mensagem_sem_horarios =
        agendaMensagemSemHorariosNode.trim();
      configuracao.mensagem_sem_expediente =
        agendaMensagemSemExpedienteNode.trim();
    }

    if (
      tipoFinal === "agenda_criar_agendamento" ||
      tipoFinal === "agenda_remarcar_agendamento" ||
      tipoFinal === "agenda_cancelar_agendamento"
    ) {
      configuracao.mensagem = mensagemNode;
      configuracao.mensagem_conflito = agendaMensagemConflitoNode.trim();
      configuracao.lembrete_agendamento_ativo = agendaLembreteAtivoNode;
      configuracao.lembrete_agendamento_whatsapp = agendaLembreteWhatsappNode;
      configuracao.lembrete_agendamento_template_id =
        agendaLembreteTemplateIdNode;
      configuracao.lembrete_agendamento_variaveis =
        agendaLembreteVariaveisNode
          .split("\n")
          .map((item) => normalizarVariavelFluxo(item))
          .filter(Boolean);
    }

    if (tipoFinal === "interpretar_arquivo_ia") {
      configuracao.mensagem_erro = arquivoMensagemErroNode.trim();
    }

    return {
      ...node,
      data: {
        ...node.data,
        tipo_no: tipoFinal,
        titulo: tituloNode.trim() || tituloPadraoTipoNo(tipoFinal),
        configuracao_json: configuracao,
        delay_segundos:
          tipoFinal === "inicio" ? null : normalizarDelaySegundos(delayNode),
      },
    };
  });
}, [
  nodes,
  editandoNodeId,
  nodeEditado,
  tipoNodeEdicao,
  tituloNode,
  mensagemNode,
  delayNode,
  opcoesNode,
  botoesNode,
  redirectBotaoTextoNode,
  redirectUrlNode,
  midiaUrlNode,
  midiaNomeNode,
  solicitarComentarioNode,
  mensagemComentarioNode,
  notaMinimaNode,
  notaMaximaNode,
  capturaVariavelNode,
  capturaTipoNode,
  agendarDisparoTemplateIdNode,
  agendarDisparoTemplatesPorIntegracaoNode,
  agendarDisparoQuantidadeNode,
  agendarDisparoUnidadeNode,
  agendarDisparoVariaveisNode,
  agendaMensagemListarAgendamentosNode,
  agendaMensagemSemHorariosNode,
  agendaMensagemListarHorariosNode,
  agendaMensagemPreferenciaIndisponivelNode,
  agendaMensagemDataInvalidaNode,
  agendaMensagemSemExpedienteNode,
  agendaMensagemConflitoNode,
  agendaLembreteAtivoNode,
  agendaLembreteWhatsappNode,
  agendaLembreteTemplateIdNode,
  agendaLembreteVariaveisNode,
  arquivoMensagemErroNode,
]);

const edgesParaPreviaWhatsapp = useMemo(() => {
  if (!editandoEdgeId || !edgeEditada) return edges;

  return edges.map((edge) => {
    if (edge.id !== editandoEdgeId) return edge;

    const ehSempreSeguir = tipoCondicaoConexao === "sempre";
    const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";
    const usarIaFinal = usarIaConexao && !ehSempreSeguir && !ehTimeout;
    const labelBase = ehTimeout
      ? `Sem resposta em ${timeoutQuantidade} ${timeoutUnidade}`
      : rotuloConexao || valorCondicao || "Condicao";
    let condicaoJson: Record<string, unknown> = {};

    if (ehSempreSeguir) {
      condicaoJson = { tipo: "sempre" };
    } else if (ehTimeout) {
      const quantidade = Math.max(1, Number(timeoutQuantidade || 1));
      const multiplicador = timeoutUnidade === "horas" ? 3600 : 60;

      condicaoJson = {
        tipo: "timeout_sem_resposta",
        timeout_segundos: quantidade * multiplicador,
        tempo_quantidade: quantidade,
        tempo_unidade: timeoutUnidade,
        status_envio: statusEnvioTimeout,
      };
    } else {
      condicaoJson = {
        tipo: tipoCondicaoConexao,
      };

      if (valorCondicao) {
        condicaoJson.valor = valorCondicao;
      }
    }

    return {
      ...edge,
      label: ehSempreSeguir ? "" : usarIaFinal ? `✨ ${labelBase}` : labelBase,
      data: {
        ...(edge.data || {}),
        rotulo: ehSempreSeguir
          ? "Sempre seguir"
          : ehTimeout
          ? `Sem resposta em ${timeoutQuantidade} ${timeoutUnidade}`
          : rotuloConexao,
        condicao_json: condicaoJson,
        usar_ia: usarIaFinal,
        descricao_ia: descricaoIaConexao.trim(),
      },
    };
  });
}, [
  edges,
  editandoEdgeId,
  edgeEditada,
  tipoCondicaoConexao,
  usarIaConexao,
  timeoutQuantidade,
  timeoutUnidade,
  statusEnvioTimeout,
  rotuloConexao,
  valorCondicao,
  descricaoIaConexao,
]);

const encerramentoInatividadePrevia = useMemo<EncerramentoInatividadePreviaWhatsapp | null>(() => {
  if (!fluxoSelecionado) return null;

  const configuracaoSalva = obterConfiguracaoEncerramentoInatividade(
    fluxoSelecionado.configuracao_json
  );

  if (editandoFluxo && fluxoEmEdicao?.id === fluxoSelecionado.id) {
    const quantidadeEditada = Number(encerrarInatividadeQuantidade || 0);

    return {
      quantidade: Number.isFinite(quantidadeEditada) && quantidadeEditada > 0
        ? quantidadeEditada
        : configuracaoSalva.quantidade,
      unidade: encerrarInatividadeUnidade,
      mensagem:
        encerrarInatividadeMensagem.trim() || configuracaoSalva.mensagem,
    };
  }

  return {
    quantidade: configuracaoSalva.quantidade,
    unidade: configuracaoSalva.unidade,
    mensagem: configuracaoSalva.mensagem,
  };
}, [
  fluxoSelecionado,
  editandoFluxo,
  fluxoEmEdicao?.id,
  encerrarInatividadeQuantidade,
  encerrarInatividadeUnidade,
  encerrarInatividadeMensagem,
]);

const previaWhatsappFluxo = useMemo(
  () =>
    montarPreviaWhatsappFluxo(
      nodesParaPreviaWhatsapp,
      edgesParaPreviaWhatsapp,
      templatesWhatsapp,
      respostasPreviaWhatsapp,
      encerramentoInatividadePrevia
    ),
  [
    nodesParaPreviaWhatsapp,
    edgesParaPreviaWhatsapp,
    templatesWhatsapp,
    respostasPreviaWhatsapp,
    encerramentoInatividadePrevia,
  ]
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
        mobileBackHref={mobileDetailActive ? "/fluxos" : undefined}
        mobileBackLabel="Voltar para fluxos"
        title="Fluxos de automação"
        subtitle="Monte fluxos para automatizar atendimentos, direcionar clientes e escalar suas conversas no WhatsApp."
      />
    <main
      className={`${styles.pageContent} ${
        mobileDetailActive ? styles.mobileDetailActive : ""
      }`}
    >
      <FluxosSidebar
        fluxos={fluxos}
        fluxoSelecionadoId={fluxoSelecionado?.id}
        carregandoFluxos={carregandoFluxos}
        buscaFluxo={buscaFluxo}
        filtroStatusFluxo={filtroStatusFluxo}
        podeCriarFluxos={podeCriarFluxos}
        podeEditarFluxos={podeEditarFluxos}
        podeAtivarFluxos={podeAtivarFluxos}
        podeArquivarFluxos={podeArquivarFluxos}
        podeExcluirFluxos={podeExcluirFluxos}
        isFluxoSistema={fluxoEhSistemaCalendario}
        onBuscaFluxoChange={setBuscaFluxo}
        onFiltroStatusChange={setFiltroStatusFluxo}
        onAbrirFluxo={abrirFluxo}
        onNovoFluxo={abrirCriacaoFluxo}
        onImportarFluxo={abrirImportacaoFluxo}
        onRestaurarFluxo={(fluxoAlvo) => {
          void restaurarFluxo(fluxoAlvo);
        }}
        onApagarDefinitivo={abrirModalApagarDefinitivo}
        onAlterarStatus={(fluxoAlvo, status) => {
          void alterarStatusFluxo(fluxoAlvo, status);
        }}
        onEditarFluxo={abrirEdicaoFluxo}
        onDuplicarFluxo={(fluxoAlvo) => {
          void duplicarFluxo(fluxoAlvo);
        }}
        onCompartilharFluxo={abrirCompartilhamentoFluxo}
        onArquivarFluxo={abrirModalArquivarFluxo}
        onAbrirTooltipAlertaFluxo={abrirTooltipAlertaFluxo}
        onFecharTooltipAlertaFluxo={() => setTooltipAlertaFluxo(null)}
      />

      <section className={styles.editorPanel}>
        <FluxoEditorHeader
          fluxoSelecionado={fluxoSelecionado}
          fluxoSistema={fluxoEhSistemaCalendario(fluxoSelecionado)}
          salvando={salvando}
          ultimoSalvamentoTexto={formatarUltimoSalvamento(ultimoSalvamento)}
          podeCriarFluxos={podeCriarFluxos}
          podeEditarFluxos={podeEditarFluxos}
          podeAtivarFluxos={podeAtivarFluxos}
          podeArquivarFluxos={podeArquivarFluxos}
          podeExcluirFluxos={podeExcluirFluxos}
          onAbrirAssistente={() => setAssistenteFluxosAberto(true)}
          onAdicionarNo={adicionarNo}
          onEditarFluxo={() => abrirEdicaoFluxo()}
          onSalvarEstrutura={() => {
            void salvarEstrutura();
          }}
          onAlterarStatus={(fluxoAlvo, status) => {
            void alterarStatusFluxo(fluxoAlvo, status);
          }}
          onRestaurarFluxo={(fluxoAlvo) => {
            void restaurarFluxo(fluxoAlvo);
          }}
          onApagarDefinitivo={abrirModalApagarDefinitivo}
          onDuplicarFluxo={(fluxoAlvo) => {
            void duplicarFluxo(fluxoAlvo);
          }}
          onCompartilharFluxo={abrirCompartilhamentoFluxo}
          onArquivarFluxo={abrirModalArquivarFluxo}
        />

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
          <FluxoCanvas
            nodes={nodesRenderizados}
            edges={edges}
            carregandoEstrutura={carregandoEstrutura}
            podeEditarFluxos={podeEditarFluxos}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEditarNode={abrirEdicaoNo}
            onEditarEdge={(edge) => {
              abrirEdicaoConexao(edge);
              marcarConexaoSelecionada(edge.id);
            }}
          />

          {fluxoSelecionado && (
            <WhatsappFlowPreview
              fluxoNome={fluxoSelecionado.nome}
              previa={previaWhatsappFluxo}
              recolhida={previaWhatsappRecolhida}
              onRecolher={() => setPreviaWhatsappRecolhida(true)}
              onExpandir={() => setPreviaWhatsappRecolhida(false)}
              onSelecionarResposta={(sourceNodeId, edgeId) =>
                setRespostasPreviaWhatsapp((atuais) => ({
                  ...atuais,
                  [sourceNodeId]: edgeId,
                }))
              }
            />
          )}


          <PropertiesPanel
            nodeEditado={nodeEditado}
            edgeEditada={edgeEditada}
            salvando={salvando}
            onDuplicarNode={(nodeId) => {
              void duplicarNode(nodeId);
            }}
            onFechar={fecharPainelEdicao}
          >
            {nodeEditado ? (
                <NodeConfigPanel
        tipoNode={tipoNodeEdicao}
        titulo={tituloNode}
        mensagem={mensagemNode}
        onTipoChange={(novoTipo) => {
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

          if (novoTipo === TIPO_NO_PERGUNTA_LIVRE_IA) {
            setSetorDestino("");
            setOpcoesNode([]);
            setBotoesNode([]);

            if (!mensagemNode.trim()) {
              setMensagemNode("Como posso te ajudar?");
            }
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
            novoTipo === "enviar_audio" ||
            novoTipo === "enviar_arquivo"
          ) {
            setSetorDestino("");
            setOpcoesNode([]);
          }

          if (
            novoTipo !== "enviar_imagem" &&
            novoTipo !== "enviar_video" &&
            novoTipo !== "enviar_audio" &&
            novoTipo !== "enviar_arquivo"
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
            setAgendaUsarContextoNode(false);

            if (novoTipo === "agenda_buscar_agendamento") {
              setAgendaListarAgendamentosNode(true);
              setAgendaQuantidadeOpcoesNode("6");
              setAgendaMensagemListarAgendamentosNode(
                "Encontrei estes agendamentos. Responda com o número do agendamento que deseja cancelar ou remarcar:"
              );
            }

            if (novoTipo === "agenda_escolher_horario") {
              setMensagemNode(
                "Qual dia voce quer marcar? Pode responder: hoje, amanha, dia 22, 22/05 ou sexta-feira."
              );
              setAgendaMensagemListarHorariosNode(
                "Para {{agenda_data_nova}}, estes horários estão disponíveis.\n\nResponda com o número da opção desejada ou informe outra data:"
              );
              setAgendaMensagemPreferenciaIndisponivelNode(
                "O horário {{agenda_preferencia_solicitada}} não está disponível em {{agenda_data_nova}}.\n\nEstas são as opções mais próximas:"
              );
              setAgendaMensagemDataInvalidaNode(
                "Essa data não é válida ou já passou. Informe uma data futura.\n\nQuando necessário, inclua também o ano."
              );
              setAgendaMensagemSemExpedienteNode(
                "Não há atendimento disponível em {{agenda_data_nova}}.\n\nInforme outra data para continuarmos."
              );
            }

            if (novoTipo === "agenda_criar_agendamento") {
              setMensagemNode(
                "Agendado! Seu horário ficou marcado para {{agenda_data}} às {{agenda_hora}}. Qualquer dúvida e so entrar em contato."
              );
              setAgendaEnviarEmailNode(true);
              setAgendaEmailOrigemNode("contato");
              setAgendaEmailVariavelNode("email");
            }

            if (novoTipo === "agenda_remarcar_agendamento") {
              setMensagemNode(
                "Remarcado! Seu horário agora ficou para {{agenda_data}} às {{agenda_hora}}."
              );
            }

            if (novoTipo === "agenda_cancelar_agendamento") {
              setMensagemNode(
                "Pronto, seu horário de {{agenda_data}} às {{agenda_hora}} foi cancelado. Quando quiser marcar novamente, e so me chamar."
              );
              setAgendaStatusAgendamentoNode("cancelado");
              setAgendaEnviarEmailNode(true);
              setAgendaEmailOrigemNode("contato");
              setAgendaEmailVariavelNode("email");
            }
          }
        }}
        onTituloChange={setTituloNode}
        onMensagemChange={setMensagemNode}
        onGerenciarVariaveis={() => abrirModalGerenciarVariaveis("mensagem")}
      >
                  {tipoNodeEdicao === "encerrar" && (
                    <EncerrarConfig
                              resultado={encerrarResultadoNode}
                              tipoValor={encerrarValorTipoNode}
                              valorFixo={encerrarValorFixoNode}
                              valorVariavel={encerrarValorVariavelNode}
                              onResultadoChange={(resultado) => {
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
                              onTipoValorChange={(tipoValor) => {
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
                              onValorFixoChange={setEncerrarValorFixoNode}
                              onValorVariavelChange={setEncerrarValorVariavelNode}
                            />
                  )}

                                    {tipoNodeEdicao === "capturar_resposta" && (
                    <CapturarRespostaConfig
                              tipoCaptura={capturaTipoNode}
                              variavel={capturaVariavelNode}
                              mensagemErro={capturaMensagemErroNode}
                              onTipoCapturaChange={(novoTipo) => {
                                const variavelAtual = capturaVariavelNode
                                  .trim()
                                  .toLowerCase();
                    
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
                    
                                if (
                                  !variavelAtual ||
                                  variaveisPadrao.includes(variavelAtual)
                                ) {
                                  setCapturaVariavelNode(novoTipo);
                                }
                              }}
                              onVariavelChange={setCapturaVariavelNode}
                              onMensagemErroChange={setCapturaMensagemErroNode}
                            />
                  )}

                                    {tipoNodeEdicao === "avaliacao" && (
                    <AvaliacaoConfig
                              notaMinima={notaMinimaNode}
                              notaMaxima={notaMaximaNode}
                              solicitarComentario={solicitarComentarioNode}
                              mensagemComentario={mensagemComentarioNode}
                              onNotaMinimaChange={setNotaMinimaNode}
                              onNotaMaximaChange={setNotaMaximaNode}
                              onSolicitarComentarioChange={setSolicitarComentarioNode}
                              onMensagemComentarioChange={setMensagemComentarioNode}
                            />
                  )}

                  {[
          "enviar_imagem",
          "enviar_video",
          "enviar_audio",
          "enviar_arquivo",
        ].includes(tipoNodeEdicao) && (
          <MidiaConfig
            tipoNode={tipoNodeEdicao}
            midiaUrl={midiaUrlNode}
            midiaNome={midiaNomeNode}
            midias={midias}
            carregando={carregandoMidias}
            enviando={enviandoMidia}
            podeGerenciar={podeGerenciarMidias}
            limiteStorageAtingido={limiteStorageMidiasAtingido}
            storageUsadoBytes={resumoMidias.tamanhoTotal}
            storageClassName={classeUsoStorageMidias(
              resumoMidias.tamanhoTotal,
              LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
            )}
            onSelecionar={selecionarMidiaNode}
            onRemover={limparMidiaSelecionadaNode}
            onArquivoSelecionado={(arquivo) => {
              setErro("");
              setSucesso("");

              if (arquivo.type.startsWith("image/")) {
                if (arquivo.size > LIMITE_IMAGEM_BYTES) {
                  setErro("A imagem deve ter no máximo 5MB.");
                  return;
                }
              }

              if (tipoNodeEdicao === "enviar_video") {
                const nomeMinusculo = arquivo.name.toLowerCase();
                const ehMp4 =
                  arquivo.type === "video/mp4" ||
                  nomeMinusculo.endsWith(".mp4");

                if (!ehMp4) {
                  setErro(
                    "Formato de vídeo não permitido. Envie somente um arquivo MP4 com vídeo H.264/AVC e áudio AAC."
                  );
                  return;
                }

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

              if (
                tipoNodeEdicao === "enviar_arquivo" &&
                arquivo.size > LIMITE_ARQUIVO_BYTES
              ) {
                setErro("O arquivo deve ter no máximo 50MB.");
                return;
              }

              void enviarNovaMidia(arquivo);
            }}
            onAbrirGerenciador={abrirGerenciadorMidias}
          />
        )}

        {tipoNodeEdicao === "pergunta_opcoes" && (
                    <PerguntaOpcoesConfig
                              opcoes={opcoesNode}
                              onAdicionar={adicionarOpcaoPergunta}
                              onAtualizar={atualizarOpcaoPergunta}
                              onRemover={removerOpcaoPergunta}
                            />
                  )}

                                    {tipoNodeEdicao === "enviar_botoes" && (
                    <BotoesConfig
                              botoes={botoesNode}
                              onAdicionar={adicionarBotaoResposta}
                              onAtualizar={atualizarBotaoResposta}
                              onRemover={removerBotaoResposta}
                            />
                  )}

                                    {tipoNodeEdicao === "botao_redirect" && (
                    <RedirectConfig
                              textoBotao={redirectBotaoTextoNode}
                              url={redirectUrlNode}
                              onTextoBotaoChange={setRedirectBotaoTextoNode}
                              onUrlChange={setRedirectUrlNode}
                            />
                  )}

                  {tipoNodeEdicao === "agendar_disparo" && (
          <AgendarDisparoConfig
            usaTemplatesPorIntegracao={agendarDisparoUsaTemplatesPorIntegracao}
            templateId={agendarDisparoTemplateIdNode}
            templatesPorIntegracao={agendarDisparoTemplatesPorIntegracaoNode}
            quantidade={agendarDisparoQuantidadeNode}
            unidade={agendarDisparoUnidadeNode}
            variaveis={agendarDisparoVariaveisNode}
            indicesVariaveis={indicesVariaveisTemplateAgendarDisparo}
            templates={templatesWhatsapp}
            integracoes={integracoesEscopoFluxoSelecionado}
            carregandoTemplates={carregandoTemplatesWhatsapp}
            opcoesVariaveis={opcoesVariaveisFluxo}
            loadingVariaveis={loadingVariaveis}
            templatePreviewSelecionado={templateAgendarDisparoSelecionado}
            preview={previewTemplateAgendarDisparo}
            loadingCusto={loadingPreviewCustoAgendarDisparo}
            custo={previewCustoAgendarDisparo}
            rotuloIntegracao={rotuloIntegracaoWhatsapp}
            templatesCompativeis={(integracao) =>
              templatesWhatsapp.filter((template) =>
                templateCompativelComIntegracao(template, integracao)
              )
            }
            onTemplateIdChange={setAgendarDisparoTemplateIdNode}
            onTemplateIntegracaoChange={(integracaoId, templateId) =>
              setAgendarDisparoTemplatesPorIntegracaoNode((atual) => ({
                ...atual,
                [integracaoId]: templateId,
              }))
            }
            onQuantidadeChange={setAgendarDisparoQuantidadeNode}
            onUnidadeChange={setAgendarDisparoUnidadeNode}
            onVariavelChange={(index, chave) =>
              setAgendarDisparoVariaveisNode((atual) =>
                atualizarLinhaVariavelTemplate(atual, index, chave)
              )
            }
            onGerenciarVariaveis={() =>
              abrirModalGerenciarVariaveis("agendar_disparo")
            }
          />
        )}

        {tipoNodeEdicao.startsWith("agenda_") && (
          <AgendaConfig
            tipoNode={tipoNodeEdicao}
            fluxoSistemaCalendario={fluxoSistemaCalendario}
            fluxoTemBuscaQualquerCalendario={fluxoTemBuscaQualquerCalendario}
            agendas={agendasOpcoes}
            carregandoAgendas={carregandoAgendasOpcoes}
            agendaId={agendaIdNode}
            usarContexto={agendaUsarContextoNode}
            listarAgendamentos={agendaListarAgendamentosNode}
            quantidadeOpcoes={agendaQuantidadeOpcoesNode}
            janelaDias={agendaJanelaDiasNode}
            mensagemSemHorarios={agendaMensagemSemHorariosNode}
            mensagemSemExpediente={agendaMensagemSemExpedienteNode}
            mensagemDataInvalida={agendaMensagemDataInvalidaNode}
            mensagemListarAgendamentos={agendaMensagemListarAgendamentosNode}
            mensagemListarHorarios={agendaMensagemListarHorariosNode}
            mensagemPreferenciaIndisponivel={agendaMensagemPreferenciaIndisponivelNode}
            mensagemConflito={agendaMensagemConflitoNode}
            statusAgendamento={agendaStatusAgendamentoNode}
            enviarEmail={agendaEnviarEmailNode}
            emailOrigem={agendaEmailOrigemNode}
            emailVariavel={agendaEmailVariavelNode}
            lembreteAtivo={agendaLembreteAtivoNode}
            lembreteQuantidade={agendaLembreteQuantidadeNode}
            lembreteUnidade={agendaLembreteUnidadeNode}
            lembreteWhatsapp={agendaLembreteWhatsappNode}
            lembreteEmail={agendaLembreteEmailNode}
            lembreteTemplateId={agendaLembreteTemplateIdNode}
            lembreteVariaveis={agendaLembreteVariaveisNode}
            motivoCancelamento={agendaMotivoCancelamentoNode}
            templates={templatesWhatsapp}
            carregandoTemplates={carregandoTemplatesWhatsapp}
            templateLembreteSelecionado={templateAgendaLembreteSelecionado}
            indicesVariaveisLembrete={indicesVariaveisTemplateAgendaLembrete}
            opcoesVariaveisFluxo={opcoesVariaveisFluxo}
            opcoesVariaveisAgendamento={opcoesVariaveisAgendamento}
            loadingVariaveis={loadingVariaveis}
            previewLembrete={previewTemplateAgendaLembrete}
            loadingCusto={loadingPreviewCustoAgendarDisparo}
            custo={previewCustoAgendarDisparo}
            onAgendaIdChange={setAgendaIdNode}
            onUsarContextoChange={setAgendaUsarContextoNode}
            onListarAgendamentosChange={setAgendaListarAgendamentosNode}
            onQuantidadeOpcoesChange={setAgendaQuantidadeOpcoesNode}
            onJanelaDiasChange={setAgendaJanelaDiasNode}
            onMensagemSemHorariosChange={setAgendaMensagemSemHorariosNode}
            onMensagemSemExpedienteChange={setAgendaMensagemSemExpedienteNode}
            onMensagemDataInvalidaChange={setAgendaMensagemDataInvalidaNode}
            onMensagemListarAgendamentosChange={setAgendaMensagemListarAgendamentosNode}
            onMensagemListarHorariosChange={setAgendaMensagemListarHorariosNode}
            onMensagemPreferenciaIndisponivelChange={setAgendaMensagemPreferenciaIndisponivelNode}
            onMensagemConflitoChange={setAgendaMensagemConflitoNode}
            onStatusAgendamentoChange={setAgendaStatusAgendamentoNode}
            onEnviarEmailChange={setAgendaEnviarEmailNode}
            onEmailOrigemChange={setAgendaEmailOrigemNode}
            onEmailVariavelChange={setAgendaEmailVariavelNode}
            onLembreteAtivoChange={setAgendaLembreteAtivoNode}
            onLembreteQuantidadeChange={setAgendaLembreteQuantidadeNode}
            onLembreteUnidadeChange={setAgendaLembreteUnidadeNode}
            onLembreteWhatsappChange={setAgendaLembreteWhatsappNode}
            onLembreteEmailChange={setAgendaLembreteEmailNode}
            onLembreteTemplateIdChange={setAgendaLembreteTemplateIdNode}
            onLembreteVariavelChange={(index, chave) =>
              setAgendaLembreteVariaveisNode((atual) =>
                atualizarLinhaVariavelTemplate(atual, index, chave)
              )
            }
            onMotivoCancelamentoChange={setAgendaMotivoCancelamentoNode}
            onGerenciarVariaveisLembrete={() =>
              abrirModalGerenciarVariaveis("agenda_lembrete")
            }
          />
        )}

        {tipoNodeEdicao === "interpretar_arquivo_ia" && (
                    <InterpretarArquivoIaConfig
                              instrucao={arquivoInstrucaoIaNode}
                              camposExtracao={arquivoCamposExtracaoNode}
                              mensagemErro={arquivoMensagemErroNode}
                              onInstrucaoChange={setArquivoInstrucaoIaNode}
                              onCamposExtracaoChange={setArquivoCamposExtracaoNode}
                              onMensagemErroChange={setArquivoMensagemErroNode}
                            />
                  )}

                  {nodeEditadoPermiteGerarDescricoesIa && (
                    <div className={styles.IABox}>
                      <div className={styles.optionsHeader}>
                        <span className={styles.label}>Intenções das conexões</span>

                        <button
                          type="button"
                          className={`${styles.smallButtonIA} ${styles.generateIaButton}`}
                          onClick={gerarDescricoesConexoesDoBlocoComIa}
                          disabled={
                            gerandoDescricoesIaBloco ||
                            salvando ||
                            quantidadeConexoesIaNodeEditado === 0
                          }
                        >
                          <Sparkles size={14} />
                          {gerandoDescricoesIaBloco
                            ? "Gerando..."
                            : "Gerar IA para conexões"}
                        </button>
                      </div>

                      <p className={styles.help}>
                        Gera uma intenção com IA para cada conexão de resposta deste bloco e salva o fluxo ao finalizar.
                      </p>
                    </div>
                  )}

                                          {tipoNodeEdicao === "transferir_setor" && (
                    <TransferenciaConfig
                              escopoFila={escopoFilaTransferenciaNode}
                              setorDestino={setorDestino}
                              incluirAdministradores={incluirAdministradoresTransferenciaNode}
                              estrategia={estrategiaDistribuicaoDisponivel(
                                estrategiaTransferenciaNode,
                                setorDestino,
                                incluirAdministradoresTransferenciaNode
                              )}
                              atendenteDestino={atendenteDestinoNode}
                              carregandoSetores={carregandoSetores}
                              possuiAdministradorAtivo={possuiAdministradorAtivo}
                              distribuicaoAutomaticaPermitida={permiteDistribuicaoAutomaticaNoSetor(
                                setorDestino,
                                incluirAdministradoresTransferenciaNode
                              )}
                              setores={setores}
                              atendentesElegiveis={atendentes.filter(
                                (atendente) =>
                                  atendente.is_administrador === true ||
                                  atendente.setor_ids.includes(setorDestino)
                              )}
                              onEscopoFilaChange={(escopo) => {
                                setEscopoFilaTransferenciaNode(escopo);
                                if (escopo === "geral") {
                                  setSetorDestino("");
                                  setAtendenteDestinoNode("");
                                  setEstrategiaTransferenciaNode("fila_setor");
                                  setIncluirAdministradoresTransferenciaNode(false);
                                }
                              }}
                              onSetorDestinoChange={(setorId) => {
                                setSetorDestino(setorId);
                                setAtendenteDestinoNode("");
                                setEstrategiaTransferenciaNode("fila_setor");
                              }}
                              onIncluirAdministradoresChange={(incluir) => {
                                setIncluirAdministradoresTransferenciaNode(incluir);
                                if (
                                  !permiteDistribuicaoAutomaticaNoSetor(setorDestino, incluir) &&
                                  (estrategiaTransferenciaNode === "rodizio_aleatorio" ||
                                    estrategiaTransferenciaNode === "menos_conversas")
                                ) {
                                  setEstrategiaTransferenciaNode("fila_setor");
                                }
                              }}
                              onEstrategiaChange={(estrategia) => {
                                setEstrategiaTransferenciaNode(estrategia);
                                if (estrategia !== "atendente_especifico") {
                                  setAtendenteDestinoNode("");
                                }
                              }}
                              onAtendenteDestinoChange={setAtendenteDestinoNode}
                            />
                  )}

                  {tipoNodeEdicao !== "inicio" && tipoNodeEdicao !== "agendar_disparo" && (
          <DelayConfig
            valor={delayNode}
            onChange={(valor) => {
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
        )}
        {tipoNodeEdicao !== "inicio" && (
          <NotificacaoConfig
            ativo={notificarAoChegarNode}
            titulo={notificacaoTituloNode}
            mensagem={notificacaoMensagemNode}
            enviarEmail={notificarEmailNode}
            onAtivoChange={setNotificarAoChegarNode}
            onTituloChange={setNotificacaoTituloNode}
            onMensagemChange={setNotificacaoMensagemNode}
            onEnviarEmailChange={setNotificarEmailNode}
          />
        )}
        {[
          "pergunta_opcoes",
          TIPO_NO_PERGUNTA_LIVRE_IA,
          "enviar_botoes",
          "capturar_resposta",
          "agenda_buscar_agendamento",
          "agenda_escolher_horario",
          "avaliacao",
          "interpretar_arquivo_ia",
        ].includes(tipoNodeEdicao) && (
          <TentativasConfig
            maxInvalidas={maxTentativasInvalidasNode}
            maxSemResposta={maxTentativasSemRespostaNode}
            acao={acaoExcessoTentativasNode}
            escopoFila={escopoFilaExcessoTentativasNode}
            setor={setorExcessoTentativasNode}
            incluirAdministradores={incluirAdministradoresExcessoTentativasNode}
            estrategia={estrategiaDistribuicaoDisponivel(
              estrategiaExcessoTentativasNode,
              setorExcessoTentativasNode,
              incluirAdministradoresExcessoTentativasNode
            )}
            atendente={atendenteExcessoTentativasNode}
            mensagem={mensagemExcessoTentativasNode}
            notificarSistema={notificarExcessoTentativasNode}
            notificarEmail={notificarEmailExcessoTentativasNode}
            carregandoSetores={carregandoSetores}
            possuiAdministradorAtivo={possuiAdministradorAtivo}
            distribuicaoAutomaticaPermitida={permiteDistribuicaoAutomaticaNoSetor(
              setorExcessoTentativasNode,
              incluirAdministradoresExcessoTentativasNode
            )}
            setores={setores}
            atendentesElegiveis={atendentes.filter(
              (atendente) =>
                atendente.is_administrador === true ||
                atendente.setor_ids.includes(setorExcessoTentativasNode)
            )}
            onMaxInvalidasChange={setMaxTentativasInvalidasNode}
            onMaxSemRespostaChange={setMaxTentativasSemRespostaNode}
            onAcaoChange={setAcaoExcessoTentativasNode}
            onEscopoFilaChange={(escopo) => {
              setEscopoFilaExcessoTentativasNode(escopo);
              if (escopo === "geral") {
                setSetorExcessoTentativasNode("");
                setAtendenteExcessoTentativasNode("");
                setEstrategiaExcessoTentativasNode("fila_setor");
                setIncluirAdministradoresExcessoTentativasNode(false);
              }
            }}
            onSetorChange={(setorId) => {
              setSetorExcessoTentativasNode(setorId);
              setAtendenteExcessoTentativasNode("");
              setEstrategiaExcessoTentativasNode("fila_setor");
            }}
            onIncluirAdministradoresChange={(incluir) => {
              setIncluirAdministradoresExcessoTentativasNode(incluir);
              if (
                !permiteDistribuicaoAutomaticaNoSetor(
                  setorExcessoTentativasNode,
                  incluir
                ) &&
                (estrategiaExcessoTentativasNode === "rodizio_aleatorio" ||
                  estrategiaExcessoTentativasNode === "menos_conversas")
              ) {
                setEstrategiaExcessoTentativasNode("fila_setor");
              }
            }}
            onEstrategiaChange={(estrategia) => {
              setEstrategiaExcessoTentativasNode(estrategia);
              if (estrategia !== "atendente_especifico") {
                setAtendenteExcessoTentativasNode("");
              }
            }}
            onAtendenteChange={setAtendenteExcessoTentativasNode}
            onMensagemChange={setMensagemExcessoTentativasNode}
            onNotificarSistemaChange={setNotificarExcessoTentativasNode}
            onNotificarEmailChange={setNotificarEmailExcessoTentativasNode}
          />
        )}

                <NodeActions
                  podeExcluir={nodeEditado.data?.tipo_no !== "inicio"}
                  confirmandoExclusao={confirmandoExclusaoNo}
                  onPedirExclusao={() => setConfirmandoExclusaoNo(true)}
                  onConfirmarExclusao={() => removerNode(nodeEditado.id)}
                  onCancelar={fecharPainelEdicao}
                  onAplicar={aplicarEdicaoNo}
                />


                </NodeConfigPanel>
                ) : (
                  <ConnectionEditor
                    rotuloConexao={rotuloConexao}
                    tipoCondicaoConexao={tipoCondicaoConexao}
                    timeoutQuantidade={timeoutQuantidade}
                    timeoutUnidade={timeoutUnidade}
                    statusEnvioTimeout={statusEnvioTimeout}
                    origemPerguntaLivreIa={edgeEditadaOrigemPerguntaLivreIa}
                    usarIaConexao={usarIaConexao}
                    descricaoIaConexao={descricaoIaConexao}
                    valorCondicao={valorCondicao}
                    gerandoDescricaoIaConexao={gerandoDescricaoIaConexao}
                    salvando={salvando}
                    confirmandoExclusaoConexao={confirmandoExclusaoConexao}
                    onNomeConexaoChange={(valor) => {
                      setNomeConexaoEditadoManual(true);
                      setRotuloConexao(valor);
                    }}
                    onTipoCondicaoChange={(novoTipo) => {
                      setTipoCondicaoConexao(novoTipo);

                      if (novoTipo === "sempre") {
                        setValorCondicao("");
                        setRotuloConexao("Sempre seguir");
                        setUsarIaConexao(false);
                      }

                      if (novoTipo === "timeout_sem_resposta") {
                        setUsarIaConexao(false);
                      }
                    }}
                    onTimeoutQuantidadeChange={setTimeoutQuantidade}
                    onTimeoutUnidadeChange={setTimeoutUnidade}
                    onStatusEnvioTimeoutChange={setStatusEnvioTimeout}
                    onUsarIaChange={(ativo) => {
                      setUsarIaConexao(ativo);

                      if (!ativo) {
                        setDescricaoIaConexao("");
                        return;
                      }

                      setDescricaoIaConexao(
                        gerarSugestaoDescricaoIaConexao({
                          edge: edgeEditada,
                          rotulo: rotuloConexao,
                          valor: valorCondicao,
                        })
                      );
                    }}
                    onDescricaoIaChange={setDescricaoIaConexao}
                    onGerarDescricaoIa={gerarDescricaoConexaoComIa}
                    onValorCondicaoChange={(novoValor) => {
                      setValorCondicao(novoValor);

                      if (!nomeConexaoEditadoManual) {
                        setRotuloConexao(novoValor);
                      }

                      if (!descricaoIaConexao.trim()) {
                        setDescricaoIaConexao(
                          gerarSugestaoDescricaoIaConexao({
                            edge: edgeEditada,
                            rotulo: nomeConexaoEditadoManual
                              ? rotuloConexao
                              : novoValor,
                            valor: novoValor,
                          })
                        );
                      }
                    }}
                    onPedirExclusao={() =>
                      setConfirmandoExclusaoConexao(true)
                    }
                    onConfirmarExclusao={() => {
                      if (edgeEditada) {
                        removerConexao(edgeEditada.id);
                      }
                    }}
                    onCancelar={fecharPainelEdicao}
                    onAplicar={() => {
                      void aplicarEdicaoConexao();
                    }}
                  />
                )}
          </PropertiesPanel>
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
        <MediaManagerModal
          midias={midias}
          resumo={resumoMidias}
          aba={abaMidias}
          carregando={carregandoMidias}
          podeGerenciar={podeGerenciarMidias}
          confirmandoExclusaoId={confirmandoExclusaoMidiaId}
          excluindoId={midiaExcluindoId}
          storageClassName={classeUsoStorageMidias(
            resumoMidias.tamanhoTotal,
            LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
          )}
          onAbaChange={setAbaMidias}
          onFechar={fecharGerenciadorMidias}
          onPedirExclusao={setConfirmandoExclusaoMidiaId}
          onConfirmarExclusao={(midia) => {
            void excluirMidiaDefinitivamente(midia);
          }}
        />
      )}

      {modalVariaveisAberto && (
        <VariablesManagerModal
          variaveis={variaveisPersonalizadas}
          loading={loadingVariaveis}
          salvando={salvandoVariavel}
          erro={erroVariavelModal}
          chave={novaVariavelChave}
          valor={novaVariavelValor}
          descricao={novaVariavelDescricao}
          onChaveChange={setNovaVariavelChave}
          onValorChange={setNovaVariavelValor}
          onDescricaoChange={setNovaVariavelDescricao}
          onSalvar={salvarVariavelPersonalizada}
          onRemover={removerVariavelPersonalizada}
          onUsar={aplicarVariavelNoBloco}
          onFechar={fecharModalGerenciarVariaveis}
        />
      )}

      {editandoFluxo && (
        <EditFlowModal
          nome={nomeFluxoEdicao}
          descricao={descricaoFluxoEdicao}
          fluxoPadrao={fluxoPadraoEdicao}
          outroFluxoPadraoExiste={existeOutroFluxoPadraoNaEmpresa()}
          mostrarEscopoIntegracoes={deveMostrarEscopoIntegracoesFluxo}
          escopoModo={fluxoEscopoIntegracoesModoEdicao}
          integracoesIds={fluxoIntegracoesIdsEdicao}
          integracoes={integracoesWhatsapp}
          carregandoIntegracoes={carregandoIntegracoesWhatsapp}
          quantidadeInatividade={encerrarInatividadeQuantidade}
          unidadeInatividade={encerrarInatividadeUnidade}
          mensagemInatividade={encerrarInatividadeMensagem}
          gatilhos={gatilhosFluxo}
          novoGatilhoValor={novoGatilhoValor}
          novoGatilhoCondicao={novoGatilhoCondicao}
          podeGerenciarGatilhos={podeGerenciarGatilhos}
          podeEditar={podeEditarFluxos}
          erro={erroEdicaoFluxo}
          rotuloIntegracao={rotuloIntegracaoWhatsapp}
          onNomeChange={(valor) => {
            setErroEdicaoFluxo("");
            setNomeFluxoEdicao(valor);
          }}
          onDescricaoChange={setDescricaoFluxoEdicao}
          onFluxoPadraoChange={(marcado) => {
            setErroEdicaoFluxo("");
            setFluxoPadraoEdicao(marcado);

            if (marcado) {
              setNovoGatilhoValor("");
              setNovoGatilhoCondicao("contem");
            }
          }}
          onEscopoModoChange={(modo) => {
            setFluxoEscopoIntegracoesModoEdicao(modo);

            if (modo === "todas") {
              setFluxoIntegracoesIdsEdicao([]);
            }
          }}
          onAlternarIntegracao={alternarIntegracaoEscopoEdicao}
          onQuantidadeInatividadeChange={(valor) => {
            setEncerrarInatividadeQuantidade(
              limitarQuantidadeInatividade(
                valor,
                encerrarInatividadeUnidade
              )
            );
          }}
          onQuantidadeInatividadeBlur={() => {
            setEncerrarInatividadeQuantidade(
              corrigirQuantidadeMinimaInatividade(
                encerrarInatividadeQuantidade,
                encerrarInatividadeUnidade
              )
            );
          }}
          onUnidadeInatividadeChange={(novaUnidade) => {
            setEncerrarInatividadeUnidade(novaUnidade);

            setEncerrarInatividadeQuantidade((valorAtual) =>
              corrigirQuantidadeMinimaInatividade(
                valorAtual,
                novaUnidade
              )
            );
          }}
          onMensagemInatividadeChange={setEncerrarInatividadeMensagem}
          onNovoGatilhoValorChange={setNovoGatilhoValor}
          onNovoGatilhoCondicaoChange={setNovoGatilhoCondicao}
          onAdicionarGatilho={() => {
            void criarGatilhoFluxo(
              fluxoEmEdicao || fluxoSelecionado
            );
          }}
          onAlternarGatilho={(gatilho) => {
            void alternarGatilhoFluxo(
              gatilho,
              fluxoEmEdicao || fluxoSelecionado
            );
          }}
          onRemoverGatilho={(gatilhoId) => {
            void removerGatilhoFluxo(
              gatilhoId,
              fluxoEmEdicao || fluxoSelecionado
            );
          }}
          onCancelar={fecharEdicaoFluxo}
          onSalvar={salvarEdicaoFluxo}
        />
      )}

        {modalArquivarAberto && fluxoParaArquivar && (
          <ArchiveFlowModal
            fluxo={fluxoParaArquivar}
            podeArquivar={podeArquivarFluxos}
            onConfirmar={confirmarArquivarFluxo}
            onFechar={fecharModalArquivarFluxo}
          />
        )}

        {modalApagarDefinitivoAberto && fluxoParaApagarDefinitivo && (
          <DeleteFlowModal
            fluxo={fluxoParaApagarDefinitivo}
            podeExcluir={podeExcluirFluxos}
            apagando={apagandoFluxoDefinitivo}
            onConfirmar={confirmarApagarDefinitivo}
            onFechar={fecharModalApagarDefinitivo}
          />
        )}

        {modalCompartilharAberto && fluxoParaCompartilhar && (
          <ShareFlowModal
            fluxo={fluxoParaCompartilhar}
            codigo={codigoCompartilhamento}
            carregando={carregandoCodigoCompartilhamento}
            erro={erroCompartilhamento}
            onCopiar={copiarCodigoCompartilhamento}
            onAtualizar={() =>
              gerarCodigoCompartilhamento(fluxoParaCompartilhar)
            }
            onFechar={fecharCompartilhamentoFluxo}
          />
        )}

      {modalImportarAberto && (
        <ImportFlowModal
          codigo={codigoImportacao}
          importando={importandoFluxo}
          erro={erroImportacao}
          podeCriar={podeCriarFluxos}
          onCodigoChange={setCodigoImportacao}
          onImportar={importarFluxoCompartilhado}
          onFechar={fecharImportacaoFluxo}
        />
      )}

      {abrirCriacao && (
        <CreateFlowModal
          nome={novoFluxoNome}
          descricao={descricaoNovoFluxo}
          fluxoPadrao={novoFluxoPadrao}
          jaExisteFluxoPadrao={jaExisteFluxoPadrao}
          mostrarEscopoIntegracoes={deveMostrarEscopoIntegracoesFluxo}
          escopoModo={novoFluxoEscopoIntegracoesModo}
          integracoesIds={novoFluxoIntegracoesIds}
          integracoes={integracoesWhatsapp}
          carregandoIntegracoes={carregandoIntegracoesWhatsapp}
          quantidadeInatividade={encerrarInatividadeQuantidade}
          unidadeInatividade={encerrarInatividadeUnidade}
          mensagemInatividade={encerrarInatividadeMensagem}
          gatilhos={gatilhosNovoFluxo}
          novoGatilhoValor={novoGatilhoValor}
          novoGatilhoCondicao={novoGatilhoCondicao}
          erro={erroCriacaoFluxo}
          rotuloIntegracao={rotuloIntegracaoWhatsapp}
          onNomeChange={setNovoFluxoNome}
          onDescricaoChange={setDescricaoNovoFluxo}
          onFluxoPadraoChange={(marcado) => {
            setNovoFluxoPadrao(marcado);

            if (marcado) {
              setGatilhosNovoFluxo([]);
              setNovoGatilhoValor("");
            }
          }}
          onEscopoModoChange={(modo) => {
            setNovoFluxoEscopoIntegracoesModo(modo);

            if (modo === "todas") {
              setNovoFluxoIntegracoesIds([]);
            }
          }}
          onAlternarIntegracao={alternarIntegracaoEscopoNovoFluxo}
          onQuantidadeInatividadeChange={(valor) => {
            setEncerrarInatividadeQuantidade(
              limitarQuantidadeInatividade(
                valor,
                encerrarInatividadeUnidade
              )
            );
          }}
          onQuantidadeInatividadeBlur={() => {
            setEncerrarInatividadeQuantidade(
              corrigirQuantidadeMinimaInatividade(
                encerrarInatividadeQuantidade,
                encerrarInatividadeUnidade
              )
            );
          }}
          onUnidadeInatividadeChange={(novaUnidade) => {
            setEncerrarInatividadeUnidade(novaUnidade);

            setEncerrarInatividadeQuantidade((valorAtual) =>
              corrigirQuantidadeMinimaInatividade(
                valorAtual,
                novaUnidade
              )
            );
          }}
          onMensagemInatividadeChange={setEncerrarInatividadeMensagem}
          onNovoGatilhoValorChange={setNovoGatilhoValor}
          onNovoGatilhoCondicaoChange={setNovoGatilhoCondicao}
          onAdicionarGatilho={adicionarGatilhoNovoFluxo}
          onAlternarGatilho={(index) => {
            setGatilhosNovoFluxo((atuais) =>
              atuais.map((item, i) =>
                i === index
                  ? {
                      ...item,
                      ativo: item.ativo === false,
                    }
                  : item
              )
            );
          }}
          onRemoverGatilho={(index) => {
            setGatilhosNovoFluxo((atuais) =>
              atuais.filter((_, i) => i !== index)
            );
          }}
          onCancelar={fecharCriacaoFluxo}
          onCriar={criarFluxoRapido}
        />
      )}

        {previaGeracaoDescricaoIa && (
          <IaTokenEstimateModal
            previa={previaGeracaoDescricaoIa}
            processando={
              gerandoDescricaoIaConexao || gerandoDescricoesIaBloco
            }
            formatarTokens={formatarTokens}
            onCancelar={cancelarPreviaGeracaoDescricaoIa}
            onConfirmar={confirmarPreviaGeracaoDescricaoIa}
          />
        )}

        {mostrarModalCustoAgendamento && (
          <DisparoCostConfirmModal
            custo={previewCustoAgendarDisparo}
            onCancelar={() => {
              setMostrarModalCustoAgendamento(false);
              setAcaoPendenteAplicarNo(null);
            }}
            onConfirmar={() => {
              setMostrarModalCustoAgendamento(false);

              if (acaoPendenteAplicarNo) {
                acaoPendenteAplicarNo();
              }

              setAcaoPendenteAplicarNo(null);
            }}
          />
        )}

        {assistenteFluxosAberto && (
          <AssistenteFluxosPanel
            fluxoSelecionado={
              fluxoSelecionado
                ? {
                    id: fluxoSelecionado.id,
                    nome: fluxoSelecionado.nome,
                    status: fluxoSelecionado.status,
                  }
                : null
            }
            nodes={nodes}
            edges={edges}
            onFechar={() => setAssistenteFluxosAberto(false)}
            onFluxoCriado={abrirFluxoCriadoPeloAssistente}
          />
        )}

    </main>
  </>
  );
}

export default function FluxosPage() {
  return (
    <Suspense fallback={null}>
      <FluxosPageContent />
    </Suspense>
  );
}
