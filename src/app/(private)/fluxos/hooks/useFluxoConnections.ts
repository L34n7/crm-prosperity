"use client";

import { useCallback, useState } from "react";
import { useEdgesState, type Edge } from "@xyflow/react";

const ESTILO_CONEXAO_PADRAO = {
  stroke: "var(--crm-ui-private-content-hex-cbd5e1)",
  strokeWidth: 2,
  strokeDasharray: "6 6",
};

export default function useFluxoConnections() {
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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
