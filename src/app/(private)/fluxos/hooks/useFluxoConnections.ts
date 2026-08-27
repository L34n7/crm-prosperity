"use client";

import { useCallback, useState, type SetStateAction } from "react";
import { useEdgesState, type Edge } from "@xyflow/react";
import { SAIDAS_CHECKOUT_PAGAMENTO } from "../checkout-pagamento-editor";

const ESTILO_CONEXAO_PADRAO = {
  stroke: "var(--crm-ui-private-content-hex-cbd5e1)",
  strokeWidth: 2,
  strokeDasharray: "6 6",
};

type SaidaCheckoutPagamento = (typeof SAIDAS_CHECKOUT_PAGAMENTO)[number];

const SAIDAS_CHECKOUT_POR_ID: Map<string, SaidaCheckoutPagamento> = new Map(
  SAIDAS_CHECKOUT_PAGAMENTO.map((saida) => [saida.valor, saida])
);

function condicaoDaEdge(edge: Edge) {
  const data = edge.data as
    | { condicao_json?: Record<string, unknown> }
    | undefined;
  return data?.condicao_json || {};
}

function normalizarSaidasCheckout(edges: Edge[]) {
  const fontesCheckout = new Set<string>();

  for (const edge of edges) {
    const handle = String(edge.sourceHandle || "").trim();
    const valor = String(condicaoDaEdge(edge).valor || "").trim();

    if (SAIDAS_CHECKOUT_POR_ID.has(handle)) {
      fontesCheckout.add(edge.source);
    }

    // Estes IDs são exclusivos do checkout e permitem reconstruir os handles
    // depois de recarregar conexões antigas salvas sem sourceHandle.
    if (valor === "pagamento_aprovado" || valor === "expirado_cancelado") {
      fontesCheckout.add(edge.source);
    }
  }

  return edges.map((edge) => {
    const handle = String(edge.sourceHandle || "").trim();
    const condicaoAtual = condicaoDaEdge(edge);
    const valorAtual = String(condicaoAtual.valor || "").trim();
    const valorSaida = SAIDAS_CHECKOUT_POR_ID.has(handle)
      ? handle
      : fontesCheckout.has(edge.source) && SAIDAS_CHECKOUT_POR_ID.has(valorAtual)
        ? valorAtual
        : "";

    if (!valorSaida) return edge;

    const saida = SAIDAS_CHECKOUT_POR_ID.get(valorSaida);
    if (!saida) return edge;

    return {
      ...edge,
      sourceHandle: saida.valor,
      label: saida.titulo,
      data: {
        ...(edge.data || {}),
        rotulo: saida.titulo,
        condicao_json: {
          ...condicaoAtual,
          tipo: "resposta_igual",
          valor: saida.valor,
        },
        usar_ia: false,
        descricao_ia: "",
      },
    } as Edge;
  });
}

function normalizarSaidasCheckoutNoMesmoArray(edges: Edge[]) {
  const normalizados = normalizarSaidasCheckout(edges);
  edges.splice(0, edges.length, ...normalizados);
  return edges;
}

export default function useFluxoConnections() {
  const [edges, setEdgesBase, onEdgesChange] = useEdgesState<Edge>([]);

  const setEdges = useCallback(
    (proximo: SetStateAction<Edge[]>) => {
      if (typeof proximo === "function") {
        setEdgesBase((atuais) => normalizarSaidasCheckout(proximo(atuais)));
        return;
      }

      // O editor também usa o mesmo array logo depois para salvar a estrutura.
      // Normalizamos in-place para garantir que o payload persistido tenha o ID
      // exato do handle escolhido no checkout.
      normalizarSaidasCheckoutNoMesmoArray(proximo);
      setEdgesBase(proximo);
    },
    [setEdgesBase]
  );

  const [rotuloConexao, setRotuloConexao] = useState("");
  const [valorCondicao, setValorCondicao] = useState("");
  const [tipoCondicaoConexao, setTipoCondicaoConexao] =
    useState("resposta_contem");
  const [nomeConexaoEditadoManual, setNomeConexaoEditadoManual] =
    useState(false);

  const [timeoutQuantidade, setTimeoutQuantidade] = useState("2");
  const [timeoutUnidade, setTimeoutUnidade] =
    useState<"minutos" | "horas">("horas");
  const [statusEnvioTimeout, setStatusEnvioTimeout] =
    useState<"qualquer" | "entregue" | "lida">("qualquer");

  const [usarIaConexao, setUsarIaConexao] = useState(false);
  const [descricaoIaConexao, setDescricaoIaConexao] = useState("");
  const [gerandoDescricaoIaConexao, setGerandoDescricaoIaConexao] =
    useState(false);

  const limparSelecaoVisualConexoes = useCallback(() => {
    setEdges((atuais) =>
      atuais.map((edge) => ({
        ...edge,
        selected: false,
        style: {
          ...(edge.style || {}),
          ...ESTILO_CONEXAO_PADRAO,
        },
      }))
    );
  }, [setEdges]);

  const marcarConexaoSelecionada = useCallback(
    (edgeId: string) => {
      setEdges((atuais) =>
        atuais.map((edge) => ({
          ...edge,
          selected: edge.id === edgeId,
          style: {
            ...(edge.style || {}),
            stroke:
              edge.id === edgeId
                ? "var(--crm-ui-private-border-hex-0098bab6)"
                : "var(--crm-ui-private-border-hex-cbd5e1)",
            strokeWidth: edge.id === edgeId ? 3 : 2,
            strokeDasharray: "6 6",
          },
        }))
      );
    },
    [setEdges]
  );

  const resetarFormularioConexao = useCallback(() => {
    setRotuloConexao("");
    setValorCondicao("");
    setTipoCondicaoConexao("resposta_contem");
    setNomeConexaoEditadoManual(false);
    setTimeoutQuantidade("2");
    setTimeoutUnidade("horas");
    setStatusEnvioTimeout("qualquer");
    setUsarIaConexao(false);
    setDescricaoIaConexao("");
    setGerandoDescricaoIaConexao(false);
  }, []);

  return {
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
    resetarFormularioConexao,
  };
}
