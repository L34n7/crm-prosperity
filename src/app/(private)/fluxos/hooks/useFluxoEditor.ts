"use client";

import { useCallback, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";

type UseFluxoEditorOptions = {
  nodes: Node[];
  edges: Edge[];
  onLimparSelecaoVisual?: () => void;
};

export default function useFluxoEditor({
  nodes,
  edges,
  onLimparSelecaoVisual,
}: UseFluxoEditorOptions) {
  const [editandoNodeId, setEditandoNodeId] = useState<string | null>(null);
  const [editandoEdgeId, setEditandoEdgeId] = useState<string | null>(null);
  const [confirmandoExclusaoNo, setConfirmandoExclusaoNo] = useState(false);
  const [confirmandoExclusaoConexao, setConfirmandoExclusaoConexao] =
    useState(false);

  const nodeEditado = useMemo(() => {
    return nodes.find((node) => node.id === editandoNodeId) || null;
  }, [nodes, editandoNodeId]);

  const edgeEditada = useMemo(() => {
    return edges.find((edge) => edge.id === editandoEdgeId) || null;
  }, [edges, editandoEdgeId]);

  const editarNode = useCallback((nodeId: string | null) => {
    setEditandoNodeId(nodeId);
    setEditandoEdgeId(null);
    setConfirmandoExclusaoNo(false);
    setConfirmandoExclusaoConexao(false);
  }, []);

  const editarConexao = useCallback((edgeId: string | null) => {
    setEditandoEdgeId(edgeId);
    setEditandoNodeId(null);
    setConfirmandoExclusaoNo(false);
    setConfirmandoExclusaoConexao(false);
  }, []);

  const fecharPainelEdicao = useCallback(() => {
    setEditandoNodeId(null);
    setEditandoEdgeId(null);
    setConfirmandoExclusaoNo(false);
    setConfirmandoExclusaoConexao(false);
    onLimparSelecaoVisual?.();
  }, [onLimparSelecaoVisual]);

  return {
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
    fecharPainelEdicao,
  };
}
