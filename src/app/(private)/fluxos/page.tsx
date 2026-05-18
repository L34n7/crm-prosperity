"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import Header from "@/components/Header";
import "@xyflow/react/dist/style.css";
import styles from "./fluxos.module.css";
import { Handle } from "@xyflow/react";
import { gerarSugestaoDescricaoIA } from "@/lib/ia/sugestoes-descricao-ia";

type Fluxo = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "rascunho" | "ativo" | "pausado" | "arquivado";
  canal: string;
  fluxo_padrao?: boolean;
  created_at?: string;
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

const LIMITE_VIDEO_BYTES = 16 * 1024 * 1024;
const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
const LIMITE_AUDIO_BYTES = 16 * 1024 * 1024;

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
  if (tipo === "avaliacao") return "Avaliação";
  if (tipo === "capturar_resposta") return "Captura";
  if (tipo === "agendar_disparo") return "Agendar disparo";
  if (tipo === "interpretar_arquivo_ia") return "Inter. arquivo IA";
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
  if (tipo === "avaliacao") return styles.nodeAvaliacao;
  if (tipo === "capturar_resposta") return styles.nodePergunta;
  if (tipo === "agendar_disparo") return styles.nodeAgendarDisparo;
  if (tipo === "interpretar_arquivo_ia") return styles.nodeArquivoIA;
  return styles.nodePadrao;
}

function tituloPadraoTipoNo(tipo: string) {
  if (tipo === "inicio") return "Início";
  if (tipo === "enviar_texto") return "Nova mensagem";
  if (tipo === "pergunta_opcoes") return "Nova pergunta";
  if (tipo === "enviar_botoes") return "Pergunta botões";
  if (tipo === "transferir_setor") return "Transferir setor";
  if (tipo === "encerrar") return "Encerrar";
  if (tipo === "enviar_imagem") return "Nova imagem";
  if (tipo === "enviar_video") return "Novo vídeo";
  if (tipo === "enviar_audio") return "Novo áudio";
  if (tipo === "avaliacao") return "Avaliação";
  if (tipo === "capturar_resposta") return "Capturar resposta";
  if (tipo === "agendar_disparo") return "Agendar disparo";
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
    tipoNo === "interpretar_arquivo_ia"
  );
}

function tipoCondicaoPadraoPorTipoNo(tipoNo: string) {
  if (tipoNo === "capturar_resposta") return "sempre";

  return tipoNoEsperaResposta(tipoNo) ? "resposta_contem" : "sempre";
}

function rotuloPadraoPorTipoNo(tipoNo: string) {
  return tipoNoEsperaResposta(tipoNo) ? "Condição" : "Sempre seguir";
}

function dbNoParaReactFlow(no: AutomacaoNo): Node {
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
      configuracao_json: no.configuracao_json || {},
      delay_segundos: no.delay_segundos ?? null,
      isNovo: false,
    },
  };
}

