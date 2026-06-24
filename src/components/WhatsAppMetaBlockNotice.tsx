"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./WhatsAppMetaBlockNotice.module.css";

type BloqueioMetaResponse = {
  ok: boolean;
  autenticado?: boolean;
  bloqueado?: boolean;
  modal_intervalo_ms?: number;
  titulo?: string;
  descricao?: string;
  acao?: string;
  meta_manager_url?: string;
  help_whatsapp_url?: string;
  integracao?: {
    id: string;
    nome_conexao?: string | null;
    numero?: string | null;
    status?: string | null;
    phone_number_status?: string | null;
    onboarding_erro?: string | null;
  } | null;
};

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

function getStorageKey(integracaoId?: string | null) {
  return `crm-whatsapp-meta-block-modal:${integracaoId || "global"}`;
}

function safeNow() {
  return Date.now();
}

export default function WhatsAppMetaBlockNotice() {
  const [data, setData] = useState<BloqueioMetaResponse | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const bloqueado = data?.ok && data.bloqueado === true;
  const intervaloMs = data?.modal_intervalo_ms || DEFAULT_INTERVAL_MS;
  const integracaoId = data?.integracao?.id || null;

  const storageKey = useMemo(() => getStorageKey(integracaoId), [integracaoId]);

  const deveMostrarModal = useCallback(() => {
    if (!bloqueado || typeof window === "undefined") return false;

    const ultimo = Number(window.localStorage.getItem(storageKey) || "0");
    return !ultimo || safeNow() - ultimo >= intervaloMs;
  }, [bloqueado, intervaloMs, storageKey]);

  const abrirModalSeNecessario = useCallback(() => {
    if (!deveMostrarModal()) return;

    window.localStorage.setItem(storageKey, String(safeNow()));
    setModalAberto(true);
  }, [deveMostrarModal, storageKey]);

  const carregarStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/bloqueio-meta", {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        setData(null);
        setModalAberto(false);
        return;
      }

      let json: BloqueioMetaResponse | null = null;

      try {
        json = (await response.json()) as BloqueioMetaResponse;
      } catch {
        json = null;
      }

      if (!response.ok || !json?.ok || json.autenticado === false) {
        setData(null);
        setModalAberto(false);
        return;
      }

      setData(json);
    } catch {
      setData(null);
      setModalAberto(false);
    }
  }, []);

  useEffect(() => {
    carregarStatus();
  }, [carregarStatus]);

  useEffect(() => {
    abrirModalSeNecessario();

    if (!bloqueado) return;

    const intervalId = window.setInterval(
      abrirModalSeNecessario,
      intervaloMs
    );

    return () => window.clearInterval(intervalId);
  }, [abrirModalSeNecessario, bloqueado, intervaloMs]);

  if (!bloqueado || !data) {
    return null;
  }

  const titulo = data.titulo || "Conta WhatsApp Business desativada pela Meta";
  const descricao =
    data.descricao ||
    "A conta WhatsApp Business vinculada ao CRM foi desativada pela Meta.";
  const acao =
    data.acao ||
    "Acesse o Gerenciador do WhatsApp da Meta para ver os detalhes e solicitar analise.";
  const metaUrl =
    data.meta_manager_url ||
    "https://business.facebook.com/latest/whatsapp_manager";
  const helpUrl = data.help_whatsapp_url || "";

  return (
    <>
      <section className={styles.banner} role="status">
        <div>
          <strong>{titulo}</strong>
          <p>
            {descricao} {acao}
          </p>
        </div>

        <div className={styles.actions}>
          <a href={metaUrl} target="_blank" rel="noreferrer">
            Acessar o Meta
          </a>

          {helpUrl && (
            <a href={helpUrl} target="_blank" rel="noreferrer">
              Pedir ajuda
            </a>
          )}
        </div>
      </section>

      {modalAberto && (
        <div className={styles.overlay} role="presentation">
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-meta-block-title"
          >
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setModalAberto(false)}
              aria-label="Fechar aviso"
            >
              x
            </button>

            <span className={styles.eyebrow}>WhatsApp indisponivel</span>
            <h2 id="whatsapp-meta-block-title">{titulo}</h2>

            <p>{descricao}</p>
            <p>{acao}</p>

            {data.integracao?.numero && (
              <div className={styles.detail}>
                <span>Numero afetado</span>
                <strong>{data.integracao.numero}</strong>
              </div>
            )}

            <div className={styles.modalActions}>
              <a href={metaUrl} target="_blank" rel="noreferrer">
                Acessar Gerenciador do WhatsApp
              </a>

              {helpUrl && (
                <a href={helpUrl} target="_blank" rel="noreferrer">
                  Pedir ajuda
                </a>
              )}
            </div>

            <p className={styles.hint}>
              Este aviso voltara a aparecer a cada 10 minutos enquanto a conta
              estiver desativada.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
