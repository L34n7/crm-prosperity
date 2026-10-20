"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, RefreshCw, X } from "lucide-react";
import styles from "./WhiteLabelAssinaturaModal.module.css";

type WhiteLabelAssinaturaResumo = {
  subscription: {
    status: string;
    current_period_end: string | null;
    next_due_at: string | null;
    current_amount_cents: number;
    next_amount_cents: number;
    is_free: boolean;
  };
  white_label: {
    nome: string;
    valor_base_centavos: number;
    numeros_adicionais: number;
    preco_numero_adicional_centavos: number;
    valor_numeros_adicionais_centavos: number;
    usuarios_adicionais: number;
    preco_usuario_adicional_centavos: number;
    valor_usuarios_adicionais_centavos: number;
    valor_total_centavos: number;
  };
  warning?: string | null;
};

type Props = {
  enabled: boolean;
};

function moeda(valorCentavos: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valorCentavos || 0) / 100);
}

function data(valor: string | null | undefined) {
  if (!valor) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor));
}

function statusLabel(status: string) {
  const normalizado = String(status || "").toLowerCase();
  if (normalizado === "active" || normalizado === "ativa") return "Ativa";
  if (normalizado === "past_due" || normalizado === "vencida") return "Vencida";
  if (normalizado === "blocked" || normalizado === "bloqueada") return "Bloqueada";
  if (normalizado === "cancelled" || normalizado === "canceled") return "Cancelada";
  return status || "Ativa";
}

export default function WhiteLabelAssinaturaModal({ enabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [resumo, setResumo] = useState<WhiteLabelAssinaturaResumo | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async () => {
    if (!enabled) return;

    setCarregando(true);
    setErro("");
    setMensagem("");

    try {
      const response = await fetch("/api/white-label/assinatura", {
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error || "Não foi possível carregar a assinatura White Label."
        );
      }

      setResumo(json);
      if (json.warning) setMensagem(json.warning);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a assinatura White Label."
      );
    } finally {
      setCarregando(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function abrir(event: Event) {
      const customEvent = event as CustomEvent<{ handled?: boolean }>;
      if (customEvent.detail) customEvent.detail.handled = true;

      setAberto(true);
      void carregar();
    }

    window.addEventListener("assinatura:abrir-modal-planos", abrir);

    return () => {
      window.removeEventListener("assinatura:abrir-modal-planos", abrir);
    };
  }, [carregar, enabled]);

  async function pagarMensalidade() {
    if (pagando) return;

    const novaAba = window.open("about:blank", "_blank");

    if (!novaAba) {
      setErro(
        "O navegador bloqueou a nova aba. Permita pop-ups e tente novamente."
      );
      return;
    }

    novaAba.opener = null;
    setPagando(true);
    setErro("");
    setMensagem("");

    try {
      const response = await fetch("/api/white-label/assinatura", {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok || !json?.ok) {
        novaAba.close();
        throw new Error(
          json?.error || "Não foi possível preparar o pagamento da mensalidade."
        );
      }

      if (json.scheduled) {
        novaAba.close();
        setMensagem(
          "A alteração foi programada para o próximo ciclo da assinatura."
        );
        await carregar();
        return;
      }

      if (!json.checkout_url) {
        novaAba.close();
        throw new Error("O checkout da mensalidade não foi retornado.");
      }

      novaAba.location.href = json.checkout_url;
      setMensagem("Checkout aberto em uma nova aba.");
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível preparar o pagamento da mensalidade."
      );
    } finally {
      setPagando(false);
    }
  }

  if (!enabled || !aberto) return null;

  const assinatura = resumo?.subscription;
  const whiteLabel = resumo?.white_label;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pagando) {
          setAberto(false);
        }
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Plano e assinatura White Label"
      >
        <button
          type="button"
          className={styles.close}
          onClick={() => setAberto(false)}
          disabled={pagando}
          aria-label="Fechar"
        >
          <X size={19} />
        </button>

        <div className={styles.header}>
          <span className={styles.icon}>
            <CreditCard size={21} />
          </span>
          <div>
            <span className={styles.eyebrow}>Plano e assinatura</span>
            <h2>White Label</h2>
            <p>
              Acompanhe a mensalidade principal e os adicionais dos seus clientes.
            </p>
          </div>
        </div>

        {carregando ? (
          <div className={styles.loading}>Carregando assinatura...</div>
        ) : erro && !resumo ? (
          <div className={styles.error}>{erro}</div>
        ) : resumo && whiteLabel && assinatura ? (
          <>
            <div className={styles.summary}>
              <div>
                <span>Status</span>
                <strong>{statusLabel(assinatura.status)}</strong>
              </div>
              <div>
                <span>Próximo vencimento</span>
                <strong>{data(assinatura.next_due_at || assinatura.current_period_end)}</strong>
              </div>
              <div className={styles.totalCard}>
                <span>Próxima mensalidade</span>
                <strong>{moeda(whiteLabel.valor_total_centavos)}</strong>
              </div>
            </div>

            <div className={styles.breakdown}>
              <div className={styles.line}>
                <div>
                  <strong>Mensalidade White Label</strong>
                  <span>Valor base contratado</span>
                </div>
                <strong>{moeda(whiteLabel.valor_base_centavos)}</strong>
              </div>

              <div className={styles.line}>
                <div>
                  <strong>Números adicionais</strong>
                  <span>
                    {whiteLabel.numeros_adicionais} ×{" "}
                    {moeda(whiteLabel.preco_numero_adicional_centavos)}
                  </span>
                </div>
                <strong>{moeda(whiteLabel.valor_numeros_adicionais_centavos)}</strong>
              </div>

              <div className={styles.line}>
                <div>
                  <strong>Usuários adicionais</strong>
                  <span>
                    {whiteLabel.usuarios_adicionais} ×{" "}
                    {moeda(whiteLabel.preco_usuario_adicional_centavos)}
                  </span>
                </div>
                <strong>{moeda(whiteLabel.valor_usuarios_adicionais_centavos)}</strong>
              </div>
            </div>

            {mensagem ? <div className={styles.notice}>{mensagem}</div> : null}
            {erro ? <div className={styles.error}>{erro}</div> : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void carregar()}
                disabled={carregando || pagando}
              >
                <RefreshCw size={16} />
                Atualizar
              </button>
              {!assinatura.is_free && whiteLabel.valor_total_centavos > 0 ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void pagarMensalidade()}
                  disabled={pagando}
                >
                  <ExternalLink size={16} />
                  {pagando ? "Preparando..." : "Pagar / renovar mensalidade"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className={styles.error}>
            Não foi possível carregar os dados da assinatura.
          </div>
        )}
      </section>
    </div>
  );
}
