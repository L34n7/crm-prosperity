"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import styles from "./fluxos.module.css";

type Fluxo = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "rascunho" | "ativo" | "pausado" | "arquivado";
  canal: string;
};

type AutomacaoNo = {
  id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  posicao_x: number;
  posicao_y: number;
  configuracao_json: Record<string, any>;
};

type AutomacaoConexao = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: Record<string, any>;
};

type GatilhoFluxo = {
  id: string;
  tipo_gatilho: string;
  valor: string;
  condicao: "contem" | "exata" | "inicia_com" | "regex";
  ativo: boolean;
};

const nodeTypes = {};

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
  return tipo;
}

function corTipoNo(tipo: string) {
  if (tipo === "inicio") return styles.nodeInicio;
  if (tipo === "enviar_texto") return styles.nodeMensagem;
  if (tipo === "pergunta_opcoes") return styles.nodePergunta;
  if (tipo === "transferir_setor") return styles.nodeTransferir;
  if (tipo === "encerrar") return styles.nodeEncerrar;
  return styles.nodePadrao;
}

function dbNoParaReactFlow(no: AutomacaoNo): Node {
  return {
    id: no.id,
    position: {
      x: no.posicao_x || 0,
      y: no.posicao_y || 0,
    },
    data: {
      tipo_no: no.tipo_no,
      titulo: no.titulo,
      descricao: no.descricao,
      configuracao_json: no.configuracao_json || {},
      label: (
        <div className={`${styles.nodeBox} ${corTipoNo(no.tipo_no)}`}>
          <span className={styles.nodeType}>{labelTipoNo(no.tipo_no)}</span>
          <strong className={styles.nodeTitle}>{no.titulo}</strong>
        </div>
      ),
    },
  };
}

function dbConexaoParaReactFlow(conexao: AutomacaoConexao): Edge {
  return {
    id: conexao.id,
    source: conexao.no_origem_id,
    target: conexao.no_destino_id,
    label: conexao.rotulo || undefined,
    animated: true,
    data: {
      condicao_json: conexao.condicao_json || {},
      rotulo: conexao.rotulo || "",
    },
  };
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

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [novoFluxoNome, setNovoFluxoNome] = useState("");
  const [editandoNodeId, setEditandoNodeId] = useState<string | null>(null);
  const [tituloNode, setTituloNode] = useState("");
  const [mensagemNode, setMensagemNode] = useState("");
  const [buscaFluxo, setBuscaFluxo] = useState("");

  const [editandoFluxo, setEditandoFluxo] = useState(false);
  const [nomeFluxoEdicao, setNomeFluxoEdicao] = useState("");
  const [descricaoFluxoEdicao, setDescricaoFluxoEdicao] = useState("");
  const [setorDestino, setSetorDestino] = useState("");

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

const [editandoEdgeId, setEditandoEdgeId] = useState<string | null>(null);
const [rotuloConexao, setRotuloConexao] = useState("");
const [valorCondicao, setValorCondicao] = useState("");

  const nodeEditado = useMemo(() => {
    return nodes.find((node) => node.id === editandoNodeId) || null;
  }, [nodes, editandoNodeId]);

const edgeEditada = useMemo(() => {
  return edges.find((edge) => edge.id === editandoEdgeId) || null;
}, [edges, editandoEdgeId]);

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

  useEffect(() => {
    carregarFluxos();
  }, []);

  useEffect(() => {
    if (fluxoSelecionado?.id) {
      carregarEstrutura(fluxoSelecionado.id);
    }
  }, [fluxoSelecionado?.id]);

  const onConnect = useCallback(
    (connection: Connection) => {
        const novaConexao: Edge = {
        ...connection,
        id: criarIdTemporario("edge"),
        animated: true,
        label: "Condição",
        data: {
            rotulo: "Condição",
            condicao_json: {},
        },
        } as Edge;

      setEdges((eds) => addEdge(novaConexao, eds));
    },
    [setEdges]
  );

async function criarFluxoRapido() {
  try {
    setErro("");
    setSucesso("");

    const nome = novoFluxoNome.trim();

    if (!nome) {
      setErro("Informe o nome do fluxo.");
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
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao criar fluxo.");
    }

    const fluxoCriado = json.fluxo;

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
    }

    setNovoFluxoNome("");
    setDescricaoNovoFluxo("");
    setGatilhosNovoFluxo([]);
    setNovoGatilhoValor("");
    setNovoGatilhoCondicao("contem");
    setAbrirCriacao(false);

    setSucesso("Fluxo criado com sucesso.");
    await carregarFluxos();
    setFluxoSelecionado(fluxoCriado);
  } catch (error: any) {
    setErro(error?.message || "Erro ao criar fluxo.");
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

    const tituloPadrao =
      tipoNo === "inicio"
        ? "Início"
        : tipoNo === "enviar_texto"
        ? "Nova mensagem"
        : tipoNo === "pergunta_opcoes"
        ? "Nova pergunta"
        : tipoNo === "transferir_setor"
        ? "Transferir setor"
        : tipoNo === "encerrar"
        ? "Encerrar"
        : "Novo bloco";

    const novoNoDb: AutomacaoNo = {
      id,
      tipo_no: tipoNo,
      titulo: tituloPadrao,
      descricao: null,
      posicao_x: 180 + nodes.length * 40,
      posicao_y: 120 + nodes.length * 40,
      configuracao_json:
        tipoNo === "enviar_texto"
          ? { mensagem: "Digite a mensagem aqui." }
          : tipoNo === "pergunta_opcoes"
          ? {
              mensagem: "Escolha uma opção:",
              opcoes: [
                { valor: "1", titulo: "Opção 1" },
                { valor: "2", titulo: "Opção 2" },
              ],
            }
          : {},
    };

    const novoNode = dbNoParaReactFlow(novoNoDb);

    setNodes((atuais) => [...atuais, novoNode]);

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
        animated: true,
        label: "Início",
        data: {
            rotulo: "Início",
            condicao_json: {},
        },
        };

        setEdges((atuais) => [...atuais, novaConexao]);
    }
    }

    return;
  }

