"use client";

import { useCallback, type SetStateAction } from "react";
import { useNodesState, type Node } from "@xyflow/react";
import { consumirDraftCheckoutPagamentoParaAplicar } from "../checkout-pagamento-draft";
import { consumirDraftTipoAgendamentoParaAplicar } from "../agenda-tipo-draft";

function aplicarDraftsNosNodes(nodes: Node[]) {
  const normalizados = nodes.map((node) => {
    const draftCheckout = consumirDraftCheckoutPagamentoParaAplicar(node.id);
    const draftTipoAgendamento =
      consumirDraftTipoAgendamentoParaAplicar(node.id);

    if (!draftCheckout && !draftTipoAgendamento) return node;

    const configuracaoAtual =
      node.data?.configuracao_json &&
      typeof node.data.configuracao_json === "object" &&
      !Array.isArray(node.data.configuracao_json)
        ? (node.data.configuracao_json as Record<string, unknown>)
        : {};

    return {
      ...node,
      data: {
        ...(node.data || {}),
        configuracao_json: {
          ...configuracaoAtual,
          ...(draftCheckout || {}),
          ...(draftTipoAgendamento || {}),
        },
      },
    } as Node;
  });

  // O FluxosEditor salva o mesmo array logo depois de chamar setNodes. A troca
  // in-place garante que o payload de persistência já carregue os drafts
  // aplicados, sem depender do próximo render React.
  nodes.splice(0, nodes.length, ...normalizados);
  return nodes;
}

export default function useFluxoNodes() {
  const [nodes, setNodesBase, onNodesChange] = useNodesState<Node>([]);

  const setNodes = useCallback(
    (proximo: SetStateAction<Node[]>) => {
      if (typeof proximo === "function") {
        setNodesBase(proximo);
        return;
      }

      aplicarDraftsNosNodes(proximo);
      setNodesBase(proximo);
    },
    [setNodesBase]
  );

  const marcarNodeSelecionado = useCallback(
    (nodeId: string | null) => {
      setNodesBase((atuais) =>
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
    [setNodesBase]
  );

  return {
    nodes,
    setNodes,
    onNodesChange,
    marcarNodeSelecionado,
  };
}
