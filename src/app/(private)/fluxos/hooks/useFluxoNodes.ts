"use client";

import { useCallback } from "react";
import { useNodesState, type Node } from "@xyflow/react";

export default function useFluxoNodes() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  const marcarNodeSelecionado = useCallback(
    (nodeId: string | null) => {
      setNodes((atuais) =>
        atuais.map((node) => {
          const selecionado = nodeId ? node.id === nodeId : false;

          return {
            ...node,
            selected: selecionado,
            data: {
              ...(node.data || {}),
              isSelecionado: selecionado,
            },
          };
        })
      );
    },
    [setNodes]
  );

  return {
    nodes,
    setNodes,
    onNodesChange,
    marcarNodeSelecionado,
  };
}
