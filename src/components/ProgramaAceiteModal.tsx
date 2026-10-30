"use client";

import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  MonitorPlay,
  ShieldCheck,
} from "lucide-react";
import styles from "./MetaWhatsAppPricingNotice.module.css";
import { TEXTO_CONFIRMACAO_PROGRAMA } from "@/lib/lgpd/termos";

type Props = {
  initialOpen: boolean;
  versao: string;
};

export default function ProgramaAceiteModal({ initialOpen, versao }: Props) {
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

  async function confirmar() {
    if (!ciente || confirmando) return;
    setConfirmando(true);
    setErro("");

    try {
      const response = await fetch("/api/contratos/programa/aceite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmado: true, versao }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível registrar sua confirmação.");
      }

      setAberto(false);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar sua confirmação. Tente novamente.",
      );
    } finally {
      setConfirmando(false);
    }
  }

  if (!aberto) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="programa-aceite-titulo"
    >
      <div className={styles.modal}>
        <div className={styles.hero}>
          <div className={styles.heroIcon} aria-hidden="true">
            <BookOpenCheck size={28} strokeWidth={1.9} />
          </div>

          <div className={styles.heroContent}>
            <div className={styles.eyebrow}>
              <span>Atualização contratual</span>
              <span className={styles.dateBadge}>Programas Prosperity</span>
            </div>

            <h2 id="programa-aceite-titulo">
              Ciência e atualização das condições de uso
            </h2>

            <p>
              Estamos esclarecendo as condições dos programas de aprendizagem
              e do acesso à ferramenta CRM Prosperity. Leia os documentos
              atualizados antes de confirmar sua ciência.
            </p>
          </div>
        </div>

        <div className={styles.grid}>
          <article className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <GraduationCap size={22} aria-hidden="true" />
            </div>
            <div>
              <strong>Aprendizado flexível</strong>
              <p>
                Conteúdos predominantemente gravados e orientações conforme
                a necessidade do aluno e a disponibilidade de atendimento,
                sem calendário fixo de aulas ao vivo.
              </p>
            </div>
          </article>

          <article className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <MonitorPlay size={22} aria-hidden="true" />
            </div>
            <div>
              <strong>Aplicação no CRM Prosperity</strong>
              <p>
                O uso operacional da ferramenta e dos recursos incluídos
                segue a modalidade, os limites e o período contratado.
                Adicionais podem ter condições próprias.
              </p>
            </div>
          </article>
        </div>

        <div className={styles.note}>
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            Esta atualização não altera retroativamente o histórico das
            suas compras. Suas condições e direitos anteriores permanecem
            sujeitos ao que foi contratado e à legislação aplicável.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            padding: "0 32px 20px",
          }}
        >
          {[
            { href: "/termos-de-servico", nome: "Termos dos Programas e Uso do CRM" },
            { href: "/politica-de-privacidade", nome: "Política de Privacidade" },
            { href: "/politica-de-mensageria", nome: "Política de Mensageria" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              data-legal-modal-ignore="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--crm-primary)",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {item.nome}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          ))}
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
              {TEXTO_CONFIRMACAO_PROGRAMA}
            </span>
          </label>

          {erro ? <div className={styles.error} role="alert">{erro}</div> : null}

          <button
            type="button"
            className={styles.confirmButton}
            onClick={confirmar}
            disabled={!ciente || confirmando}
          >
            {confirmando ? "Salvando confirmação..." : "Confirmar e continuar"}
          </button>

          <p className={styles.disclaimer}>
            A confirmação será registrada para sua empresa com data, hora,
            usuário responsável e versão dos documentos.
            Em caso de dúvidas ou discordância, contate o suporte antes de aceitar.
          </p>
        </div>
      </div>
    </div>
  );
}
