"use client";

import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  CreditCard,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import styles from "./MetaWhatsAppPricingNotice.module.css";

type Props = {
  initialOpen: boolean;
};

export default function MetaWhatsAppPricingNotice({ initialOpen }: Props) {
  const [aberto, setAberto] = useState(initialOpen);
  const [ciente, setCiente] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!aberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto]);

  if (!aberto) return null;

  async function confirmar() {
    if (!ciente || confirmando) return;

    try {
      setConfirmando(true);
      setErro("");

      const response = await fetch(
        "/api/avisos/meta-whatsapp-cobranca-2026-10",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error ||
            "Não foi possível registrar sua confirmação. Tente novamente."
        );
      }

      setAberto(false);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar sua confirmação. Tente novamente."
      );
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="meta-whatsapp-aviso-titulo"
    >
      <div className={styles.modal}>
        <div className={styles.hero}>
          <div className={styles.heroIcon} aria-hidden="true">
            <Megaphone size={28} strokeWidth={1.9} />
          </div>

          <div className={styles.heroContent}>
            <div className={styles.eyebrow}>
              <span>Atualização importante</span>
              <span className={styles.dateBadge}>01/10/2026</span>
            </div>

            <h2 id="meta-whatsapp-aviso-titulo">
              Novas regras de cobrança do WhatsApp a partir de 1º de outubro
            </h2>

            <p>
              A partir de 1º de outubro de 2026, a Meta vai alterar a cobrança de
              mensagens enviadas pela WhatsApp Business Platform. Veja os
              principais pontos antes de continuar.
            </p>
          </div>
        </div>

        <div className={styles.grid}>
          <article className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <BadgeDollarSign size={21} />
            </div>
            <div>
              <strong>1.000 mensagens Service gratuitas</strong>
              <p>
                Cada número terá uma franquia mensal de 1.000 mensagens de
                atendimento enviadas pela API.
              </p>
            </div>
          </article>

          <article className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <CreditCard size={21} />
            </div>
            <div>
              <strong>Forma de pagamento na Meta</strong>
              <p>
                Depois da franquia, a Meta passa a cobrar as mensagens Service.
                Sem forma de pagamento, novos envios podem deixar de ser
                entregues.
              </p>
            </div>
          </article>

          <article className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <Clock3 size={21} />
            </div>
            <div>
              <strong>Templates Utility dentro das 24h</strong>
              <p>
                Templates de Utilidade enviados pela API dentro da janela de
                atendimento também passam a seguir a cobrança da Meta.
              </p>
            </div>
          </article>

          <article className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <ShieldCheck size={21} />
            </div>
            <div>
              <strong>Conversas iniciadas por anúncios</strong>
              <p>
                Anúncios elegíveis da Meta podem continuar oferecendo uma
                janela gratuita de até 72 horas, conforme as regras da
                plataforma.
              </p>
            </div>
          </article>
        </div>

        <div className={styles.note}>
          <CheckCircle2 size={20} aria-hidden="true" />
          <p>
            A janela normal de atendimento de 24 horas continua sendo aberta
            ou renovada quando o cliente envia uma nova mensagem.
          </p>
        </div>

        <div className={styles.footer}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={ciente}
              onChange={(event) => setCiente(event.target.checked)}
              disabled={confirmando}
            />
            <span className={styles.customCheckbox} aria-hidden="true">
              <CheckCircle2 size={16} />
            </span>
            <span>
              Estou ciente das mudanças nas cobranças do WhatsApp Business
              Platform pela Meta.
            </span>
          </label>

          {erro && (
            <div className={styles.error} role="alert">
              {erro}
            </div>
          )}

          <button
            type="button"
            className={styles.confirmButton}
            onClick={confirmar}
            disabled={!ciente || confirmando}
          >
            {confirmando ? "Confirmando..." : "Confirmar e continuar"}
          </button>

          <p className={styles.disclaimer}>
            Este aviso será exibido apenas uma vez para cada usuário
            administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
