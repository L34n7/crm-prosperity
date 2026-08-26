"use client";

import type { ComponentProps } from "react";
import ConsultarEstoqueConfigBase from "./ConsultarEstoqueConfigBase";
import ConsultarEstoqueVariaveisHelp from "./ConsultarEstoqueVariaveisHelp";
import styles from "./ConsultarEstoqueVariaveisHelp.module.css";

export * from "./ConsultarEstoqueConfigBase";

type Props = ComponentProps<typeof ConsultarEstoqueConfigBase>;

export default function ConsultarEstoqueConfig(props: Props) {
  return (
    <div className={styles.wrapper}>
      <ConsultarEstoqueConfigBase {...props} />
      <ConsultarEstoqueVariaveisHelp />
    </div>
  );
}
