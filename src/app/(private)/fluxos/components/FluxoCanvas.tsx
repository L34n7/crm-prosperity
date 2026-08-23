"use client";

import { useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import NodeCustom from "./NodeCustom";
import styles from "../fluxos.module.css";

const nodeTypes = {
  custom: NodeCustom,
};

type FluxoCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  carregandoEstrutura: boolean;
  podeEditarFluxos: boolean;
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  onEditarNode: (node: Node) => void;
  onEditarEdge: (edge: Edge) => void;
};

export default function FluxoCanvas({
  nodes,
  edges,
  carregandoEstrutura,
  podeEditarFluxos,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEditarNode,
  onEditarEdge,
}: FluxoCanvasProps) {
  const ignorarCliqueNodeAposArrasteRef = useRef(false);

  return (
    <div className={styles.canvasArea}>
      {carregandoEstrutura ? (
        <div className={styles.emptyState}>Carregando estrutura...</div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectOnClick={podeEditarFluxos}
          nodesDraggable={podeEditarFluxos}
          nodesConnectable={podeEditarFluxos}
          edgesReconnectable={podeEditarFluxos}
          deleteKeyCode={null}
          onNodeDragStart={() => {
            ignorarCliqueNodeAposArrasteRef.current = true;
          }}
          onNodeDragStop={() => {
            window.setTimeout(() => {
              ignorarCliqueNodeAposArrasteRef.current = false;
            }, 120);
          }}
          onNodeClick={(_, node) => {
            if (!podeEditarFluxos) return;
            if (ignorarCliqueNodeAposArrasteRef.current) return;
            onEditarNode(node);
          }}
          onEdgeClick={(_, edge) => {
            if (!podeEditarFluxos) return;
            onEditarEdge(edge);
          }}
          nodeTypes={nodeTypes}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap />
        </ReactFlow>
      )}
    </div>
  );
}