function NodeCustom({ data }: any) {
  return (
    <div
        className={`${styles.nodeBox} ${corTipoNo(data.tipo_no)} ${
          data.isNovo ? styles.nodeNovo : ""
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
        <strong className={styles.nodeTitle}>{tituloVisivelCard(data)}</strong>
      </div>

      <Handle type="source" position={Position.Right} className={styles.nodeHandle} />
    </div>
  );
}

export default function FluxosPage() {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [fluxoSelecionado, setFluxoSelecionado] = useState<Fluxo | null>(null);
  const [abrirCriacao, setAbrirCriacao] = useState(false);
  const [descricaoNovoFluxo, setDescricaoNovoFluxo] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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

  const [timeoutUnidade, setTimeoutUnidade] =
    useState<"minutos" | "horas">("horas");
  const [statusEnvioTimeout, setStatusEnvioTimeout] =
    useState<"qualquer" | "entregue" | "lida">("qualquer");

  const [editandoFluxo, setEditandoFluxo] = useState(false);
  const [nomeFluxoEdicao, setNomeFluxoEdicao] = useState("");
  const [descricaoFluxoEdicao, setDescricaoFluxoEdicao] = useState("");
  const [setorDestino, setSetorDestino] = useState("");
  const [nodeNovoId, setNodeNovoId] = useState<string | null>(null);
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

  const [opcoesNode, setOpcoesNode] = useState<
    { valor: string; titulo: string }[]
  >([]);

  const [botoesNode, setBotoesNode] = useState<
    { id: string; titulo: string }[]
  >([]);

  const [editandoEdgeId, setEditandoEdgeId] = useState<string | null>(null);
  const [rotuloConexao, setRotuloConexao] = useState("");
  const [valorCondicao, setValorCondicao] = useState("");
  const [tipoCondicaoConexao, setTipoCondicaoConexao] =
    useState("resposta_contem");

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

  const [arquivoInstrucaoIaNode, setArquivoInstrucaoIaNode] = useState("");
  const [arquivoMensagemErroNode, setArquivoMensagemErroNode] = useState("");

  const [agendarDisparoTemplateIdNode, setAgendarDisparoTemplateIdNode] = useState("");
  const [agendarDisparoQuantidadeNode, setAgendarDisparoQuantidadeNode] = useState("32");
  const [agendarDisparoUnidadeNode, setAgendarDisparoUnidadeNode] =
    useState<"horas" | "dias">("horas");
  const [agendarDisparoVariaveisNode, setAgendarDisparoVariaveisNode] = useState("");
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


  async function enviarNovaMidia(arquivo: File) {
    try {
      setEnviandoMidia(true);
      setErro("");
      setSucesso("");

      const formData = new FormData();
      formData.append("arquivo", arquivo);

      const res = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao enviar mídia.");
      }

      setMidiaUrlNode(json.midia.url);
      setMidiaNomeNode(json.midia.nome);

      setMidias((atuais) => {
        const jaExiste = atuais.some((m) => m.id === json.midia.id);

        if (jaExiste) {
          return atuais;
        }

        return [json.midia, ...atuais];
      });

      setSucesso("Mídia enviada com sucesso.");

      await carregarMidias();

    } catch (error: any) {
      setErro(error?.message || "Erro ao enviar mídia.");
    } finally {
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

  function dbConexaoParaReactFlow(conexao: AutomacaoConexao): Edge {
    const ehSempreSeguir = conexao.condicao_json?.tipo === "sempre";
    const offsetY = offsetLabelConexao(conexao.id);
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
        : conexao.rotulo || conexao.condicao_json?.valor || "",

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
    setSucesso("");
    setErroCriacaoFluxo("");

    const nome = novoFluxoNome.trim();

    if (!nome) {
      setErroCriacaoFluxo("Informe o nome do fluxo.");
      return;
    }

    if (!novoFluxoPadrao && gatilhosNovoFluxo.length === 0) {
      setErroCriacaoFluxo("Adicione pelo menos um gatilho.");
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
        fluxo_padrao: novoFluxoPadrao,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao criar fluxo.");
    }

    const fluxoCriado = json.fluxo;

    if (!novoFluxoPadrao) {
      for (const gatilho of gatilhosNovoFluxo) {
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

    const novoNoDb: AutomacaoNo = {
      id,
      tipo_no: tipoNo,
      titulo: tituloPadrao,
      descricao: null,
      posicao_x:
        nodes.length > 0
          ? nodes[nodes.length - 1].position.x + 230
          : 180,

      posicao_y:
        nodes.length > 0
          ? nodes[nodes.length - 1].position.y
          : 220,
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

    const novoNode = {
      ...novoNodeBase,
      data: {
        ...novoNodeBase.data,
        isNovo: true,
      },
    };

    setNodes((atuais) => [...atuais, novoNode]);

    setNodeNovoId(id);

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

  function abrirEdicaoNo(node: Node) {
    const configuracaoJson = node.data?.configuracao_json as
      | Record<string, any>
      | undefined;

    setEditandoNodeId(node.id);
    setTipoNodeEdicao(String(node.data?.tipo_no || ""));
    setEditandoEdgeId(null);

    setTituloNode(String(node.data?.titulo || ""));
    setMensagemNode(String(configuracaoJson?.mensagem || ""));
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
        ? configuracaoJson.variaveis.join("\n")
        : ""
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

  setEditandoEdgeId(edge.id);
  setEditandoNodeId(null);

  setRotuloConexao(String(data?.rotulo || ""));
  setValorCondicao(String(condicao.valor || ""));
  setConfirmandoExclusaoConexao(false);

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
  if (tipoNodeEdicao === "agendar_disparo") {
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

  setNodes((atuais) =>
    atuais.map((node) => {
      if (node.id !== editandoNodeId) return node;

      const tipoAtual = String(node.data?.tipo_no || "enviar_texto");
      const tipoFinal = tipoAtual === "inicio" ? "inicio" : tipoNodeEdicao;

      let configuracao_json: Record<string, any> = {};

      if (
        tipoFinal === "enviar_texto" ||
        tipoFinal === "pergunta_opcoes" ||
        tipoFinal === "enviar_botoes" ||
        tipoFinal === "enviar_imagem" ||
        tipoFinal === "enviar_video" ||
        tipoFinal === "enviar_audio" ||
        tipoFinal === "transferir_setor" ||
        tipoFinal === "encerrar" ||
        tipoFinal === "avaliacao" ||
        tipoFinal === "capturar_resposta" ||
        tipoFinal === "interpretar_arquivo_ia"
      ) {
        configuracao_json.mensagem = mensagemNode;
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
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (tipoFinal === "pergunta_opcoes") {
        configuracao_json.opcoes = opcoesNode;
      }

      if (tipoFinal === "enviar_botoes") {
        configuracao_json.botoes = botoesNode;
      }

      if (
        tipoFinal === "pergunta_opcoes" ||
        tipoFinal === "enviar_botoes" ||
        tipoFinal === "capturar_resposta" ||
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
          .split("\n")
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

      return dbNoParaReactFlow({
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
            : delayNode !== ""
            ? Math.max(0, Number(delayNode))
            : null,
      });
    })
  );

  setSucesso("Bloco atualizado. Clique em Salvar fluxo para gravar no banco.");
}

function aplicarEdicaoConexao() {
  if (!editandoEdgeId) return;

  setEdges((atuais) =>
    atuais.map((edge) => {
      if (edge.id !== editandoEdgeId) return edge;

      const ehSempreSeguir = tipoCondicaoConexao === "sempre";
      const ehTimeout = tipoCondicaoConexao === "timeout_sem_resposta";

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
        label: ehSempreSeguir
          ? ""
          : ehTimeout
          ? `Sem resposta em ${timeoutQuantidade} ${timeoutUnidade}`
          : rotuloConexao || valorCondicao || "Condição",

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

function abrirEdicaoFluxo() {
  if (!fluxoSelecionado) return;

  setEditandoFluxo(true);
  setNomeFluxoEdicao(fluxoSelecionado.nome || "");
  setDescricaoFluxoEdicao(fluxoSelecionado.descricao || "");
  setNovoGatilhoValor("");
  setNovoGatilhoCondicao("contem");

  carregarGatilhosFluxo(fluxoSelecionado.id);
}

async function salvarEdicaoFluxo() {
  if (!fluxoSelecionado) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch("/api/automacoes", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: fluxoSelecionado.id,
        nome: nomeFluxoEdicao,
        descricao: descricaoFluxoEdicao,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao editar fluxo.");
    }

    setSucesso("Fluxo atualizado com sucesso.");
    setEditandoFluxo(false);
    setFluxoSelecionado(json.fluxo);
    await carregarFluxos();
  } catch (error: any) {
    setErro(error?.message || "Erro ao editar fluxo.");
  }
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

  async function salvarEstrutura() {
    if (!fluxoSelecionado) {
      setErro("Selecione um fluxo primeiro.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const nosParaSalvar = nodes.map((node) => ({
        id: node.id,
        tipo_no: node.data?.tipo_no,
        titulo: node.data?.titulo,
        descricao: node.data?.descricao || null,
        posicao_x: node.position.x,
        posicao_y: node.position.y,
        configuracao_json: node.data?.configuracao_json || {},
        delay_segundos:
          node.data?.tipo_no === "inicio"
            ? null
            : node.data?.delay_segundos != null
            ? Math.max(0, Number(node.data.delay_segundos))
            : null,
      }));

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
  if (!fluxoSelecionado) return;

  try {
    setErro("");
    setSucesso("");

    const valor = novoGatilhoValor.trim();

    if (!valor) {
      setErro("Informe a palavra-chave do gatilho.");
      return;
    }

    const res = await fetch(
      `/api/automacoes/${fluxoSelecionado.id}/gatilhos`,
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
    await carregarGatilhosFluxo(fluxoSelecionado.id);
  } catch (error: any) {
    setErro(error?.message || "Erro ao criar gatilho.");
  }
}

async function removerGatilhoFluxo(gatilhoId: string) {
  if (!fluxoSelecionado) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch(
      `/api/automacoes/${fluxoSelecionado.id}/gatilhos`,
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
    await carregarGatilhosFluxo(fluxoSelecionado.id);
  } catch (error: any) {
    setErro(error?.message || "Erro ao remover gatilho.");
  }
}

async function alternarGatilhoFluxo(gatilho: GatilhoFluxo) {
  if (!fluxoSelecionado) return;

  try {
    setErro("");
    setSucesso("");

    const res = await fetch(
      `/api/automacoes/${fluxoSelecionado.id}/gatilhos`,
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

    await carregarGatilhosFluxo(fluxoSelecionado.id);
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

function validarFluxoAntesDeAtivar() {
  if (!fluxoSelecionado) {
    return "Selecione um fluxo.";
  }

  const inicio = nodes.find((node) => node.data?.tipo_no === "inicio");

  if (!inicio) {
    return "Adicione um bloco de início antes de ativar o fluxo.";
  }

  const conexaoSaindoDoInicio = edges.some((edge) => edge.source === inicio.id);

  if (!conexaoSaindoDoInicio) {
    return "O bloco de início precisa estar conectado a outro bloco.";
  }

  const temBlocoFinal = nodes.some(
    (node) =>
      node.data?.tipo_no === "encerrar" ||
      node.data?.tipo_no === "transferir_setor"
  );

  if (!temBlocoFinal) {
    return "Adicione pelo menos um bloco final: Encerrar ou Transferir.";
  }

  for (const node of nodes) {
    const tipoNo = String(node.data?.tipo_no || "");
    const config = (node.data?.configuracao_json || {}) as Record<string, any>;

    if (tipoNo === "enviar_texto" && !String(config.mensagem || "").trim()) {
      return `O bloco "${node.data?.titulo}" precisa ter uma mensagem.`;
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

      const quantidade = Number(config.tempo_quantidade || 0);

      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return `O bloco "${node.data?.titulo}" precisa ter um tempo válido para agendar o disparo.`;
      }

      if (!["horas", "dias"].includes(String(config.tempo_unidade || ""))) {
        return `O bloco "${node.data?.titulo}" precisa ter uma unidade válida.`;
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
    if (status === "pausado") return `${styles.badge} ${styles.badgeYellow}`;
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

useEffect(() => {
  function handleClick() {
    setMenuFluxo(null);
  }
  window.addEventListener("click", handleClick);
  return () => window.removeEventListener("click", handleClick);
}, []);

useEffect(() => {
  if (tipoNodeEdicao !== "agendar_disparo") {
    setPreviewCustoAgendarDisparo(null);
    return;
  }

  const categoria = String(
    templateAgendarDisparoSelecionado?.categoria || ""
  ).toLowerCase();

  if (!categoria) {
    setPreviewCustoAgendarDisparo(null);
    return;
  }

  calcularPreviewCustoAgendarDisparo(categoria);
}, [
  tipoNodeEdicao,
  templateAgendarDisparoSelecionado?.id,
  templateAgendarDisparoSelecionado?.categoria,
]);

  return (
    <>
      <Header
        title="Fluxos de automação"
        subtitle="Monte fluxos visuais para automatizar atendimentos, direcionar clientes e escalar suas conversas no WhatsApp."
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
              onClick={() => {
                setErroCriacaoFluxo("");
                setAbrirCriacao(true);
              }}
            >
              +
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
                  onClick={abrirEdicaoFluxo}
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
                          adicionarNo("agendar_disparo");
                        }}
                      >
                        + Agendar disparo
                      </button>

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

          {(erro || sucesso) && (
          <div className={styles.alertArea}>
            {erro && <div className={styles.errorAlert}>{erro}</div>}
            {sucesso && <div className={styles.successAlert}>{sucesso}</div>}
          </div>
        )}

        <div className={styles.editorBody}>
          <div className={styles.canvasArea}>
            {carregandoEstrutura ? (
              <div className={styles.emptyState}>Carregando estrutura...</div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{
                  padding: 0.25,
                }}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => {
                  abrirEdicaoNo(node);

                  if (node.id === nodeNovoId) {
                    setNodeNovoId(null);
                  }
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
                      onClick={() => {
                        setEditandoNodeId(null);
                        setEditandoEdgeId(null);
                        setConfirmandoExclusaoNo(false);
                        setConfirmandoExclusaoConexao(false);
                        
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
                      }}
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
                        <option value="agendar_disparo">Agendar disparo</option>
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
                    "enviar_imagem",
                    "enviar_video",
                    "enviar_audio",
                    "transferir_setor",
                    "encerrar",
                    "avaliacao",
                    "capturar_resposta",
                    "interpretar_arquivo_ia",
                  ].includes(tipoNodeEdicao) && (
                    <label className={styles.field}>
                      <span className={styles.label}>
                        {tipoNodeEdicao === "pergunta_opcoes"
                          ? "Pergunta"
                          : tipoNodeEdicao === "enviar_botoes"
                          ? "Pergunta dos botões"
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
                    </label>
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

                          <label className={styles.secondaryButton}>
                            {enviandoMidia ? "Enviando..." : "Subir nova mídia"}

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
                              disabled={enviandoMidia}
                              onChange={(e) => {
                                const arquivo = e.target.files?.[0];

                                if (!arquivo) return;

                                setErro("");
                                setSucesso("");

                                if (arquivo.type.startsWith("image/")) {
                                  if (arquivo.size > 5 * 1024 * 1024) {
                                    setErro("A imagem deve ter no máximo 5MB.");
                                    return;
                                  }
                                }

                                if (arquivo.type.startsWith("video/")) {
                                  if (arquivo.size > 16 * 1024 * 1024) {
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
                            Imagens até 5MB, vídeos até 16MB e áudios até 16MB. Se o arquivo for maior, reduza antes
                            de enviar.
                          </span>
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
                            <input
                              className={styles.optionValueInput}
                              value={opcao.valor}
                              onChange={(e) =>
                                atualizarOpcaoPergunta(index, "valor", e.target.value)
                              }
                              placeholder="1"
                            />

                            <input
                              className={styles.input}
                              value={opcao.titulo}
                              onChange={(e) =>
                                atualizarOpcaoPergunta(index, "titulo", e.target.value)
                              }
                              placeholder="Comercial"
                            />

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

                      <label className={styles.field}>
                        <span className={styles.label}>Variáveis do template</span>

                        <textarea
                          className={styles.textarea}
                          value={agendarDisparoVariaveisNode}
                          onChange={(e) => setAgendarDisparoVariaveisNode(e.target.value)}
                          placeholder={"Uma variável por linha.\nEx:\n{{nome}}\n{{telefone}}"}
                        />

                        <span className={styles.help}>
                          Use uma variável por linha. Na próxima etapa, o motor vai substituir esses valores antes de enviar.
                        </span>

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
                      </label>
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
                          placeholder={`valor\nbanco\npagador\ndata\nid_transacao`}
                        />

                        <span className={styles.help}>
                          Informe uma variável por linha. A IA só poderá retornar esses campos.
                          Exemplo: valor, banco, pagador. Depois você poderá usar como
                          {" "}{"{{analise_arquivo_valor}}"}.
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
                            <strong>erro</strong> — quando o arquivo está ilegível ou não pôde ser analisado.
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

                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="0"
                          className={styles.delayInput}
                          value={delayNode}
                          onChange={(e) => {
                            const valor = e.target.value;

                            if (valor === "") {
                              setDelayNode("");
                              return;
                            }

                            const numero = Number(valor);

                            if (numero < 0) {
                              setDelayNode("0");
                              return;
                            }

                            setDelayNode(valor);
                          }}
                        />
                      </div>

                      <span className={styles.help}>
                        Delay adicional antes do envio deste bloco. Deixe vazio para envio imediato.
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
                      type="submit"
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
                        onChange={(e) => setRotuloConexao(e.target.value)}
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
                        <span className={styles.label}>Resposta esperada 
                           <span className={styles.botaoRespostaLabel2}> * ID da resposta</span>
                        </span>
                        <input
                          className={styles.input}
                          value={valorCondicao}
                          onChange={(e) => {
                            const novoValor = e.target.value;

                            setValorCondicao(novoValor);

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
                onClick={() => setEditandoFluxo(false)}
                >
                ×
                </button>
            </div>

            <div className={styles.modalBody}>
                <label className={styles.field}>
                <span className={styles.label}>Nome</span>
                <input
                    className={styles.input}
                    value={nomeFluxoEdicao}
                    onChange={(e) => setNomeFluxoEdicao(e.target.value)}
                />
                </label>

                <label className={styles.field}>
                <span className={styles.label}>Descrição</span>
                <textarea
                    className={styles.textarea}
                    value={descricaoFluxoEdicao}
                    onChange={(e) => setDescricaoFluxoEdicao(e.target.value)}
                />
                </label>
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
            </div>

            <div className={styles.modalFooter}>
                <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setEditandoFluxo(false)}
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
                    restaurado depois.
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
                    abrirEdicaoFluxo();
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