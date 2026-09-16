"use client";

import { useEffect, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import styles from "./PermitirAcessoCliente.module.css";

type Plano = {
  id: string;
  nome: string;
  slug: string;
};

export default function PermitirAcessoCliente() {
  const [aberto, setAberto] = useState(false);
  const [identificadorLead, setIdentificadorLead] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (!aberto || planos.length > 0 || carregandoPlanos) return;

    async function carregarPlanos() {
      setCarregandoPlanos(true);
      setErro("");

      try {
        const response = await fetch("/api/planos", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          setErro(data.error || "Não foi possível carregar os planos.");
          return;
        }

        setPlanos(data.planos || []);
      } catch {
        setErro("Não foi possível carregar os planos.");
      } finally {
        setCarregandoPlanos(false);
      }
    }

    void carregarPlanos();
  }, [aberto, carregandoPlanos, planos.length]);

  useEffect(() => {
    if (!aberto) return;

    function fecharComEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !enviando) {
        setAberto(false);
      }
    }

    document.addEventListener("keydown", fecharComEscape);
    return () => document.removeEventListener("keydown", fecharComEscape);
  }, [aberto, enviando]);

  function abrirModal() {
    setErro("");
    setAviso("");
    setAberto(true);
  }

  function fecharModal() {
    if (enviando) return;
    setAberto(false);
    setErro("");
    setAviso("");
  }

  async function permitirAcesso() {
    const identificador = identificadorLead.trim();

    setErro("");
    setAviso("");

    if (!identificador) {
      setErro("Informe o ID do lead ou o e-mail do cliente.");
      return;
    }

    if (!planoId) {
      setErro("Selecione o plano que será liberado.");
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch("/api/empresas/permitir-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identificador_lead: identificador,
          plano_id: planoId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível liberar o acesso.");
        return;
      }

      setSucesso(data.message || "Acesso liberado com sucesso.");
      setAviso(data.warning || "");
      setIdentificadorLead("");
      setPlanoId("");

      if (!data.warning) {
        setAberto(false);
      }
    } catch {
      setErro("Não foi possível liberar o acesso.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.launcher} onClick={abrirModal}>
        Permitir acesso
      </button>

      <FeedbackToast
        success={sucesso}
        onSuccessDismiss={() => setSucesso("")}
      />

      {aberto && (
        <div
          className={styles.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) fecharModal();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="permitir-acesso-title"
          >
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Liberação manual</p>
                <h2 id="permitir-acesso-title" className={styles.title}>
                  Permitir acesso
                </h2>
                <p className={styles.description}>
                  Localize o lead, escolha o plano e execute o mesmo fluxo de
                  ativação de um pagamento aprovado.
                </p>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={fecharModal}
                disabled={enviando}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className={styles.body}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="lead-acesso-manual">
                  ID do lead ou e-mail
                </label>
                <input
                  id="lead-acesso-manual"
                  className={styles.input}
                  value={identificadorLead}
                  onChange={(event) => setIdentificadorLead(event.target.value)}
                  placeholder="UUID do lead ou cliente@empresa.com"
                  disabled={enviando}
                  autoFocus
                />
                <p className={styles.helper}>
                  O lead precisa existir no cadastro e possuir um e-mail válido.
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="plano-acesso-manual">
                  Plano
                </label>
                <select
                  id="plano-acesso-manual"
                  className={styles.select}
                  value={planoId}
                  onChange={(event) => setPlanoId(event.target.value)}
                  disabled={enviando || carregandoPlanos}
                >
                  <option value="">
                    {carregandoPlanos
                      ? "Carregando planos..."
                      : "Selecione um plano"}
                  </option>
                  {planos.map((plano) => (
                    <option key={plano.id} value={plano.id}>
                      {plano.nome}
                    </option>
                  ))}
                </select>
              </div>

              {erro && <div className={styles.error}>{erro}</div>}
              {aviso && <div className={styles.warning}>{aviso}</div>}
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={fecharModal}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={permitirAcesso}
                disabled={enviando || carregandoPlanos}
              >
                {enviando ? "Liberando acesso..." : "Permitir acesso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
