"use client";

import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import { CopyPlus } from "lucide-react";
import styles from "../fluxos.module.css";

type PropertiesPanelProps = {
  nodeEditado: Node | null;
  edgeEditada: Edge | null;
  salvando: boolean;
  children: ReactNode;
  onDuplicarNode: (nodeId: string) => void;
  onFechar: () => void;
};

export default function PropertiesPanel({
  nodeEditado,
  edgeEditada,
  salvando,
  children,
  onDuplicarNode,
  onFechar,
}: PropertiesPanelProps) {
  if (!nodeEditado && !edgeEditada) return null;

  return (
    <aside className={styles.propertiesPanel}>
      <div className={styles.propertiesHeader}>
        <h3 className={styles.propertiesTitle}>Editar bloco</h3>

        <div className={styles.propertiesHeaderActions}>
          {nodeEditado && nodeEditado.data?.tipo_no !== "inicio" && (
            <button
              type="button"
              className={styles.duplicateNodeHeaderButton}
              onClick={() => onDuplicarNode(nodeEditado.id)}
              title="Duplicar bloco"
              disabled={salvando}
            >
              <CopyPlus size={17} />
            </button>
          )}

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onFechar}
            title="Fechar"
          >
            ×
          </button>
        </div>
      </div>

      {children}
    </aside>
  );
}
