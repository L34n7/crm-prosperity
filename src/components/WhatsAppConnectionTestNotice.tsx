"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./WhatsAppConnectionTestNotice.module.css";

type IntegracaoPendente = {
  id: string;
  nome_conexao?: string | null;
  numero?: string | null;
  setup_completed_at?: string | null;
};

type StatusResponse = {
  ok: boolean;
  pendentes?: IntegracaoPendente[];
};

const POLLING_MS = 15000;

export default function WhatsAppConnectionTestNotice() {
  const [pendentes, setPendentes] = useState<IntegracaoPendente[]>([]);
  const [modalAberto, setModalAberto] = useState(false);

  const carregarStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/teste-conexao", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) return;

      const data = (await response.json()) as StatusResponse;
      if (!data.ok) return;

      setPendentes(data.pendentes || []);
    } catch {
      // O alerta não deve bloquear o uso do CRM em caso de falha temporária.
    }
  }, []);

  useEffect(() => {
    void carregarStatus();
    const intervalId = window.setInterval(carregarStatus, POLLING_MS);
    return () => window.clearInterval(intervalId);
  }, [carregarStatus]);

  useEffect(() => {
    function abrirModalAposOnboarding() {
      void carregarStatus().then(() => setModalAberto(true));
    }

    window.addEventListener("crm_ambiente_configurado", abrirModalAposOnboarding);

    if (window.sessionStorage.getItem("crm_ambiente_configurado") === "true") {
      window.sessionStorage.removeItem("crm_ambiente_configurado");
      window.setTimeout(abrirModalAposOnboarding, 300);
    }

    return () => {
      window.removeEventListener(
        "crm_ambiente_configurado",
        abrirModalAposOnboarding
      );
    };
  }, [carregarStatus]);

  useEffect(() => {
    if (pendentes.length === 0) setModalAberto(false);
  }, [pendentes.length]);

  if (pendentes.length === 0) return null;

  const integracao = pendentes[0];
  const outras = pendentes.length - 1;

  return (
    <>
      <section className={styles.banner} role="status">
        <div>
          <strong>Confirme o recebimento de mensagens no WhatsApp</strong>
          <p>
            Envie uma mensagem de outro celular para {integracao.numero || "o número conectado"}.
            O aviso desaparecerá automaticamente quando o CRM receber a primeira mensagem.
          </p>
        </div>
        <button type="button" onClick={() => setModalAberto(true)}>
          Ver instruções{outras > 0 ? ` (${pendentes.length})` : ""}
        </button>
      </section>

      {modalAberto && (
        <div className={styles.overlay} role="presentation">
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-test-title"
          >
            <button
              type="button"
              className={styles.close}
              onClick={() => setModalAberto(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <span className={styles.eyebrow}>Última etapa</span>
            <h2 id="whatsapp-test-title">Teste a conexão do WhatsApp</h2>
            <p>
              Use outro telefone para enviar uma mensagem para o número abaixo.
              Não envie pelo próprio WhatsApp conectado.
            </p>
            <div className={styles.numberBox}>
              <span>{integracao.nome_conexao || "Integração WhatsApp"}</span>
              <strong>{integracao.numero || "Número não informado"}</strong>
            </div>
            <ol>
              <li>Abra o WhatsApp em outro celular.</li>
              <li>Envie uma mensagem simples, como “Teste”.</li>
              <li>Aguarde a conversa aparecer no CRM.</li>
            </ol>
            <p className={styles.hint}>
              Assim que a primeira mensagem chegar, este alerta será removido automaticamente.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
