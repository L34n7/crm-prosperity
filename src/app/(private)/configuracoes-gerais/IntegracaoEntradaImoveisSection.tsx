"use client";

import { useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import IntegracaoEntradaImoveis from "./IntegracaoEntradaImoveis";
import styles from "./integracao-entrada-imoveis.module.css";

export default function IntegracaoEntradaImoveisSection() {
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  return (
    <div className={styles.sectionWrap}>
      <FeedbackToast
        success={sucesso}
        error={erro}
        onSuccessDismiss={() => setSucesso("")}
        onErrorDismiss={() => setErro("")}
      />
      <IntegracaoEntradaImoveis
        ativo
        onError={(mensagem) => {
          setSucesso("");
          setErro(mensagem);
        }}
        onSuccess={(mensagem) => {
          setErro("");
          setSucesso(mensagem);
        }}
      />
    </div>
  );
}