function abrirEdicaoNo(node: Node) {
  const configuracaoJson = node.data?.configuracao_json as
    | Record<string, any>
    | undefined;

  setEditandoNodeId(node.id);
  setEditandoEdgeId(null);

  setTituloNode(String(node.data?.titulo || ""));
  setMensagemNode(String(configuracaoJson?.mensagem || ""));
  setSetorDestino(configuracaoJson?.setor_id || "");

  if (Array.isArray(configuracaoJson?.opcoes)) {
    setOpcoesNode(configuracaoJson.opcoes);
  } else {
    setOpcoesNode([]);
  }
}

function abrirEdicaoConexao(edge: Edge) {
  const data = edge.data as
    | {
        condicao_json?: Record<string, any>;
        rotulo?: string;
      }
    | undefined;

  const condicao = data?.condicao_json || {};

  setEditandoEdgeId(edge.id);
  setEditandoNodeId(null);

  setRotuloConexao(String(edge.label || data?.rotulo || ""));
  setValorCondicao(String(condicao.valor || ""));
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
    if (!editandoNodeId) return;

    setNodes((atuais) =>
      atuais.map((node) => {
        if (node.id !== editandoNodeId) return node;

        const tipoNo = String(node.data?.tipo_no || "enviar_texto");
        const configuracaoAtual = (node.data?.configuracao_json || {}) as Record<
          string,
          any
        >;

        const configuracao_json = {
        ...configuracaoAtual,
        mensagem: mensagemNode,
        ...(tipoNo === "pergunta_opcoes" ? { opcoes: opcoesNode } : {}),
        ...(tipoNo === "transferir_setor"
            ? { setor_id: setorDestino }
            : {}),
        };

        return dbNoParaReactFlow({
          id: node.id,
          tipo_no: tipoNo,
          titulo: tituloNode || "Bloco",
          descricao: String(node.data?.descricao || "") || null,
          posicao_x: node.position.x,
          posicao_y: node.position.y,
          configuracao_json,
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

        return {
            ...edge,
            label: rotuloConexao || valorCondicao || "Condição",
            data: {
            ...(edge.data || {}),
            rotulo: rotuloConexao,
            condicao_json: valorCondicao
                ? {
                    tipo: "resposta_igual",
                    valor: valorCondicao,
                }
                : {},
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
      }));

    const conexoesParaSalvar = edges.map((edge, index) => {
    const data = edge.data as
        | {
            condicao_json?: Record<string, any>;
            rotulo?: string;
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

  return (
    <main className={styles.pageContent}>
      <aside className={styles.sidebarFluxos}>
        <div className={styles.sidebarHeader}>
          <p className={styles.eyebrow}>Automações</p>
          <h1 className={styles.sidebarTitle}>Fluxos</h1>
          <p className={styles.sidebarSubtitle}>
            Selecione um fluxo ou crie um novo.
          </p>
        </div>

        <div className={styles.createFlowBox}>
            {!abrirCriacao ? (
                <button
                className={styles.primaryButton}
                onClick={() => setAbrirCriacao(true)}
                >
                + Novo fluxo
                </button>
            ) : (
                <div className={styles.createFlowForm}>
                <input
                    className={styles.input}
                    value={novoFluxoNome}
                    onChange={(e) => setNovoFluxoNome(e.target.value)}
                    placeholder="Nome do fluxo"
                />

                <textarea
                    className={styles.textarea}
                    value={descricaoNovoFluxo}
                    onChange={(e) => setDescricaoNovoFluxo(e.target.value)}
                    placeholder="Descrição (opcional)"
                />

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
                        <strong className={styles.gatilhoValor}>{gatilho.valor}</strong>
                        <p className={styles.gatilhoMeta}>
                            Condição:{" "}
                            {gatilho.condicao === "contem"
                            ? "Contém a palavra"
                            : gatilho.condicao === "exata"
                            ? "Igual exatamente"
                            : gatilho.condicao === "inicia_com"
                            ? "Começa com"
                            : gatilho.condicao}{" "}
                            · Ativo
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

                <div className={styles.createFlowActions}>
                    <button
                    className={styles.secondaryButton}
                    onClick={() => setAbrirCriacao(false)}
                    >
                    Cancelar
                    </button>

                    <button
                    className={styles.primaryButton}
                    onClick={criarFluxoRapido}
                    >
                    Criar
                    </button>
                </div>
                </div>
            )}
        </div>

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
        <option value="todos">Todos os fluxos</option>
        <option value="ativo">Ativos</option>
        <option value="rascunho">Rascunhos</option>
        <option value="pausado">Pausados</option>
        <option value="arquivado">Arquivados</option>
        </select>

        <input
        className={styles.input}
        placeholder="Buscar fluxo..."
        value={buscaFluxo}
        onChange={(e) => setBuscaFluxo(e.target.value)}
        />

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
                    onClick={() => setFluxoSelecionado(fluxo)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                        setFluxoSelecionado(fluxo);
                        }
                    }}
                    >
                    <span className={styles.flowItemTitle}>{fluxo.nome}</span>
                    <span className={badgeClass(fluxo.status)}>
                    {fluxo.status}
                    </span>

                    {fluxo.status === "arquivado" ? (
                    <>
                        <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            restaurarFluxo(fluxo);
                        }}
                        >
                        Restaurar
                        </button>

                        <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            abrirModalApagarDefinitivo(fluxo);
                        }}
                        >
                        Apagar definitivo
                        </button>
                    </>
                    ) : (
                    <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={(e) => {
                        e.stopPropagation();
                        abrirModalArquivarFluxo(fluxo);
                        }}
                    >
                        Apagar
                    </button>
                    )}
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
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => adicionarNo("enviar_texto")}
              disabled={!fluxoSelecionado || fluxoSelecionado.status === "arquivado"}
            >
              + Mensagem
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => adicionarNo("pergunta_opcoes")}
              disabled={!fluxoSelecionado || fluxoSelecionado.status === "arquivado"}
            >
              + Pergunta
            </button>

            <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => adicionarNo("transferir_setor")}
            disabled={!fluxoSelecionado || fluxoSelecionado.status === "arquivado"}
            >
            + Transferir
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => adicionarNo("encerrar")}
              disabled={!fluxoSelecionado || fluxoSelecionado.status === "arquivado"}
            >
              + Encerrar
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={salvarEstrutura}
              disabled={!fluxoSelecionado || salvando || fluxoSelecionado.status === "arquivado"}
            >
              {salvando ? "Salvando..." : "Salvar fluxo"}
            </button>

            <button
            type="button"
            className={styles.secondaryButton}
            onClick={abrirEdicaoFluxo}
            disabled={!fluxoSelecionado || fluxoSelecionado.status === "arquivado"}
            >
            Editar fluxo
            </button>

            <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => fluxoSelecionado && duplicarFluxo(fluxoSelecionado)}
            disabled={!fluxoSelecionado || fluxoSelecionado.status === "arquivado"}
            >
            Duplicar
            </button>
          </div>
        </header>

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
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => abrirEdicaoNo(node)}
                onEdgeClick={(_, edge) => abrirEdicaoConexao(edge)}
                fitView
                nodeTypes={nodeTypes}
              >
                <Background />
                <Controls />
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
                    <label className={styles.field}>
                    <span className={styles.label}>Tipo</span>
                    <input
                        className={styles.input}
                        value={labelTipoNo(String(nodeEditado.data?.tipo_no))}
                        disabled
                    />
                    </label>

                    <label className={styles.field}>
                    <span className={styles.label}>Título</span>
                    <input
                        className={styles.input}
                        value={tituloNode}
                        onChange={(e) => setTituloNode(e.target.value)}
                    />
                    </label>

                    {(nodeEditado.data?.tipo_no === "enviar_texto" ||
                    nodeEditado.data?.tipo_no === "pergunta_opcoes") && (
                    <label className={styles.field}>
                        <span className={styles.label}>Mensagem</span>
                        <textarea
                        className={styles.textarea}
                        value={mensagemNode}
                        onChange={(e) => setMensagemNode(e.target.value)}
                        />
                    </label>
                    )}

                    {nodeEditado.data?.tipo_no === "pergunta_opcoes" && (
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

                    {nodeEditado.data?.tipo_no === "transferir_setor" && (
                    <>
                        <label className={styles.field}>
                        <span className={styles.label}>Mensagem</span>
                        <textarea
                            className={styles.textarea}
                            value={mensagemNode}
                            onChange={(e) => setMensagemNode(e.target.value)}
                            placeholder="Ex: Vou te encaminhar para um atendente..."
                        />
                        </label>

                        <label className={styles.field}>
                        <span className={styles.label}>Setor destino</span>
                        <input
                            className={styles.input}
                            value={setorDestino}
                            onChange={(e) => setSetorDestino(e.target.value)}
                            placeholder="Ex: suporte"
                        />
                        </label>
                    </>
                    )}

                    {nodeEditado.data?.tipo_no !== "inicio" && (
                        <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => removerNode(nodeEditado.id)}
                        >
                            Excluir bloco
                        </button>
                    )}

                    <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={aplicarEdicaoNo}
                    >
                    Aplicar no bloco
                    </button>

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
                        value={rotuloConexao}
                        onChange={(e) => setRotuloConexao(e.target.value)}
                        placeholder="Ex: Cliente escolheu 1"
                    />
                    </label>

                    <label className={styles.field}>
                    <span className={styles.label}>Resposta esperada</span>
                    <input
                        className={styles.input}
                        value={valorCondicao}
                        onChange={(e) => setValorCondicao(e.target.value)}
                        placeholder="Ex: 1"
                    />
                    <p className={styles.help}>
                        Se o cliente digitar esse valor, o fluxo seguirá por esta conexão.
                    </p>
                    </label>

                    <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => edgeEditada && removerConexao(edgeEditada.id)}
                    >
                    Excluir conexão
                    </button>

                    <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={aplicarEdicaoConexao}
                    >
                    Aplicar na conexão
                    </button>

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
    </main>
  );
}