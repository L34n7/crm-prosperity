"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import styles from "./WhatsAppConnectionTestNotice.module.css";

type IntegracaoPendente = {
  id: string;
  nome_conexao?: string | null;
  numero?: string | null;
  setup_completed_at?: string | null;
  mensagem_integracao_validada?: string | null;
};

type StatusResponse = {
  ok: boolean;
  empresa_id?: string | null;
  pendentes?: IntegracaoPendente[];
};

const whatsappComercial =
  process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || "5531975233266";

const SUPORTE_URL = montarWhatsappUrl(
  "Olá! Concluí o onboarding do WhatsApp no CRM Prosperity, mas a mensagem de teste não chegou ao CRM. Preciso de ajuda para validar a integração."
);

export default function WhatsAppConnectionTestNotice() {
  const [pendentes, setPendentes] = useState<IntegracaoPendente[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const carregarStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/teste-conexao", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) return;

      const data = (await response.json()) as StatusResponse;
      if (!data.ok) return;

      setEmpresaId(data.empresa_id || null);
      setPendentes(data.pendentes || []);
    } catch {
      // O alerta não deve bloquear o uso do CRM em caso de falha temporária.
    }
  }, []);

  useEffect(() => {
    void carregarStatus();
  }, [carregarStatus]);

  useEffect(() => {
    if (!empresaId) return;

    const channel = supabase
      .channel(`whatsapp-integration-validation:${empresaId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "integracoes_whatsapp",
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const registro = payload.new as {
            id?: string;
            mensagem_integracao_validada?: string | null;
          };

          if (!registro.id || !registro.mensagem_integracao_validada) return;

          setPendentes((atuais) =>
            atuais.filter((integracao) => integracao.id !== registro.id)
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [empresaId, supabase]);

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
          <strong>Valide o recebimento de mensagens do WhatsApp</strong>
          <p>
            Envie uma mensagem de outro celular para {integracao.numero || "o número conectado"}.
            Se não chegar, refaça a conexão ou fale com o suporte.
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
            <div className={styles.troubleshooting}>
              <strong>A mensagem não apareceu?</strong>
              <p>
                Confirme o número, desconecte a integração e faça o onboarding novamente.
                Caso o problema persista, entre em contato com o suporte.
              </p>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => setModalAberto(false)}>
                Já enviei mensagem
              </button>
              <Link href="/perfil-whatsapp">Refazer conexão</Link>
              <a
                href={SUPORTE_URL.replace(/phone=[^&]+/, `phone=${whatsappComercial}`)}
                target="_blank"
                rel="noreferrer"
              >
                Falar com suporte
              </a>
            </div>
            <p className={styles.hint}>
              O alerta permanecerá no topo e será removido automaticamente quando o CRM receber a primeira mensagem.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
