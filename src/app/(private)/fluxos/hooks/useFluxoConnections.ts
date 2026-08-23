"use client";

import { useCallback, useState } from "react";
import { useEdgesState, type Edge } from "@xyflow/react";

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
    resetarFormularioConexao,
  };
}
